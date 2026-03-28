#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");

function arg(name, fallback = "") {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] || fallback;
}

function readJson(filePath) {
  const abs = path.resolve(process.cwd(), filePath);
  return JSON.parse(fs.readFileSync(abs, "utf8"));
}

function main() {
  const contractPath = arg("--contract", ".github/governance/env-contract.json");
  const prodPath = arg("--prod", ".tmp_prod_vars.json");
  const stagingPath = arg("--staging", ".tmp_staging_vars.json");

  const contract = readJson(contractPath);
  const prod = readJson(prodPath);
  const staging = readJson(stagingPath);

  const drifts = [];

  const requiredInBoth = contract.requiredInBoth || [];
  for (const key of requiredInBoth) {
    if (!(key in prod)) drifts.push(`Missing in production: ${key}`);
    if (!(key in staging)) drifts.push(`Missing in staging: ${key}`);
  }

  const mustMatch = contract.mustMatch || [];
  for (const key of mustMatch) {
    if (!(key in prod) || !(key in staging)) continue;
    if (String(prod[key]) !== String(staging[key])) {
      drifts.push(`Value drift on ${key}`);
    }
  }

  const forbiddenInProduction = contract.forbiddenInProduction || [];
  for (const key of forbiddenInProduction) {
    if (key in prod) drifts.push(`Forbidden legacy variable present in production: ${key}`);
  }

  const expectedByEnvironment = contract.expectedByEnvironment || {};
  for (const [key, values] of Object.entries(expectedByEnvironment)) {
    if (values.production != null && String(prod[key] || "") !== String(values.production)) {
      drifts.push(`Unexpected production value on ${key}`);
    }
    if (values.staging != null && String(staging[key] || "") !== String(values.staging)) {
      drifts.push(`Unexpected staging value on ${key}`);
    }
  }

  if (drifts.length) {
    console.error("[env-governance] Drift detected:");
    for (const drift of drifts) {
      console.error(` - ${drift}`);
    }
    process.exit(1);
  }

  console.log("[env-governance] OK. Critical staging/production variables are aligned with contract.");
}

main();
