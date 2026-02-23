/**
 * Client-side store usando sessionStorage (para deploy estático, ex.: Vercel).
 * Substitui o backend Express: config, prêmios, partidas, estoque manual.
 */

const KEY_CONFIG = "rb_config";
const KEY_STOCK = "rb_stock";
const KEY_GAMES = "rb_games";
const KEY_MANUAL_STOCK = "rb_manual_stock";

const DEFAULT_CONFIG = {
  timeLimitActive: false,
  timeLimitSeconds: 60,
  stockWithGame: true,
  pointsPerCorrectCard: 3,
  bonusIdealLineup: 20,
  maxScore: 38,
  pointsPerWrongCard: 0
};

function read(key, fallback) {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  sessionStorage.setItem(key, JSON.stringify(value));
}

function toInt(n, def = 0) {
  const v = Number.parseInt(n, 10);
  return Number.isFinite(v) ? v : def;
}

function cleanString(s, max = 60) {
  return String(s ?? "").trim().slice(0, max);
}

function pickAward(prizes, points) {
  const p = toInt(points, 0);
  const candidates = prizes
    .filter((x) => x && toInt(x.stock, 0) > 0 && p >= toInt(x.threshold, 0))
    .sort((a, b) => toInt(b.threshold, 0) - toInt(a.threshold, 0));
  return candidates[0] || null;
}

// --- Config ---
export function getConfig() {
  return { ...DEFAULT_CONFIG, ...read(KEY_CONFIG, {}) };
}

export function saveConfig(data) {
  const current = getConfig();
  const next = {
    timeLimitActive: data.timeLimitActive !== undefined ? !!data.timeLimitActive : current.timeLimitActive,
    timeLimitSeconds: data.timeLimitSeconds !== undefined ? toInt(data.timeLimitSeconds, 60) : current.timeLimitSeconds,
    stockWithGame: data.stockWithGame !== undefined ? !!data.stockWithGame : current.stockWithGame,
    pointsPerCorrectCard: data.pointsPerCorrectCard !== undefined ? Math.max(0, toInt(data.pointsPerCorrectCard, 3)) : current.pointsPerCorrectCard,
    bonusIdealLineup: data.bonusIdealLineup !== undefined ? Math.max(0, toInt(data.bonusIdealLineup, 20)) : current.bonusIdealLineup,
    maxScore: data.maxScore !== undefined ? Math.max(1, toInt(data.maxScore, 38)) : current.maxScore,
    pointsPerWrongCard: data.pointsPerWrongCard !== undefined ? Math.max(0, toInt(data.pointsPerWrongCard, 0)) : (current.pointsPerWrongCard ?? 0)
  };
  write(KEY_CONFIG, next);
  return next;
}

// --- Prêmios (estoque do jogo) ---
export function getStock() {
  const data = read(KEY_STOCK, null);
  if (data && Array.isArray(data.prizes)) return data;
  return { prizes: [], updatedAt: new Date().toISOString() };
}

export function getPrizes() {
  return getStock().prizes;
}

function writeStock(data) {
  const out = { ...data, updatedAt: new Date().toISOString() };
  write(KEY_STOCK, out);
  return out;
}

export function addPrize(body) {
  const data = getStock();
  const id = cleanString(body.id, 30) || crypto.randomUUID().slice(0, 8);
  if (data.prizes.some((p) => p.id === id)) return { ok: false, error: "id já existe" };
  const prize = {
    id,
    name: cleanString(body.name, 60),
    stock: toInt(body.stock, 0),
    threshold: toInt(body.threshold, 0)
  };
  data.prizes.push(prize);
  writeStock(data);
  return { ok: true, prize, updatedAt: data.updatedAt };
}

export function patchPrize(id, body) {
  const data = getStock();
  const idx = data.prizes.findIndex((p) => p.id === id);
  if (idx === -1) return { ok: false, error: "prize não encontrado" };
  const cur = data.prizes[idx];
  if (body.name != null) cur.name = cleanString(body.name, 60);
  if (body.stock != null) cur.stock = toInt(body.stock, cur.stock);
  if (body.threshold != null) cur.threshold = toInt(body.threshold, cur.threshold);
  writeStock(data);
  return { ok: true, prize: cur, updatedAt: data.updatedAt };
}

