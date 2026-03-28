#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

function getArg(flag, fallback = "") {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] || fallback;
}

function readJson(filePath) {
  const abs = path.resolve(process.cwd(), filePath);
  return JSON.parse(fs.readFileSync(abs, "utf8"));
}

function normalizeBoolNullable(value) {
  if (typeof value === "boolean") return value;
  return (
    String(value || "")
      .trim()
      .toLowerCase() === "yes"
  );
}

async function getDbSnapshot(client) {
  const columnsQ = `
    select table_name, column_name, data_type, udt_name, is_nullable
    from information_schema.columns
    where table_schema = 'public'
  `;

  const constraintsQ = `
    select tc.table_name, tc.constraint_name, tc.constraint_type,
           kcu.column_name, ccu.table_name as foreign_table_name, ccu.column_name as foreign_column_name
    from information_schema.table_constraints tc
    left join information_schema.key_column_usage kcu
      on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
    left join information_schema.constraint_column_usage ccu
      on tc.constraint_name = ccu.constraint_name and tc.table_schema = ccu.table_schema
    where tc.table_schema = 'public'
  `;

  const indexesQ = `
    select tablename as table_name, indexname as index_name, indexdef
    from pg_indexes
    where schemaname = 'public'
  `;

  const columnsRes = await client.query(columnsQ);
  const constraintsRes = await client.query(constraintsQ);
  const indexesRes = await client.query(indexesQ);

  return {
    columns: columnsRes.rows,
    constraints: constraintsRes.rows,
    indexes: indexesRes.rows,
  };
}

function buildMaps(snapshot) {
  const columnMap = new Map();
  for (const c of snapshot.columns) {
    columnMap.set(`${c.table_name}.${c.column_name}`, c);
  }

  const constraintNameSet = new Set(snapshot.constraints.map(c => c.constraint_name));

  const fkSet = new Set(
    snapshot.constraints
      .filter(c => c.constraint_type === "FOREIGN KEY" && c.column_name && c.foreign_table_name && c.foreign_column_name)
      .map(c => `${c.table_name}.${c.column_name}->${c.foreign_table_name}.${c.foreign_column_name}`),
  );

  const indexByName = new Map();
  for (const idx of snapshot.indexes) {
    indexByName.set(`${idx.table_name}.${idx.index_name}`, idx);
  }

  return { columnMap, constraintNameSet, fkSet, indexByName };
}

function checkParity(contract, maps) {
  const drifts = [];

  const tables = contract.tables || {};
  for (const [tableName, tableSpec] of Object.entries(tables)) {
    const columns = tableSpec.columns || {};
    for (const [columnName, colSpec] of Object.entries(columns)) {
      const key = `${tableName}.${columnName}`;
      const actual = maps.columnMap.get(key);

      if (!actual) {
        drifts.push(`Missing column: ${key}`);
        continue;
      }

      if (colSpec.udt_name && actual.udt_name !== colSpec.udt_name) {
        drifts.push(`Type mismatch on ${key}. Expected udt_name=${colSpec.udt_name}, got ${actual.udt_name}`);
      }

      if (typeof colSpec.nullable === "boolean") {
        const actualNullable = normalizeBoolNullable(actual.is_nullable);
        if (actualNullable !== colSpec.nullable) {
          drifts.push(`Nullability mismatch on ${key}. Expected nullable=${colSpec.nullable}, got ${actualNullable}`);
        }
      }
    }
  }

  const requiredConstraints = contract.requiredConstraintNames || [];
  for (const constraintName of requiredConstraints) {
    if (!maps.constraintNameSet.has(constraintName)) {
      drifts.push(`Missing constraint: ${constraintName}`);
    }
  }

  const requiredForeignKeys = contract.requiredForeignKeys || [];
  for (const fk of requiredForeignKeys) {
    const signature = `${fk.table}.${fk.column}->${fk.referencesTable}.${fk.referencesColumn}`;
    if (!maps.fkSet.has(signature)) {
      drifts.push(`Missing FK signature: ${signature}`);
    }
  }

  const requiredIndexes = contract.requiredIndexes || [];
  for (const idx of requiredIndexes) {
    const key = `${idx.table}.${idx.name}`;
    const actual = maps.indexByName.get(key);
    if (!actual) {
      drifts.push(`Missing index: ${key}`);
      continue;
    }

    if (idx.mustInclude) {
      const normalizedDef = String(actual.indexdef || "").toLowerCase();
      const requiredDef = String(idx.mustInclude).toLowerCase();
      if (!normalizedDef.includes(requiredDef)) {
        drifts.push(`Index definition mismatch on ${key}. Expected to include: ${idx.mustInclude}`);
      }
    }
  }

  return drifts;
}

async function main() {
  const contractPath = getArg("--contract", "scripts/db-parity-contract.json");
  const contract = readJson(contractPath);

  const connectionString = process.env.DB_PARITY_DATABASE_URL || process.env.DATABASE_URL || process.env.PG_URL || "";

  const clientConfig = connectionString
    ? { connectionString, ssl: { rejectUnauthorized: false } }
    : {
        host: process.env.PG_HOST || "localhost",
        port: Number.parseInt(String(process.env.PG_PORT || "5432"), 10),
        database: process.env.PG_DATABASE || process.env.DB_NAME || process.env.DB_DATABASE,
        user: process.env.PG_USER || process.env.DB_USER,
        password: process.env.PG_PASSWORD || process.env.DB_PASSWORD,
        ssl: String(process.env.PG_SSL || "false").toLowerCase() === "true" ? { rejectUnauthorized: false } : false,
      };

  if (!connectionString && (!clientConfig.database || !clientConfig.user)) {
    console.error("[db-parity] Missing DB_PARITY_DATABASE_URL/DATABASE_URL/PG_URL and PG_* credentials");
    process.exit(1);
  }

  const client = new Client(clientConfig);
  await client.connect();

  try {
    const snapshot = await getDbSnapshot(client);
    const maps = buildMaps(snapshot);
    const drifts = checkParity(contract, maps);

    if (drifts.length > 0) {
      console.error("[db-parity] Drift detected:");
      for (const drift of drifts) {
        console.error(` - ${drift}`);
      }
      process.exit(1);
    }

    console.log("[db-parity] OK. Database schema contract is aligned.");
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error("[db-parity] Fatal error:", err?.message || err);
  process.exit(1);
});
