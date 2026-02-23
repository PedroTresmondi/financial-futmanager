import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const dist = path.join(root, "dist");

function copyRecursive(src, dest) {
    if (!fs.existsSync(src)) return;
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) {
        const s = path.join(src, name);
        const d = path.join(dest, name);
        if (fs.statSync(s).isDirectory()) copyRecursive(s, d);
        else fs.copyFileSync(s, d);
    }
}

if (!fs.existsSync(dist)) {
    console.error("Pasta dist não encontrada. Execute 'vite build' primeiro.");
    process.exit(1);
}

const stylesSrc = path.join(root, "styles");
if (fs.existsSync(stylesSrc)) {
    copyRecursive(stylesSrc, path.join(dist, "styles"));
    console.log("Copiado: styles -> dist/styles");
}

const assetsSrc = path.join(root, "assets");
if (fs.existsSync(assetsSrc)) {
    copyRecursive(assetsSrc, path.join(dist, "assets"));
    console.log("Copiado: assets -> dist/assets");
}

// cards.json para fetch no deploy estático (Vercel)
const cardsSrc = path.join(root, "src", "cards.json");
if (fs.existsSync(cardsSrc)) {
    fs.copyFileSync(cardsSrc, path.join(dist, "cards.json"));
    console.log("Copiado: src/cards.json -> dist/cards.json");
}