export function deletePrize(id) {
  const data = getStock();
  const before = data.prizes.length;
  data.prizes = data.prizes.filter((p) => p.id !== id);
  if (data.prizes.length === before) return { ok: false, error: "prize não encontrado" };
  writeStock(data);
  return { ok: true, updatedAt: data.updatedAt };
}

// --- Partidas ---
export function getGames() {
  const raw = read(KEY_GAMES, null);
  return Array.isArray(raw) ? raw : [];
}

export function appendGame(gameRecord) {
  const games = getGames();
  games.push(gameRecord);
  write(KEY_GAMES, games);
  return games;
}

export function getRanking() {
  const games = getGames();
  const options = { timeZone: "America/Sao_Paulo" };
  const todayStr = new Date().toLocaleDateString("pt-BR", options);
  return games
    .filter((g) => g.timestamp && new Date(g.timestamp).toLocaleDateString("pt-BR", options) === todayStr)
    .sort((a, b) => b.points - a.points)
    .slice(0, 50);
}

export function tryAwardPrize(points, { playerName, placedCards, currentProfileKey }) {
  const config = getConfig();
  const stockData = getStock();
  const prize = pickAward(stockData.prizes, points);
  let awardedPrize = null;
  let remainingStock = 0;

  if (prize && config.stockWithGame) {
    const idx = stockData.prizes.findIndex((p) => p.id === prize.id);
    if (idx !== -1) {
      stockData.prizes[idx].stock = Math.max(0, toInt(stockData.prizes[idx].stock, 0) - 1);
      remainingStock = stockData.prizes[idx].stock;
      awardedPrize = { id: prize.id, name: prize.name, threshold: prize.threshold };
      writeStock(stockData);
    }
  } else if (prize) {
    awardedPrize = { id: prize.id, name: prize.name, threshold: prize.threshold };
    remainingStock = toInt(stockData.prizes.find((p) => p.id === prize.id)?.stock, 0);
  }

  const gameRecord = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    playerName: cleanString(playerName, 30),
    profile: cleanString(currentProfileKey, 20),
    points: toInt(points, 0),
    prize: awardedPrize ? awardedPrize.name : null,
    cards: (placedCards || []).map((c) => ({
      assetId: c.asset?.id,
      assetName: c.asset?.name,
      zone: c.zone,
      correct: c.correct,
      x: Math.round(c.x),
      y: Math.round(c.y)
    }))
  };

  appendGame(gameRecord);
  return Promise.resolve({
    ok: true,
    awarded: awardedPrize,
    remainingStock,
    points: gameRecord.points,
    playerName: gameRecord.playerName
  });
}

// --- Estoque manual (brindes) ---
export function getManualStock() {
  const data = read(KEY_MANUAL_STOCK, null);
  if (data && Array.isArray(data.items)) return data.items;
  return [];
}

function getManualStockData() {
  const items = getManualStock();
  return { items: [...items], updatedAt: new Date().toISOString() };
}

function writeManualStock(items) {
  write(KEY_MANUAL_STOCK, { items, updatedAt: new Date().toISOString() });
}

export function addManualItem(body) {
  const name = cleanString(body?.name, 80);
  const quantity = toInt(body?.quantity, 0);
  if (!name) return { ok: false, error: "Nome do item é obrigatório" };
  if (quantity < 0) return { ok: false, error: "Quantidade deve ser >= 0" };
  const items = getManualStock();
  const id = crypto.randomUUID().slice(0, 8);
  const item = { id, name, quantity };
  items.push(item);
  writeManualStock(items);
  return { ok: true, item };
}

export function patchManualItem(id, body) {
  const items = getManualStock();
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) return { ok: false, error: "Item não encontrado" };
  const item = items[idx];
  if (body.name != null) item.name = cleanString(body.name, 80);
  if (body.quantity != null) item.quantity = Math.max(0, toInt(body.quantity, 0));
  writeManualStock(items);
  return { ok: true, item };
}

export function deleteManualItem(id) {
  const items = getManualStock().filter((i) => i.id !== id);
  if (items.length === getManualStock().length) return { ok: false, error: "Item não encontrado" };
  writeManualStock(items);
  return { ok: true };
}

export function withdrawManualItem(id) {
  const items = getManualStock();
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) return { ok: false, error: "Item não encontrado" };
  const item = items[idx];
  const newQty = Math.max(0, toInt(item.quantity, 0) - 1);
  items[idx] = { ...item, quantity: newQty };
  writeManualStock(items);
  return { ok: true, item: items[idx], previousQuantity: toInt(item.quantity, 0) };
}
