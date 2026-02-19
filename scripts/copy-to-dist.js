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

// Páginas HTML e scripts do admin / estoque manual (não entram no build do Vite)
for (const name of ["admin.html", "estoque-manual.html"]) {
    const src = path.join(root, name);
    if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(dist, name));
        console.log(`Copiado: ${name} -> dist/`);
    }
}
const srcDir = path.join(root, "src");
const distSrc = path.join(dist, "src");
if (fs.existsSync(srcDir)) {
    fs.mkdirSync(distSrc, { recursive: true });
    for (const name of ["admin.js", "estoque-manual.js"]) {
        const src = path.join(srcDir, name);
        if (fs.existsSync(src)) {
            fs.copyFileSync(src, path.join(distSrc, name));
            console.log(`Copiado: src/${name} -> dist/src/`);
        }
    }
}

// Fallbacks: copiar assets existentes para nomes esperados pela UI (evita 404 no deploy)
function fallbackCopy(distDir, fromFile, toFile) {
    const from = path.join(dist, distDir, fromFile);
    const to = path.join(dist, distDir, toFile);
    if (fs.existsSync(from) && !fs.existsSync(to)) {
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.copyFileSync(from, to);
        console.log(`Fallback: ${distDir}/${fromFile} -> ${toFile}`);
    }
}
const distLogos = "assets/logos";
const distIcons = "assets/icons";
const distBg = "assets/backgrounds";
fallbackCopy(distLogos, "game-logo.png", "logo-rio-bravo.png");
fallbackCopy(distLogos, "game-logo-alt.png", "logo-rio-bravo-alt.png");
fallbackCopy(distIcons, "icon-profile.png", "icon-asset.png");
fallbackCopy(distIcons, "icon-profile.png", "help-emoji.png");
fallbackCopy(distIcons, "icon-profile.png", "cancel-emoji.png");
fallbackCopy(distIcons, "icon-profile.png", "profile-conservador.png");
fallbackCopy(distIcons, "icon-profile.png", "medal.png");
fallbackCopy(distIcons, "icon-profile.png", "trophy-gold.png");
fallbackCopy(distIcons, "icon-profile.png", "trophy-silver.png");
fallbackCopy(distIcons, "icon-profile.png", "trophy-bronze.png");
fallbackCopy(distBg, "card-credito.png", "card.png");
fallbackCopy(distBg, "perfil-conservador.png", "profile-conservador.png");
fallbackCopy(distBg, "fundo-idle.png", "field-game.png");
