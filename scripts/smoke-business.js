#!/usr/bin/env node
/* eslint-disable no-console */

function env(name, fallback = "") {
  return String(process.env[name] || fallback).trim();
}

const API_BASE_URL = env("API_BASE_URL");
const STAFF_EMAIL = env("SMOKE_STAFF_EMAIL", "emp@email.com");
const STAFF_PASSWORD = env("SMOKE_STAFF_PASSWORD", "123");
const MAX_RETRIES = Number.parseInt(env("SMOKE_MAX_RETRIES", "8"), 10);
const RETRY_DELAY_MS = Number.parseInt(env("SMOKE_RETRY_DELAY_MS", "8000"), 10);

if (!API_BASE_URL) {
  console.error("[smoke] Missing API_BASE_URL");
  process.exit(1);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function requestJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { res, json, text };
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isDiegoRider(item) {
  const haystack = normalize([item?.nombre, item?.apellido, item?.nombre_completo, item?.full_name, item?.name].filter(Boolean).join(" "));
  return haystack.includes("diego") && haystack.includes("reyes");
}

async function runSmokeOnce() {
  const login = await requestJson(`${API_BASE_URL}/api/auth/login/staff`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: STAFF_EMAIL, password: STAFF_PASSWORD }),
  });

  if (!login.res.ok || !login.json?.token) {
    throw new Error(`Login failed: status=${login.res.status} body=${login.text}`);
  }

  const authHeaders = {
    Authorization: `Bearer ${login.json.token}`,
    "Content-Type": "application/json",
  };

  const inv = await requestJson(`${API_BASE_URL}/api/inventory`, {
    headers: authHeaders,
  });
  if (!inv.res.ok || !Array.isArray(inv.json) || inv.json.length === 0) {
    throw new Error(`Inventory list failed: status=${inv.res.status} body=${inv.text}`);
  }

  const first = inv.json.find(item => item?.id_inventario);
  if (!first?.id_inventario) {
    throw new Error("Inventory list returned no id_inventario");
  }

  const inbound = await requestJson(`${API_BASE_URL}/api/inventory/inbound`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      id_inventario: first.id_inventario,
      cantidad: 1,
      motivo: `smoke-governance-${Date.now()}`,
    }),
  });

  if (!(inbound.res.status === 200 || inbound.res.status === 201)) {
    throw new Error(`Inbound create failed: status=${inbound.res.status} body=${inbound.text}`);
  }

  const riders = await requestJson(`${API_BASE_URL}/api/delivery/riders`, {
    headers: authHeaders,
  });
  if (!riders.res.ok || !Array.isArray(riders.json)) {
    throw new Error(`Riders list failed: status=${riders.res.status} body=${riders.text}`);
  }
  if (!riders.json.some(isDiegoRider)) {
    throw new Error("Rider identity check failed: Diego Reyes not found");
  }

  const kpis = await requestJson(`${API_BASE_URL}/api/orders/kpis`, {
    headers: authHeaders,
  });
  if (!kpis.res.ok || typeof kpis.json !== "object" || kpis.json == null) {
    throw new Error(`KPI load failed: status=${kpis.res.status} body=${kpis.text}`);
  }

  console.log(`[smoke] OK inbound=${inbound.res.status} riders=${riders.res.status} kpis=${kpis.res.status} api=${API_BASE_URL}`);
}

async function main() {
  let lastError = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      await runSmokeOnce();
      return;
    } catch (err) {
      lastError = err;
      console.warn(`[smoke] Attempt ${attempt}/${MAX_RETRIES} failed: ${err.message}`);
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS);
      }
    }
  }

  console.error(`[smoke] FAILED after ${MAX_RETRIES} attempts: ${lastError?.message || lastError}`);
  process.exit(1);
}

main().catch(err => {
  console.error("[smoke] Fatal error:", err?.message || err);
  process.exit(1);
});
