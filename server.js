import express from "express";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = path.join(__dirname, "data");
const STOCK_FILE = path.join(DATA_DIR, "stock.json");
const GAMES_FILE = path.join(DATA_DIR, "games.json");
const CONFIG_FILE = path.join(DATA_DIR, "config.json"); // <--- NOVO ARQUIVO

// Garante que a pasta data existe
try {
    await fs.mkdir(DATA_DIR, { recursive: true });
} catch (err) {
    console.error("Erro ao criar pasta data:", err);
}

app.use(express.json({ limit: "5mb" }));
app.use(express.static(PUBLIC_DIR));

// ---------- HELPERS DE ARQUIVO ----------

// Configuração (Tempo de Jogo)
async function readConfig() {
    try {
        const raw = await fs.readFile(CONFIG_FILE, "utf-8");
        return JSON.parse(raw);
    } catch (e) {
        // Default: Timer desativado, 60 segundos
        return { timeLimitActive: false, timeLimitSeconds: 60 };
    }
}

async function writeConfig(data) {
    await fs.writeFile(CONFIG_FILE, JSON.stringify(data, null, 2), "utf-8");
    return data;
}

// ... (Mantenha as funções readStock, writeStock, readGames, appendGame iguais ao anterior) ...
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

// ... (Mantenha as validações e utils iguais) ...
function cleanString(s, max = 60) { return String(s ?? "").trim().slice(0, max); }
function toInt(n, def = 0) { const v = Number.parseInt(n, 10); return Number.isFinite(v) ? v : def; }
function validatePrizeInput(body, { partial = false } = {}) {
    const err = (m) => ({ ok: false, error: m });
    const has = (k) => Object.prototype.hasOwnProperty.call(body, k);
    if (!partial || has("name")) { if (!cleanString(body.name, 60)) return err("name inválido"); }
    if (!partial || has("stock")) { if (toInt(body.stock, -1) < 0) return err("stock inválido"); }
    if (!partial || has("threshold")) { if (toInt(body.threshold, -1) < 0) return err("threshold inválido"); }
    return { ok: true };
}
function pickAward(prizes, points) {
    const p = toInt(points, 0);
    const candidates = prizes
        .filter((x) => x && toInt(x.stock, 0) > 0 && p >= toInt(x.threshold, 0))
        .sort((a, b) => toInt(b.threshold, 0) - toInt(a.threshold, 0));
    return candidates[0] || null;
}

// ---------- API ROUTES ----------

// 4. ROTA DE CONFIGURAÇÃO (NOVO)
app.get("/api/config", async (req, res) => {
    const config = await readConfig();
    res.json(config);
});

app.post("/api/config", async (req, res) => {
    const { timeLimitActive, timeLimitSeconds } = req.body;
    const newConfig = {
        timeLimitActive: !!timeLimitActive,
        timeLimitSeconds: toInt(timeLimitSeconds, 60)
    };
    await writeConfig(newConfig);
    res.json({ ok: true, config: newConfig });
});


// ... (Mantenha as rotas de Prizes e Ranking iguais) ...
app.get("/api/prizes", async (_req, res) => {
    const data = await readStock();
    res.json({ prizes: data.prizes, updatedAt: data.updatedAt });
});

app.post("/api/prizes", async (req, res) => {
    const v = validatePrizeInput(req.body);
    if (!v.ok) return res.status(400).json(v);
    const data = await readStock();
    const id = cleanString(req.body.id, 30) || crypto.randomUUID().slice(0, 8);
    if (data.prizes.some((p) => p.id === id)) return res.status(409).json({ ok: false, error: "id já existe" });
    const prize = { id, name: cleanString(req.body.name, 60), stock: toInt(req.body.stock, 0), threshold: toInt(req.body.threshold, 0) };
    data.prizes.push(prize);
    const saved = await writeStock(data);
    res.json({ ok: true, prize, updatedAt: saved.updatedAt });
});

app.patch("/api/prizes/:id", async (req, res) => {
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
});

app.delete("/api/prizes/:id", async (req, res) => {
    const data = await readStock();
    const before = data.prizes.length;
    data.prizes = data.prizes.filter((p) => p.id !== req.params.id);
    if (data.prizes.length === before) return res.status(404).json({ ok: false, error: "prize não encontrado" });
    const saved = await writeStock(data);
    res.json({ ok: true, updatedAt: saved.updatedAt });
});

// Finalização do jogo
app.post("/api/award", async (req, res) => {
    const points = toInt(req.body?.points, 0);
    const playerName = cleanString(req.body?.playerName, 30);
    const profile = cleanString(req.body?.profile, 20);
    const cards = Array.isArray(req.body?.cards) ? req.body.cards : [];

    const stockData = await readStock();
    const prize = pickAward(stockData.prizes, points);
    let awardedPrize = null;
    let remainingStock = 0;

    if (prize) {
        const idx = stockData.prizes.findIndex((p) => p.id === prize.id);
        if (idx !== -1) {
            stockData.prizes[idx].stock = Math.max(0, toInt(stockData.prizes[idx].stock, 0) - 1);
            remainingStock = stockData.prizes[idx].stock;
            awardedPrize = { id: prize.id, name: prize.name, threshold: prize.threshold };
            await writeStock(stockData);
        }
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
});

// Ranking do Dia
app.get("/api/ranking", async (req, res) => {
    const games = await readGames();
    const options = { timeZone: "America/Sao_Paulo" };
    const todayStr = new Date().toLocaleDateString("pt-BR", options);

    const dailyRanking = games
        .filter(game => {
            if (!game.timestamp) return false;
            const gameDate = new Date(game.timestamp).toLocaleDateString("pt-BR", options);
            return gameDate === todayStr;
        })
        .sort((a, b) => b.points - a.points)
        .slice(0, 50);

    res.json(dailyRanking);
});

// Fallback
app.get("*", async (_req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

app.listen(PORT, () => {
    console.log(`Servidor rodando: http://localhost:${PORT}`);
});