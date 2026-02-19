import express from "express";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Build do Vite gera em "dist"; em dev o Vite serve o front, então o servidor só precisa da API
const PUBLIC_DIR = path.join(__dirname, "dist");
const DATA_DIR = path.join(__dirname, "data");
const STOCK_FILE = path.join(DATA_DIR, "stock.json");
const GAMES_FILE = path.join(DATA_DIR, "games.json");
const CONFIG_FILE = path.join(DATA_DIR, "config.json");
const MANUAL_STOCK_FILE = path.join(DATA_DIR, "manual-stock.json");

const ADMIN_API_KEY = process.env.ADMIN_API_KEY || "";

// Rate limit simples em memória (por IP)
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_AWARD = 30;
const RATE_LIMIT_MAX_RANKING = 120;
const rateLimitAward = new Map();
const rateLimitRanking = new Map();

function cleanRateLimitMaps() {
    const now = Date.now();
    for (const [ip, t] of rateLimitAward) {
        if (now - t.last > RATE_LIMIT_WINDOW_MS) rateLimitAward.delete(ip);
    }
    for (const [ip, t] of rateLimitRanking) {
        if (now - t.last > RATE_LIMIT_WINDOW_MS) rateLimitRanking.delete(ip);
    }
}
setInterval(cleanRateLimitMaps, 60000);

function checkRateLimit(map, ip, max) {
    const now = Date.now();
    const entry = map.get(ip);
    if (!entry) {
        map.set(ip, { count: 1, last: now });
        return true;
    }
    if (now - entry.last > RATE_LIMIT_WINDOW_MS) {
        entry.count = 1;
        entry.last = now;
        return true;
    }
    if (entry.count >= max) return false;
    entry.count++;
    entry.last = now;
    return true;
}

