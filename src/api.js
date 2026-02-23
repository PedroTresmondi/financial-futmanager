/**
 * API do app: usa sessionStorage (store) ou backend Express conforme VITE_USE_SERVER.
 * - Vercel / build sem variável → sessionStorage (deploy estático).
 * - VITE_USE_SERVER=true → fetch para server.js (dev com backend).
 */

const useServer = import.meta.env.VITE_USE_SERVER === "true";
const adminKey = import.meta.env.VITE_ADMIN_KEY || "";

function adminHeaders() {
  const h = { "Content-Type": "application/json" };
  if (adminKey) h["x-admin-key"] = adminKey;
  return h;
}

async function apiGet(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(path, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify(body ?? {})
  });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  return res.json();
}

async function apiPatch(path, body) {
  const res = await fetch(path, {
    method: "PATCH",
    headers: adminHeaders(),
    body: JSON.stringify(body ?? {})
  });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  return res.json();
}

async function apiDelete(path) {
  const res = await fetch(path, { method: "DELETE", headers: adminHeaders() });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  if (res.status === 204 || res.headers.get("content-length") === "0") return undefined;
  return res.json();
}

// --- Implementação via server (fetch) ---
async function loadAssetsServer() {
  const paths = ["./cards.json", "/cards.json", "/src/cards.json", "src/cards.json"];
  for (const p of paths) {
    try {
      const res = await fetch(p, { cache: "no-store" });
      if (!res.ok) continue;
      const json = await res.json();
      const list = json.assets || json;
      if (Array.isArray(list) && list.length > 0) return list;
    } catch (_) {
      continue;
    }
  }
  return [];
}

async function getConfigServer() {
  return apiGet("/api/config");
}

async function saveConfigServer(data) {
  const r = await apiPost("/api/config", data);
  return r.config ?? data;
}

async function getRankingServer() {
  return apiGet("/api/ranking");
}

async function getPrizesServer() {
  const r = await apiGet("/api/prizes");
  return { prizes: r.prizes ?? [] };
}

async function addPrizeServer(body) {
  return apiPost("/api/prizes", body);
}

async function patchPrizeServer(id, body) {
  return apiPatch(`/api/prizes/${encodeURIComponent(id)}`, body);
}

async function deletePrizeServer(id) {
  return apiDelete(`/api/prizes/${encodeURIComponent(id)}`);
}

async function getGamesServer() {
  const r = await apiGet("/api/admin/games");
  return { games: r.games ?? [], total: (r.games ?? []).length };
}

async function getManualStockServer() {
  const r = await apiGet("/api/manual-stock");
  return { items: r.items ?? [] };
}

async function addManualItemServer(body) {
  return apiPost("/api/manual-stock", body);
}

async function withdrawManualItemServer(id) {
  return apiPost(`/api/manual-stock/${encodeURIComponent(id)}/withdraw`, {});
}

async function deleteManualItemServer(id) {
  return apiDelete(`/api/manual-stock/${encodeURIComponent(id)}`);
}

async function tryAwardPrizeServer(points, opts) {
  const r = await fetch("/api/award", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      points,
      playerName: opts?.playerName,
      profile: opts?.profile,
      cards: opts?.cards
    })
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    return { ok: false, error: err.error || `HTTP ${r.status}` };
  }
  const data = await r.json();
  return {
    ok: true,
    awarded: data.awarded ?? null,
    remainingStock: data.remainingStock,
    points: data.points,
    playerName: data.playerName
  };
}

// --- Implementação via store (sessionStorage) ---
import * as store from "./store.js";

const CARDS_JSON_PATH = "./cards.json";

export async function loadAssets() {
  if (useServer) return loadAssetsServer();
  const paths = [CARDS_JSON_PATH, "/src/cards.json", "src/cards.json"];
  for (const path of paths) {
    try {
      const res = await fetch(path, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const list = json.assets || json;
      if (Array.isArray(list) && list.length > 0) return list;
    } catch (_) {
      continue;
    }
  }
  console.warn("loadAssets: não foi possível carregar cards.json.");
  return [];
}

export async function tryAwardPrize(points, opts) {
  if (useServer) return tryAwardPrizeServer(points, opts);
  return store.tryAwardPrize(points, opts);
}

export async function getConfig() {
  if (useServer) return getConfigServer();
  return Promise.resolve(store.getConfig());
}

export function saveConfig(data) {
  if (useServer) return saveConfigServer(data);
  return Promise.resolve(store.saveConfig(data));
}

export async function getRanking() {
  if (useServer) return getRankingServer();
  return Promise.resolve(store.getRanking());
}

export function getPrizes() {
  if (useServer) return getPrizesServer();
  return Promise.resolve({ prizes: store.getPrizes() });
}

export function addPrize(body) {
  if (useServer) return addPrizeServer(body);
  return Promise.resolve(store.addPrize(body));
}

export function patchPrize(id, body) {
  if (useServer) return patchPrizeServer(id, body);
  return Promise.resolve(store.patchPrize(id, body));
}

export function deletePrize(id) {
  if (useServer) return deletePrizeServer(id);
  return Promise.resolve(store.deletePrize(id));
}

export function getGames() {
  if (useServer) return getGamesServer();
  return Promise.resolve({ games: store.getGames(), total: store.getGames().length });
}

export function getManualStock() {
  if (useServer) return getManualStockServer();
  return Promise.resolve({ items: store.getManualStock() });
}

export function addManualItem(body) {
  if (useServer) return addManualItemServer(body);
  return Promise.resolve(store.addManualItem(body));
}

export function withdrawManualItem(id) {
  if (useServer) return withdrawManualItemServer(id);
  return Promise.resolve(store.withdrawManualItem(id));
}

export function deleteManualItem(id) {
  if (useServer) return deleteManualItemServer(id);
  return Promise.resolve(store.deleteManualItem(id));
}
