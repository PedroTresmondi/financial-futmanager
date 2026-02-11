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
const DATA_FILE = path.join(__dirname, "data", "stock.json");

app.use(express.json({ limit: "1mb" }));
app.use(express.static(PUBLIC_DIR));

// ---------- helpers ----------
async function readStock() {
    try {
        const raw = await fs.readFile(DATA_FILE, "utf-8");
        const data = JSON.parse(raw);
        if (!data || !Array.isArray(data.prizes)) throw new Error("Formato inválido");
        return data;
    } catch (e) {
        // fallback seguro
        return { prizes: [], updatedAt: new Date().toISOString() };
    }
}

async function writeStock(data) {
    const out = { ...data, updatedAt: new Date().toISOString() };
    const tmp = DATA_FILE + ".tmp";
    await fs.writeFile(tmp, JSON.stringify(out, null, 2), "utf-8");
    await fs.rename(tmp, DATA_FILE);
    return out;
}

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
        const name = cleanString(body.name, 60);
        if (!name) return err("name inválido");
    }

    if (!partial || has("stock")) {
        const stock = toInt(body.stock, NaN);
        if (!Number.isFinite(stock) || stock < 0) return err("stock inválido");
    }

    if (!partial || has("threshold")) {
        const threshold = toInt(body.threshold, NaN);
        if (!Number.isFinite(threshold) || threshold < 0) return err("threshold inválido");
    }

    return { ok: true };
}

function pickAward(prizes, points) {
    const p = toInt(points, 0);

    // maior threshold primeiro (melhor prêmio)
    const candidates = prizes
        .filter((x) => x && toInt(x.stock, 0) > 0 && p >= toInt(x.threshold, 0))
        .sort((a, b) => toInt(b.threshold, 0) - toInt(a.threshold, 0));

    return candidates[0] || null;
}

// ---------- API ----------
app.get("/api/prizes", async (_req, res) => {
    const data = await readStock();
    res.json({ prizes: data.prizes, updatedAt: data.updatedAt });
});

app.post("/api/prizes", async (req, res) => {
    const v = validatePrizeInput(req.body);
    if (!v.ok) return res.status(400).json(v);

    const data = await readStock();

    const id = cleanString(req.body.id, 30) || crypto.randomUUID().slice(0, 8);
    if (data.prizes.some((p) => p.id === id)) {
        return res.status(409).json({ ok: false, error: "id já existe" });
    }

    const prize = {
        id,
        name: cleanString(req.body.name, 60),
        stock: toInt(req.body.stock, 0),
        threshold: toInt(req.body.threshold, 0)
    };

    data.prizes.push(prize);
    const saved = await writeStock(data);
    res.json({ ok: true, prize, updatedAt: saved.updatedAt });
});

app.patch("/api/prizes/:id", async (req, res) => {
    const v = validatePrizeInput(req.body, { partial: true });
    if (!v.ok) return res.status(400).json(v);

    const data = await readStock();
    const id = req.params.id;

    const idx = data.prizes.findIndex((p) => p.id === id);
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
    const id = req.params.id;

    const before = data.prizes.length;
    data.prizes = data.prizes.filter((p) => p.id !== id);

    if (data.prizes.length === before) return res.status(404).json({ ok: false, error: "prize não encontrado" });

    const saved = await writeStock(data);
    res.json({ ok: true, updatedAt: saved.updatedAt });
});

app.post("/api/award", async (req, res) => {
    const points = toInt(req.body?.points, 0);
    const playerName = cleanString(req.body?.playerName, 30);

    const data = await readStock();
    const prize = pickAward(data.prizes, points);

    if (!prize) {
        return res.json({ ok: true, awarded: null, points, playerName });
    }

    // decrementa estoque e salva
    const idx = data.prizes.findIndex((p) => p.id === prize.id);
    if (idx !== -1) data.prizes[idx].stock = Math.max(0, toInt(data.prizes[idx].stock, 0) - 1);

    const saved = await writeStock(data);

    res.json({
        ok: true,
        awarded: { id: prize.id, name: prize.name, threshold: prize.threshold },
        remainingStock: data.prizes[idx]?.stock ?? 0,
        points,
        playerName,
        updatedAt: saved.updatedAt
    });
});

// fallback: serve index.html em rotas desconhecidas (opcional)
app.get("*", async (_req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

app.listen(PORT, () => {
    console.log(`Servidor rodando: http://localhost:${PORT}`);
});