function requireAdmin(req, res, next) {
    if (!ADMIN_API_KEY) return next();
    const key = req.headers["x-admin-key"] || (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (key !== ADMIN_API_KEY) {
        return res.status(401).json({ ok: false, error: "Não autorizado" });
    }
    next();
}

try {
    await fs.mkdir(DATA_DIR, { recursive: true });
} catch (err) {
    console.error("Erro ao criar pasta data:", err);
}

app.use(express.json({ limit: "5mb" }));
app.use(express.static(PUBLIC_DIR));

function cleanString(s, max = 60) {
    return String(s ?? "").trim().slice(0, max);
}
function toInt(n, def = 0) {
    const v = Number.parseInt(n, 10);
    return Number.isFinite(v) ? v : def;
}
function validatePrizeInput(body, { partial = false } = {}) {
    const err = (m) => ({ ok: false, error: m });
    const has = (k) => Object.prototype.hasOwnProperty.call(body, k);
    if (!partial || has("name")) {
        if (!cleanString(body.name, 60)) return err("name inválido");
    }
    if (!partial || has("stock")) {
        if (toInt(body.stock, -1) < 0) return err("stock inválido");
    }
    if (!partial || has("threshold")) {
        if (toInt(body.threshold, -1) < 0) return err("threshold inválido");
    }
    return { ok: true };
}
function pickAward(prizes, points) {
    const p = toInt(points, 0);
    const candidates = prizes
        .filter((x) => x && toInt(x.stock, 0) > 0 && p >= toInt(x.threshold, 0))
        .sort((a, b) => toInt(b.threshold, 0) - toInt(a.threshold, 0));
    return candidates[0] || null;
}

const DEFAULT_SCORING = {
    pointsPerCorrectCard: 3,
    bonusIdealLineup: 20,
    maxScore: 38
};

async function readConfig() {
    try {
        const raw = await fs.readFile(CONFIG_FILE, "utf-8");
        const data = JSON.parse(raw);
        return {
            timeLimitActive: false,
            timeLimitSeconds: 60,
            stockWithGame: true,
            ...DEFAULT_SCORING,
            ...data
        };
    } catch (e) {
        return {
            timeLimitActive: false,
            timeLimitSeconds: 60,
            stockWithGame: true,
            ...DEFAULT_SCORING
        };
    }
}

async function writeConfig(data) {
    const full = { ...DEFAULT_SCORING, ...data };
    await fs.writeFile(CONFIG_FILE, JSON.stringify(full, null, 2), "utf-8");
    return full;
}

async function readStock() {
    try {
        const raw = await fs.readFile(STOCK_FILE, "utf-8");
        const data = JSON.parse(raw);
        if (!data || !Array.isArray(data.prizes)) throw new Error("Formato inválido");
        return data;
    } catch (e) {
        return { prizes: [], updatedAt: new Date().toISOString() };
    }
}

async function writeStock(data) {
    const out = { ...data, updatedAt: new Date().toISOString() };
    const tmp = STOCK_FILE + ".tmp";
    await fs.writeFile(tmp, JSON.stringify(out, null, 2), "utf-8");
    await fs.rename(tmp, STOCK_FILE);
    return out;
}

async function readGames() {
    try {
        const raw = await fs.readFile(GAMES_FILE, "utf-8");
        const data = JSON.parse(raw);
        if (!Array.isArray(data)) return [];
        return data;
    } catch (e) {
        return [];
    }
}

async function appendGame(gameRecord) {
    const games = await readGames();
    games.push(gameRecord);
    const tmp = GAMES_FILE + ".tmp";
    await fs.writeFile(tmp, JSON.stringify(games, null, 2), "utf-8");
    await fs.rename(tmp, GAMES_FILE);
    return games;
}

async function readManualStock() {
    try {
        const raw = await fs.readFile(MANUAL_STOCK_FILE, "utf-8");
        const data = JSON.parse(raw);
        if (!data || !Array.isArray(data.items)) return { items: [] };
        return data;
    } catch (e) {
        return { items: [] };
    }
}

async function writeManualStock(data) {
    const out = { items: data.items || [], updatedAt: new Date().toISOString() };
    const tmp = MANUAL_STOCK_FILE + ".tmp";
    await fs.writeFile(tmp, JSON.stringify(out, null, 2), "utf-8");
    await fs.rename(tmp, MANUAL_STOCK_FILE);
    return out;
}

app.get("/api/config", async (_req, res) => {
    try {
        const config = await readConfig();
        res.json(config);
    } catch (err) {
        console.error("GET /api/config", err);
        res.status(500).json({ ok: false, error: "Erro ao ler configuração" });
    }
});

app.post("/api/config", requireAdmin, async (req, res) => {
    try {
        const current = await readConfig();
        const newConfig = {
            timeLimitActive: req.body.timeLimitActive !== undefined ? !!req.body.timeLimitActive : current.timeLimitActive,
            timeLimitSeconds: req.body.timeLimitSeconds !== undefined ? toInt(req.body.timeLimitSeconds, 60) : current.timeLimitSeconds,
            stockWithGame: req.body.stockWithGame !== undefined ? !!req.body.stockWithGame : current.stockWithGame,
            pointsPerCorrectCard: req.body.pointsPerCorrectCard !== undefined ? Math.max(0, toInt(req.body.pointsPerCorrectCard, 3)) : current.pointsPerCorrectCard,
            bonusIdealLineup: req.body.bonusIdealLineup !== undefined ? Math.max(0, toInt(req.body.bonusIdealLineup, 20)) : current.bonusIdealLineup,
            maxScore: req.body.maxScore !== undefined ? Math.max(1, toInt(req.body.maxScore, 38)) : current.maxScore
        };
        await writeConfig(newConfig);
        res.json({ ok: true, config: newConfig });
    } catch (err) {
        console.error("POST /api/config", err);
        res.status(500).json({ ok: false, error: "Erro ao salvar configuração" });
    }
});

app.get("/api/prizes", async (_req, res) => {
    try {
        const data = await readStock();
        res.json({ prizes: data.prizes, updatedAt: data.updatedAt });
    } catch (err) {
        console.error("GET /api/prizes", err);
        res.status(500).json({ ok: false, error: "Erro ao listar prêmios" });
    }
});

app.post("/api/prizes", requireAdmin, async (req, res) => {
    try {
        const v = validatePrizeInput(req.body);
        if (!v.ok) return res.status(400).json(v);
        const data = await readStock();
        const id = cleanString(req.body.id, 30) || crypto.randomUUID().slice(0, 8);
        if (data.prizes.some((p) => p.id === id)) return res.status(409).json({ ok: false, error: "id já existe" });
        const prize = {
            id,
            name: cleanString(req.body.name, 60),
            stock: toInt(req.body.stock, 0),
            threshold: toInt(req.body.threshold, 0)
        };
        data.prizes.push(prize);
        const saved = await writeStock(data);
        res.json({ ok: true, prize, updatedAt: saved.updatedAt });
    } catch (err) {
        console.error("POST /api/prizes", err);
        res.status(500).json({ ok: false, error: "Erro ao criar prêmio" });
    }
});

app.patch("/api/prizes/:id", requireAdmin, async (req, res) => {
    try {
        const v = validatePrizeInput(req.body, { partial: true });
        if (!v.ok) return res.status(400).json(v);
        const data = await readStock();
        const idx = data.prizes.findIndex((p) => p.id === req.params.id);
        if (idx === -1) return res.status(404).json({ ok: false, error: "prize não encontrado" });
        const cur = data.prizes[idx];
        if (req.body.name != null) cur.name = cleanString(req.body.name, 60);
        if (req.body.stock != null) cur.stock = toInt(req.body.stock, cur.stock);
        if (req.body.threshold != null) cur.threshold = toInt(req.body.threshold, cur.threshold);
        const saved = await writeStock(data);
        res.json({ ok: true, prize: cur, updatedAt: saved.updatedAt });
    } catch (err) {
        console.error("PATCH /api/prizes/:id", err);
        res.status(500).json({ ok: false, error: "Erro ao atualizar prêmio" });
    }
});

app.get("/api/manual-stock", requireAdmin, async (_req, res) => {
    try {
        const data = await readManualStock();
        res.json({ items: data.items || [] });
    } catch (err) {
        console.error("GET /api/manual-stock", err);
        res.status(500).json({ ok: false, error: "Erro ao listar estoque manual" });
    }
});

app.post("/api/manual-stock", requireAdmin, async (req, res) => {
    try {
        const name = cleanString(req.body?.name, 80);
        const quantity = toInt(req.body?.quantity, 0);
        if (!name) return res.status(400).json({ ok: false, error: "Nome do item é obrigatório" });
        if (quantity < 0) return res.status(400).json({ ok: false, error: "Quantidade deve ser >= 0" });
        const data = await readManualStock();
        const id = crypto.randomUUID().slice(0, 8);
        data.items = data.items || [];
        data.items.push({ id, name, quantity });
        await writeManualStock(data);
        res.json({ ok: true, item: { id, name, quantity } });
    } catch (err) {
        console.error("POST /api/manual-stock", err);
        res.status(500).json({ ok: false, error: "Erro ao adicionar item" });
    }
});

app.patch("/api/manual-stock/:id", requireAdmin, async (req, res) => {
    try {
        const id = req.params.id;
        const data = await readManualStock();
        const idx = (data.items || []).findIndex((i) => i.id === id);
        if (idx === -1) return res.status(404).json({ ok: false, error: "Item não encontrado" });
        const item = data.items[idx];
        if (req.body.name != null) item.name = cleanString(req.body.name, 80);
        if (req.body.quantity != null) item.quantity = Math.max(0, toInt(req.body.quantity, 0));
        await writeManualStock(data);
        res.json({ ok: true, item });
    } catch (err) {
        console.error("PATCH /api/manual-stock/:id", err);
        res.status(500).json({ ok: false, error: "Erro ao atualizar item" });
    }
});

app.delete("/api/manual-stock/:id", requireAdmin, async (req, res) => {
    try {
        const id = req.params.id;
        const data = await readManualStock();
        data.items = (data.items || []).filter((i) => i.id !== id);
        await writeManualStock(data);
        res.json({ ok: true });
    } catch (err) {
        console.error("DELETE /api/manual-stock/:id", err);
        res.status(500).json({ ok: false, error: "Erro ao remover item" });
    }
});

app.post("/api/manual-stock/:id/withdraw", requireAdmin, async (req, res) => {
    try {
        const id = req.params.id;
        const data = await readManualStock();
        const idx = (data.items || []).findIndex((i) => i.id === id);
        if (idx === -1) return res.status(404).json({ ok: false, error: "Item não encontrado" });
        const item = data.items[idx];
        const newQty = Math.max(0, toInt(item.quantity, 0) - 1);
        data.items[idx] = { ...item, quantity: newQty };
        await writeManualStock(data);
        res.json({ ok: true, item: data.items[idx], previousQuantity: toInt(item.quantity, 0) });
    } catch (err) {
        console.error("POST /api/manual-stock/:id/withdraw", err);
        res.status(500).json({ ok: false, error: "Erro ao retirar brinde" });
    }
});

app.delete("/api/prizes/:id", requireAdmin, async (req, res) => {
    try {
        const data = await readStock();
        const before = data.prizes.length;
        data.prizes = data.prizes.filter((p) => p.id !== req.params.id);
        if (data.prizes.length === before) return res.status(404).json({ ok: false, error: "prize não encontrado" });
        const saved = await writeStock(data);
        res.json({ ok: true, updatedAt: saved.updatedAt });
    } catch (err) {
        console.error("DELETE /api/prizes/:id", err);
        res.status(500).json({ ok: false, error: "Erro ao remover prêmio" });
    }
});

app.post("/api/award", async (req, res) => {
    const ip = req.ip || req.socket?.remoteAddress || "unknown";
    if (!checkRateLimit(rateLimitAward, ip, RATE_LIMIT_MAX_AWARD)) {
        return res.status(429).json({ ok: false, error: "Muitas requisições. Tente novamente em instantes." });
    }
    try {
        const points = toInt(req.body?.points, 0);
        const playerName = cleanString(req.body?.playerName, 30);
        const profile = cleanString(req.body?.profile, 20);
        const cards = Array.isArray(req.body?.cards) ? req.body.cards : [];

        const config = await readConfig();
        const stockData = await readStock();
        const prize = pickAward(stockData.prizes, points);
        let awardedPrize = null;
        let remainingStock = 0;

        if (prize && config.stockWithGame) {
            const idx = stockData.prizes.findIndex((p) => p.id === prize.id);
            if (idx !== -1) {
                stockData.prizes[idx].stock = Math.max(0, toInt(stockData.prizes[idx].stock, 0) - 1);
                remainingStock = stockData.prizes[idx].stock;
                awardedPrize = { id: prize.id, name: prize.name, threshold: prize.threshold };
                await writeStock(stockData);
            }
        } else if (prize) {
            awardedPrize = { id: prize.id, name: prize.name, threshold: prize.threshold };
            remainingStock = toInt(stockData.prizes.find((p) => p.id === prize.id)?.stock, 0);
        }

        const gameRecord = {
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            playerName,
            profile,
            points,
            prize: awardedPrize ? awardedPrize.name : null,
            cards
        };

        await appendGame(gameRecord);
        res.json({ ok: true, awarded: awardedPrize, remainingStock, points, playerName });
    } catch (err) {
        console.error("POST /api/award", err);
        res.status(500).json({ ok: false, error: "Erro ao registrar partida" });
    }
});

app.get("/api/ranking", async (req, res) => {
    const ip = req.ip || req.socket?.remoteAddress || "unknown";
    if (!checkRateLimit(rateLimitRanking, ip, RATE_LIMIT_MAX_RANKING)) {
        return res.status(429).json({ ok: false, error: "Muitas requisições." });
    }
    try {
        const games = await readGames();
        const options = { timeZone: "America/Sao_Paulo" };
        const todayStr = new Date().toLocaleDateString("pt-BR", options);

        const dailyRanking = games
            .filter((game) => {
                if (!game.timestamp) return false;
                const gameDate = new Date(game.timestamp).toLocaleDateString("pt-BR", options);
                return gameDate === todayStr;
            })
            .sort((a, b) => b.points - a.points)
            .slice(0, 50);

        res.json(dailyRanking);
    } catch (err) {
        console.error("GET /api/ranking", err);
        res.status(500).json({ ok: false, error: "Erro ao carregar ranking" });
    }
});

app.get("*", async (_req, res) => {
    try {
        const indexPath = path.join(PUBLIC_DIR, "index.html");
        await fs.access(indexPath);
        res.sendFile(indexPath);
    } catch {
        res.status(404).send("Página não encontrada. Execute 'npm run build' e reinicie o servidor.");
    }
});

app.listen(PORT, () => {
    console.log(`Servidor rodando: http://localhost:${PORT}`);
});
