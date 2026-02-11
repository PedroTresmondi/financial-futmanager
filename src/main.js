
const PROFILES = {
  CONSERVADOR: { min: 15, max: 35, color: "text-blue-400", label: "Conservador" },
  MODERADO: { min: 36, max: 60, color: "text-yellow-400", label: "Moderado" },
  ARROJADO: { min: 61, max: 100, color: "text-red-500", label: "Arrojado" }
};

const MAX_PLAYERS = 6;
const PLAYER_NAME_KEY = "ffm_player_name";

// ✅ Para passar de 90 com 6 cartas, precisa ser > 15.
// Ex: 20 => máximo 120 (6 corretas)
const SCORE_CORRECT = 20;

const els = {};
let assetsData = [];
let currentProfileKey = null;
let currentProfile = null;

// ✅ agora guardamos rx/ry também (posição relativa)
let placedCards = []; // { id, asset, x, y, rx, ry, zone, correct }
let gameScore = 0;
let playerName = "";

// Drag state
let activeDrag = null;

// Debug mode
let debugMode = false;

// Timer retorno ao início (brinde)
let prizeResetTimer = null;

// ---------- Campo responsivo (tamanho dos cards) ----------
const BASE_CARD_W = 90;
const BASE_CARD_H = 126;

let CARD_SCALE = 1;
let INNER_SCALE = 1;

let CARD_W = BASE_CARD_W;
let CARD_H = BASE_CARD_H;

let fieldResizeObserver = null;

const FALLBACK_ASSETS = [
  { id: 1, name: "Tesouro Selic", type: "Renda Fixa", suitability: 10, retorno: 20, seguranca: 100, desc: "Segurança máxima." },
  { id: 2, name: "CDB Banco", type: "Renda Fixa", suitability: 20, retorno: 30, seguranca: 90, desc: "Garantia FGC." },
  { id: 3, name: "Fundo DI", type: "Fundo", suitability: 25, retorno: 35, seguranca: 85, desc: "Conservador." },
  { id: 4, name: "LCI/LCA", type: "Isento", suitability: 30, retorno: 40, seguranca: 85, desc: "Isento de IR." },
  { id: 5, name: "Debênture", type: "Crédito", suitability: 35, retorno: 45, seguranca: 75, desc: "Dívida privada." },
  { id: 6, name: "Multimercado", type: "Fundo", suitability: 45, retorno: 55, seguranca: 65, desc: "Diversificado." },
  { id: 7, name: "FII Papel", type: "Imobiliário", suitability: 50, retorno: 60, seguranca: 60, desc: "Recebíveis." },
  { id: 8, name: "FII Tijolo", type: "Imobiliário", suitability: 55, retorno: 65, seguranca: 55, desc: "Imóveis físicos." },
  { id: 9, name: "ETF S&P500", type: "Internacional", suitability: 60, retorno: 70, seguranca: 50, desc: "Bolsa EUA." },
  { id: 10, name: "Blue Chips", type: "Ações", suitability: 65, retorno: 75, seguranca: 45, desc: "Grandes empresas." },
  { id: 11, name: "Small Caps", type: "Ações", suitability: 75, retorno: 85, seguranca: 30, desc: "Alto crescimento." },
  { id: 12, name: "Dólar Futuro", type: "Derivativos", suitability: 80, retorno: 80, seguranca: 35, desc: "Câmbio." },
  { id: 13, name: "Bitcoin", type: "Cripto", suitability: 90, retorno: 95, seguranca: 10, desc: "Ouro digital." },
  { id: 14, name: "Altcoins", type: "Cripto", suitability: 95, retorno: 100, seguranca: 5, desc: "Alto risco." },
  { id: 15, name: "Opções", type: "Derivativos", suitability: 100, retorno: 100, seguranca: 0, desc: "Alavancagem." }
];

// ---------- Utils ----------
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function onlySpaces(str) { return !str || !String(str).trim(); }

function normalizeName(raw) {
  const s = String(raw || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 18);
  return s.toUpperCase();
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function zoneFromPoint(centerY, fieldHeight) {
  const zoneHeight = fieldHeight / 3;
  if (centerY < zoneHeight) return "attack";
  if (centerY < zoneHeight * 2) return "midfield";
  return "defense";
}

/**
 * POSIÇÃO CORRETA POR PERFIL
 * (o mesmo ativo pode mudar de zona dependendo do perfil)
 */
function expectedZoneFor(assetSuit, profileKey) {
  if (profileKey === "CONSERVADOR") {
    if (assetSuit <= 25) return "defense";
    if (assetSuit <= 45) return "midfield";
    return "attack";
  }
  if (profileKey === "MODERADO") {
    if (assetSuit <= 35) return "defense";
    if (assetSuit <= 60) return "midfield";
    return "attack";
  }
  // ARROJADO
  if (assetSuit <= 50) return "defense";
  if (assetSuit <= 80) return "midfield";
  return "attack";
}

function zoneFlags(expectedZone) {
  return {
    def: expectedZone === "defense",
    mid: expectedZone === "midfield",
    atk: expectedZone === "attack"
  };
}

// ✅ Modo normal: tudo igual
// ✅ Modo debug: volta a borda por risco (se você tiver CSS de risk-low/med/high)
function getRiskBorderClass(asset) {
  if (!debugMode) return "";
  if (asset.suitability > 70) return "risk-high";
  if (asset.suitability > 40) return "risk-med";
  return "risk-low";
}

// ---------- Campo responsivo: cálculo do tamanho ----------
function getFieldRect() {
  if (!els.fieldLayer) return null;
  const r = els.fieldLayer.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  return r;
}

function computeCardSizeFromField() {
  const rect = getFieldRect();
  if (!rect) return;

  // base do seu layout (max-w 500, max-h 800)
  const scale = clamp(Math.min(rect.width / 500, rect.height / 800), 0.55, 1.15);

  CARD_SCALE = scale;

  // conteúdo só encolhe quando o card encolhe (não cresce em telas grandes)
  INNER_SCALE = Math.min(1, scale);

  CARD_W = Math.round(BASE_CARD_W * scale);
  CARD_H = Math.round(BASE_CARD_H * scale);
}

function storeRelativePosition(card, fieldRect) {
  const denomX = Math.max(1, fieldRect.width - CARD_W);
  const denomY = Math.max(1, fieldRect.height - CARD_H);
  card.rx = clamp(card.x / denomX, 0, 1);
  card.ry = clamp(card.y / denomY, 0, 1);
}

function fieldIsCompact() {
  return INNER_SCALE < 0.72;
}

// Re-render quando alterna compact (evita “estourar” o layout em campos pequenos)
function relayoutPlacedCards() {
  const rect = getFieldRect();
  if (!rect) return;

  const compactNow = fieldIsCompact();

  for (const c of placedCards) {
    // se não tiver rx/ry (cards antigos), cria
    if (typeof c.rx !== "number" || typeof c.ry !== "number") {
      storeRelativePosition(c, rect);
    }

    c.x = clamp(c.rx * (rect.width - CARD_W), 0, rect.width - CARD_W);
    c.y = clamp(c.ry * (rect.height - CARD_H), 0, rect.height - CARD_H);

    const el = document.querySelector(`.field-item[data-id="${c.id}"]`);
    if (!el) continue;

    const wasCompact = el.classList.contains("compact");

    el.style.width = `${CARD_W}px`;
    el.style.height = `${CARD_H}px`;
    el.style.left = `${c.x}px`;
    el.style.top = `${c.y}px`;
    el.style.setProperty("--innerScale", String(INNER_SCALE));
    el.classList.toggle("compact", compactNow);

    // Se mudou o modo (compact <-> normal), re-render do conteúdo
    if (wasCompact !== compactNow) {
      setFieldCardContent(el, c.asset);
      // mantém o X
      ensureCloseButton(el, c.asset);
      // garante debug visuals também
      applyDebugVisualsToElement(el, c.asset);
    }
  }
}

function setupFieldResizeWatcher() {
  const target = document.getElementById("field-container") || els.fieldLayer;
  if (!target) return;

  const apply = () => {
    computeCardSizeFromField();
    relayoutPlacedCards();
  };

  // limpa observer antigo
  if (fieldResizeObserver) {
    try { fieldResizeObserver.disconnect(); } catch (_) { }
    fieldResizeObserver = null;
  }

  apply();

  if ("ResizeObserver" in window) {
    fieldResizeObserver = new ResizeObserver(() => apply());
    fieldResizeObserver.observe(target);
  } else {
    window.addEventListener("resize", apply);
  }
}

// ---------- Player / Debug ----------
function setPlayerName(name) {
  playerName = normalizeName(name);
  if (els.playerName) els.playerName.innerText = playerName || "--";
  try { localStorage.setItem(PLAYER_NAME_KEY, playerName); } catch (_) { }
}

function applyDebugOnlyVisibility() {
  // 👇 isso faz o debug funcionar mesmo se o CSS estiver faltando
  const nodes = document.querySelectorAll(".debug-only");
  nodes.forEach((n) => {
    n.style.display = debugMode ? "" : "none";
  });
}

function applyDebugVisualsToElement(el, asset) {
  // remove classes de risco
  el.classList.remove("risk-low", "risk-med", "risk-high");
  const cls = getRiskBorderClass(asset);
  if (cls) el.classList.add(cls);
}

function refreshCardsDebugVisuals() {
  // sidebar + campo
  const nodes = document.querySelectorAll(".sidebar-item, .field-item");
  nodes.forEach((el) => {
    const id = el.dataset.id;
    const asset = assetsData.find(a => String(a.id) === String(id));
    if (!asset) return;
    applyDebugVisualsToElement(el, asset);
  });
}

function setDebugMode(on) {
  debugMode = !!on;
  document.body.classList.toggle("debug", debugMode);

  if (els.debugBadge) els.debugBadge.classList.toggle("hidden", !debugMode);

  // score só no debug
  if (debugMode && els.scoreVal) els.scoreVal.innerText = String(gameScore);
  if (!debugMode && els.scoreVal) els.scoreVal.innerText = "";

  applyDebugOnlyVisibility();
  refreshCardsDebugVisuals();

  showToast(debugMode ? "DEBUG: ON" : "DEBUG: OFF", "info");
}

function toggleDebug() {
  setDebugMode(!debugMode);
}

// ---------- Score (estado atual do campo) ----------
function recomputeScore() {
  const correctCount = placedCards.reduce((acc, c) => acc + (c.correct ? 1 : 0), 0);
  gameScore = correctCount * SCORE_CORRECT;

  if (debugMode && els.scoreVal) {
    els.scoreVal.innerText = String(gameScore);
  }
}

// ---------- API: Brinde ----------
async function tryAwardPrize(points) {
  try {
    const r = await fetch("/api/award", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerName, points })
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

// ---------- Stars ----------
function getStars(percentage) {
  const starsCount = Math.round((percentage / 100) * 5);
  let html = "";
  for (let i = 0; i < 5; i++) html += `<span class="${i < starsCount ? "" : "star-dim"}">★</span>`;
  return html;
}

// ---------- HTML generators ----------
function createPremiumCardHTML(asset) {
  const exp = expectedZoneFor(asset.suitability, currentProfileKey);
  const flags = zoneFlags(exp);

  return `
    <div class="score-badge">${asset.suitability}</div>

    <div class="flex items-center gap-2 mb-2">
      <div class="text-2xl">🪙</div>
      <div>
        <div class="card-header-title leading-none text-base">${asset.name}</div>
        <div class="text-[10px] text-gray-300 uppercase tracking-widest">${asset.type}</div>
      </div>
    </div>

    <p class="text-[10px] text-gray-300 italic mb-3 border-b border-white/10 pb-2">"${asset.desc}"</p>

    <div class="flex-1 space-y-1">
      <div class="star-row"><span class="star-label">Risco</span><div class="stars">${getStars(asset.suitability)}</div></div>
      <div class="star-row"><span class="star-label">Retorno</span><div class="stars">${getStars(asset.retorno)}</div></div>
      <div class="star-row"><span class="star-label">Segurança</span><div class="stars">${getStars(asset.seguranca)}</div></div>
    </div>

    <!-- DEBUG: mostra posição correta -->
    <div class="debug-only mt-2 pt-2 border-t border-white/10">
      <div class="text-[10px] text-white/70 font-bold uppercase tracking-widest mb-1">Posição correta</div>
      <div class="zone-indicators">
        <span class="zone-box ${flags.def ? "active-def" : ""}">DEF</span>
        <span class="zone-box ${flags.mid ? "active-mid" : ""}">MEI</span>
        <span class="zone-box ${flags.atk ? "active-atk" : ""}">ATQ</span>
      </div>
    </div>
  `;
}

// Conteúdo do card no campo (sem o botão X)
function fieldCardContentHTML(asset) {
  const compact = fieldIsCompact();

  // Quando fica MUITO pequeno, trocar estrelas por barras evita “estouro”
  const statsBlock = compact
    ? `
      <div class="mt-auto space-y-1">
        <div class="compact-bar"><div class="compact-fill" style="width:${asset.suitability}%; background:#fbbf24;"></div></div>
        <div class="compact-bar"><div class="compact-fill" style="width:${asset.retorno}%; background:#3b82f6;"></div></div>
        <div class="compact-bar"><div class="compact-fill" style="width:${asset.seguranca}%; background:#10b981;"></div></div>

        <div class="debug-only zone-indicators pt-1 mt-1 border-t border-slate-700/50">
          ${(() => {
      const exp = expectedZoneFor(asset.suitability, currentProfileKey);
      const flags = zoneFlags(exp);
      return `
              <span class="zone-box ${flags.def ? "active-def" : ""}">D</span>
              <span class="zone-box ${flags.mid ? "active-mid" : ""}">M</span>
              <span class="zone-box ${flags.atk ? "active-atk" : ""}">A</span>
            `;
    })()}
        </div>
      </div>
    `
    : `
      <div class="mt-auto">
        <div class="star-row">
          <span class="star-label">RISCO</span>
          <div class="stars">${getStars(asset.suitability)}</div>
        </div>

        <div class="star-row">
          <span class="star-label">RETORNO</span>
          <div class="stars">${getStars(asset.retorno)}</div>
        </div>

        <div class="star-row">
          <span class="star-label">SEGURANÇA</span>
          <div class="stars">${getStars(asset.seguranca)}</div>
        </div>

        <div class="debug-only zone-indicators pt-1 mt-1 border-t border-slate-700/50">
          ${(() => {
      const exp = expectedZoneFor(asset.suitability, currentProfileKey);
      const flags = zoneFlags(exp);
      return `
              <span class="zone-box ${flags.def ? "active-def" : ""}">D</span>
              <span class="zone-box ${flags.mid ? "active-mid" : ""}">M</span>
              <span class="zone-box ${flags.atk ? "active-atk" : ""}">A</span>
            `;
    })()}
        </div>
      </div>
    `;

  return `
    <div class="field-inner flex flex-col h-full relative z-10 pointer-events-none">
      <div class="flex justify-between items-start mb-1">
        <span class="text-[10px]">🪙</span>
        <span class="text-[8px] font-mono bg-slate-800/80 px-1 rounded text-white border border-white/20">
          ${asset.suitability}
        </span>
      </div>

      <div class="text-center mb-1">
        <div class="font-bold text-[8px] text-white leading-tight font-display mb-0.5 truncate px-1">
          ${asset.name}
        </div>
        <div class="text-[6px] text-slate-300 truncate">${asset.type}</div>
      </div>

      ${compact ? "" : `<div class="field-desc text-slate-300 italic truncate px-1 mb-1">"${asset.desc}"</div>`}

      ${statsBlock}
    </div>
  `;
}

function setFieldCardContent(el, asset) {
  el.innerHTML = fieldCardContentHTML(asset);
  applyDebugOnlyVisibility();
}

function ensureCloseButton(el, asset) {
  let close = el.querySelector(".field-close");
  if (close) return;

  close = document.createElement("div");
  close.className =
    "field-close absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full text-white flex items-center justify-center font-bold text-xs cursor-pointer shadow-md z-50";
  close.innerText = "×";

  close.addEventListener("pointerdown", (e) => e.stopPropagation());
  close.addEventListener("click", (e) => {
    e.stopPropagation();

    const idx = placedCards.findIndex(c => c.id === asset.id);
    if (idx !== -1) placedCards.splice(idx, 1);

    const sidebarItem = document.querySelector(`.sidebar-item[data-id="${asset.id}"]`);
    if (sidebarItem) sidebarItem.classList.remove("hidden");

    el.remove();

    recomputeScore();
    updateStats();
  });

  el.appendChild(close);
}

// ---------- Data loading ----------
async function loadAssets() {
  try {
    const res = await fetch("./cards.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!json || !Array.isArray(json.assets)) throw new Error("Formato inválido em cards.json");
    return json.assets;
  } catch (err) {
    console.warn("[cards.json] Falhou, usando fallback:", err);
    return FALLBACK_ASSETS;
  }
}

// ---------- Name Screen / Virtual Keyboard ----------
function buildVirtualKeyboard() {
  const rows = [
    ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
    ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
    ["Z", "X", "C", "V", "B", "N", "M"]
  ];

  els.vkKeys.innerHTML = "";

  rows.forEach((keys, rowIndex) => {
    const row = document.createElement("div");
    row.className = "vk-row";
    if (rowIndex === 1) row.style.paddingLeft = "10px";
    if (rowIndex === 2) row.style.paddingLeft = "22px";

    keys.forEach(k => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "vk-key";
      btn.dataset.key = k;
      btn.textContent = k;
      row.appendChild(btn);
    });

    els.vkKeys.appendChild(row);
  });

  const rowActions = document.createElement("div");
  rowActions.className = "vk-row";

  const btnBack = document.createElement("button");
  btnBack.type = "button";
  btnBack.className = "vk-key wide danger";
  btnBack.dataset.key = "BACKSPACE";
  btnBack.textContent = "⌫";

  const btnSpace = document.createElement("button");
  btnSpace.type = "button";
  btnSpace.className = "vk-key space";
  btnSpace.dataset.key = "SPACE";
  btnSpace.textContent = "ESPAÇO";

  const btnOk = document.createElement("button");
  btnOk.type = "button";
  btnOk.className = "vk-key wide ok";
  btnOk.dataset.key = "OK";
  btnOk.textContent = "OK";

  rowActions.appendChild(btnBack);
  rowActions.appendChild(btnSpace);
  rowActions.appendChild(btnOk);

  els.vkKeys.appendChild(rowActions);
}

function updateNameUI() {
  const value = normalizeName(els.nameInput.value);
  els.nameInput.value = value;

  const disabled = onlySpaces(value);
  els.startGameBtn.disabled = disabled;

  if (!disabled) els.nameWarning.classList.add("hidden");
}

function applyNameKey(key) {
  let value = els.nameInput.value || "";

  if (key === "BACKSPACE") {
    value = value.slice(0, -1);
  } else if (key === "SPACE") {
    if (!value) return;
    if (value.endsWith(" ")) return;
    value += " ";
  } else if (key === "OK") {
    startGameFromNameScreen();
    return;
  } else {
    if (value.length >= 18) return;
    value += key;
  }

  els.nameInput.value = value;
  updateNameUI();
}

function startGameFromNameScreen() {
  const name = normalizeName(els.nameInput.value);

  if (onlySpaces(name)) {
    els.nameWarning.classList.remove("hidden");
    els.startGameBtn.disabled = true;
    return;
  }

  setPlayerName(name);
  els.nameScreen.classList.add("hidden");

  // garante tamanho correto antes de começar
  computeCardSizeFromField();

  initGame();
}

function initNameScreen() {
  buildVirtualKeyboard();

  // começa limpo (kiosk)
  els.nameInput.value = "";
  updateNameUI();

  els.vkKeys.addEventListener("click", (e) => {
    const btn = e.target?.closest?.("button[data-key]");
    if (!btn) return;
    applyNameKey(btn.dataset.key);
  });

  els.nameClear.addEventListener("click", () => {
    els.nameInput.value = "";
    updateNameUI();
  });

  els.startGameBtn.addEventListener("click", startGameFromNameScreen);

  window.addEventListener("keydown", (e) => {
    if (els.nameScreen.classList.contains("hidden")) return;

    if (e.key === "Enter") { e.preventDefault(); startGameFromNameScreen(); return; }
    if (e.key === "Backspace") { e.preventDefault(); applyNameKey("BACKSPACE"); return; }
    if (e.key === " ") { e.preventDefault(); applyNameKey("SPACE"); return; }

    const ch = e.key;
    if (/^[a-zA-Z0-9]$/.test(ch)) {
      e.preventDefault();
      applyNameKey(ch.toUpperCase());
    }
  }, { passive: false });
}

// ---------- Game lifecycle ----------
function bindEls() {
  // Modal Brinde
  els.prizeModal = document.getElementById("prize-modal");
  els.prizePoints = document.getElementById("prize-points");
  els.prizeStatus = document.getElementById("prize-status");
  els.prizeName = document.getElementById("prize-name");
  els.prizeExtra = document.getElementById("prize-extra");

  // Core
  els.cardsContainer = document.getElementById("cards-container");
  els.fieldLayer = document.getElementById("field-interactive-layer");
  els.profile = document.getElementById("target-profile");
  els.targetRange = document.getElementById("target-range");
  els.playersCount = document.getElementById("players-count");
  els.finishBtn = document.getElementById("finish-btn");

  els.toast = document.getElementById("error-toast");

  // Header
  els.playerName = document.getElementById("player-name");
  els.scoreVal = document.getElementById("score-val");
  els.debugBadge = document.getElementById("debug-badge");

  // Tela de nome
  els.nameScreen = document.getElementById("name-screen");
  els.nameInput = document.getElementById("name-input");
  els.nameWarning = document.getElementById("name-warning");
  els.vkKeys = document.getElementById("vk-keys");
  els.startGameBtn = document.getElementById("start-game-btn");
  els.nameClear = document.getElementById("name-clear");
}

function pickProfile() {
  const keys = Object.keys(PROFILES);
  currentProfileKey = keys[Math.floor(Math.random() * keys.length)];
  currentProfile = PROFILES[currentProfileKey];

  if (els.profile) {
    els.profile.innerText = currentProfile.label;
    els.profile.className = `text-sm font-bold font-display uppercase tracking-widest ${currentProfile.color}`;
  }

  // (normalmente esse range fica debug-only no HTML)
  if (els.targetRange) els.targetRange.innerText = `${currentProfile.min} - ${currentProfile.max}`;
  applyDebugOnlyVisibility();
}

function initGame() {
  // limpa timer
  if (prizeResetTimer) clearTimeout(prizeResetTimer);
  prizeResetTimer = null;

  placedCards = [];
  gameScore = 0;
  if (debugMode && els.scoreVal) els.scoreVal.innerText = "0";
  if (!debugMode && els.scoreVal) els.scoreVal.innerText = "";

  if (els.cardsContainer) els.cardsContainer.innerHTML = "";
  if (els.fieldLayer) els.fieldLayer.innerHTML = "";

  if (els.finishBtn) els.finishBtn.classList.add("hidden");
  if (els.prizeModal) els.prizeModal.classList.add("hidden");

  // garante tamanho correto (caso o campo tenha mudado)
  computeCardSizeFromField();

  pickProfile();
  updateStats();
  renderSidebar();

  // garante estado debug aplicado no conteúdo recém-renderizado
  applyDebugOnlyVisibility();
  refreshCardsDebugVisuals();
}

function renderSidebar() {
  if (!els.cardsContainer) return;
  els.cardsContainer.innerHTML = "";

  const list = shuffleArray([...assetsData]);

  list.forEach(asset => {
    const card = document.createElement("div");
    const riskClass = getRiskBorderClass(asset); // só aparece no debug
    card.className = `premium-card sidebar-item ${riskClass}`.trim();
    card.dataset.id = String(asset.id);
    card.innerHTML = createPremiumCardHTML(asset);

    card.addEventListener("pointerdown", (e) => initDrag(e, asset, card));
    els.cardsContainer.appendChild(card);
  });

  applyDebugOnlyVisibility();
}

// ---------- Drag system ----------
function initDrag(e, asset, originalEl) {
  if (e.pointerType === "mouse" && e.button !== 0) return;
  e.preventDefault();

  // garante tamanho atualizado no momento do drag
  computeCardSizeFromField();

  const ghost = document.createElement("div");
  const borderClass = getRiskBorderClass(asset);

  ghost.className = `field-card ${borderClass} drag-ghost`.trim();
  ghost.style.width = `${CARD_W}px`;
  ghost.style.height = `${CARD_H}px`;
  ghost.style.left = `${e.clientX}px`;
  ghost.style.top = `${e.clientY}px`;
  ghost.style.transform = `translate(-50%, -50%) scale(1.2)`;
  ghost.style.setProperty("--innerScale", String(INNER_SCALE));
  ghost.classList.toggle("compact", fieldIsCompact());
  ghost.innerHTML = fieldCardContentHTML(asset);

  document.body.appendChild(ghost);
  originalEl.classList.add("is-dragging");

  activeDrag = {
    pointerId: e.pointerId,
    asset,
    originalEl,
    ghost,
    lastX: e.clientX
  };

  try { originalEl.setPointerCapture(e.pointerId); } catch (_) { }

  window.addEventListener("pointermove", handleMove, { passive: false });
  window.addEventListener("pointerup", handleEnd, { passive: false });
  window.addEventListener("pointercancel", handleEnd, { passive: false });
}

function handleMove(e) {
  if (!activeDrag) return;
  if (e.pointerId !== activeDrag.pointerId) return;

  e.preventDefault();

  const vx = e.clientX - activeDrag.lastX;
  activeDrag.lastX = e.clientX;

  const rotateDeg = clamp(vx * 1.5, -15, 15);

  activeDrag.ghost.style.left = `${e.clientX}px`;
  activeDrag.ghost.style.top = `${e.clientY}px`;
  activeDrag.ghost.style.transform = `translate(-50%, -50%) scale(1.15) rotate(${rotateDeg}deg)`;
}

function handleEnd(e) {
  if (!activeDrag) return;
  if (e.pointerId !== activeDrag.pointerId) return;

  e.preventDefault();

  window.removeEventListener("pointermove", handleMove);
  window.removeEventListener("pointerup", handleEnd);
  window.removeEventListener("pointercancel", handleEnd);

  const { asset, originalEl, ghost } = activeDrag;

  ghost.remove();
  originalEl.classList.remove("is-dragging");

  processDrop(asset.id, e.clientX, e.clientY, CARD_W / 2, CARD_H / 2);

  activeDrag = null;
}

// ---------- Drop / Placement ----------
function processDrop(assetId, clientX, clientY, offsetX, offsetY) {
  const asset = assetsData.find(a => a.id === assetId);
  if (!asset) return;

  // garante tamanho atualizado pro cálculo
  computeCardSizeFromField();

  const rect = els.fieldLayer.getBoundingClientRect();

  // fora do campo
  if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return;

  let x = clientX - rect.left - offsetX;
  let y = clientY - rect.top - offsetY;

  x = clamp(x, 0, rect.width - CARD_W);
  y = clamp(y, 0, rect.height - CARD_H);

  const existingIndex = placedCards.findIndex(c => c.id === asset.id);

  if (existingIndex === -1 && placedCards.length >= MAX_PLAYERS) {
    showToast("Máximo de 6 jogadores!", "error");
    return;
  }

  if (checkCollision(x, y, asset.id)) {
    showToast("Sem espaço aqui!", "error");
    return;
  }

  // zona onde soltou
  const actualZone = zoneFromPoint(y + (CARD_H / 2), rect.height);

  // zona correta por perfil
  const expected = expectedZoneFor(asset.suitability, currentProfileKey);
  const correct = (actualZone === expected);

  // remove antigo (se existia)
  if (existingIndex !== -1) {
    const oldEl = document.querySelector(`.field-item[data-id="${asset.id}"]`);
    if (oldEl) oldEl.remove();
    placedCards.splice(existingIndex, 1);
  } else {
    // some da sidebar se é novo
    const sidebarItem = document.querySelector(`.sidebar-item[data-id="${asset.id}"]`);
    if (sidebarItem) sidebarItem.classList.add("hidden");
  }

  if (!correct) showToast("Posição errada (não conta)", "warn");
  else showToast("Correto (conta pontos)", "info");

  placeCardOnField(asset, x, y, actualZone, correct);

  // ✅ score acompanha o estado atual
  recomputeScore();
  updateStats();
}

function checkCollision(newX, newY, ignoreId) {
  const margin = 5;
  for (const card of placedCards) {
    if (card.id === ignoreId) continue;

    const hit =
      newX < card.x + CARD_W - margin &&
      newX + CARD_W - margin > card.x &&
      newY < card.y + CARD_H - margin &&
      newY + CARD_H - margin > card.y;

    if (hit) return true;
  }
  return false;
}

function placeCardOnField(asset, x, y, zone, correct) {
  const el = document.createElement("div");
  const borderClass = getRiskBorderClass(asset);

  el.className = `field-card field-item ${borderClass}`.trim();
  el.style.width = `${CARD_W}px`;
  el.style.height = `${CARD_H}px`;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.dataset.id = String(asset.id);

  el.style.setProperty("--innerScale", String(INNER_SCALE));
  el.classList.toggle("compact", fieldIsCompact());

  setFieldCardContent(el, asset);

  // drag no campo
  el.addEventListener("pointerdown", (e) => initDrag(e, asset, el));

  // botão remover
  ensureCloseButton(el, asset);

  els.fieldLayer.appendChild(el);

  // ✅ guarda posição relativa pra resize
  const fieldRect = getFieldRect() || els.fieldLayer.getBoundingClientRect();
  const item = { id: asset.id, asset, x, y, rx: 0, ry: 0, zone, correct };
  storeRelativePosition(item, fieldRect);

  placedCards.push(item);

  applyDebugOnlyVisibility();
  applyDebugVisualsToElement(el, asset);
}

// ---------- UI / Stats ----------
function updateStats() {
  if (!els.playersCount) return;

  els.playersCount.innerText = `${placedCards.length}/6`;

  if (placedCards.length === MAX_PLAYERS) {
    els.playersCount.classList.add("limit-warning");
    if (els.finishBtn) els.finishBtn.classList.remove("hidden");
  } else {
    els.playersCount.classList.remove("limit-warning");
    if (els.finishBtn) els.finishBtn.classList.add("hidden");
  }
}

// ---------- Brinde modal + retorno ----------
function showPrizeModal(awardData, points) {
  if (els.prizePoints) els.prizePoints.innerText = String(points);

  if (!awardData) {
    if (els.prizeStatus) {
      els.prizeStatus.innerText = "Servidor de brindes indisponível";
      els.prizeStatus.className = "text-sm font-bold text-red-300 mb-1";
    }
    if (els.prizeName) els.prizeName.innerText = "--";
    if (els.prizeExtra) els.prizeExtra.innerText = "Verifique se o server.js está rodando.";
    if (els.prizeModal) els.prizeModal.classList.remove("hidden");
    scheduleReturnToStart();
    return;
  }

  if (awardData.awarded) {
    if (els.prizeStatus) {
      els.prizeStatus.innerText = "Parabéns! Você ganhou:";
      els.prizeStatus.className = "text-sm font-bold text-white mb-1";
    }
    if (els.prizeName) els.prizeName.innerText = awardData.awarded.name;

    const remaining = (awardData.remainingStock ?? null);
    const thr = awardData.awarded.threshold ?? null;

    const parts = [];
    if (thr != null) parts.push(`Threshold: ${thr} pts`);
    if (remaining != null) parts.push(`Estoque restante: ${remaining}`);

    if (els.prizeExtra) els.prizeExtra.innerText = parts.join(" • ");
  } else {
    if (els.prizeStatus) {
      els.prizeStatus.innerText = "Sem brinde desta vez";
      els.prizeStatus.className = "text-sm font-bold text-slate-200 mb-1";
    }
    if (els.prizeName) els.prizeName.innerText = "—";
    if (els.prizeExtra) els.prizeExtra.innerText = "Faça mais pontos para atingir um threshold com estoque disponível.";
  }

  if (els.prizeModal) els.prizeModal.classList.remove("hidden");
  scheduleReturnToStart();
}

function scheduleReturnToStart() {
  if (prizeResetTimer) clearTimeout(prizeResetTimer);
  prizeResetTimer = setTimeout(() => {
    returnToStart();
  }, 10000);
}

function returnToStart() {
  if (prizeResetTimer) clearTimeout(prizeResetTimer);
  prizeResetTimer = null;

  // limpa estado
  placedCards = [];
  gameScore = 0;

  // limpa UI
  if (els.cardsContainer) els.cardsContainer.innerHTML = "";
  if (els.fieldLayer) els.fieldLayer.innerHTML = "";
  if (els.finishBtn) els.finishBtn.classList.add("hidden");
  if (els.prizeModal) els.prizeModal.classList.add("hidden");

  // reseta nome e volta pra tela inicial
  setPlayerName("");
  if (els.nameInput) els.nameInput.value = "";
  if (els.nameWarning) els.nameWarning.classList.add("hidden");
  if (els.startGameBtn) els.startGameBtn.disabled = true;
  if (els.nameScreen) els.nameScreen.classList.remove("hidden");

  if (debugMode && els.scoreVal) els.scoreVal.innerText = "0";
  if (!debugMode && els.scoreVal) els.scoreVal.innerText = "";

  // garante recálculo de tamanho
  computeCardSizeFromField();
  relayoutPlacedCards();

  applyDebugOnlyVisibility();
  refreshCardsDebugVisuals();
}

// ---------- Finalize ----------
async function finalizeGame() {
  if (placedCards.length === 0) return;

  // garante score atualizado no momento do OK
  recomputeScore();

  const award = await tryAwardPrize(gameScore);
  showPrizeModal(award, gameScore);
}

// ---------- Toast (DEBUG only) ----------
function showToast(msg, kind = "error") {
  if (!debugMode) return;
  if (!els.toast) return;

  const t = els.toast;

  t.classList.remove("bg-red-500", "bg-amber-500", "bg-emerald-500");
  if (kind === "warn") t.classList.add("bg-amber-500");
  else if (kind === "info") t.classList.add("bg-emerald-500");
  else t.classList.add("bg-red-500");

  t.innerText = msg;
  t.style.opacity = "1";
  t.style.transform = "translate(-50%, 0)";
  t.classList.add("error-anim");

  setTimeout(() => {
    t.style.opacity = "0";
    t.style.transform = "translate(-50%, -20px)";
    t.classList.remove("error-anim");
  }, 1800);
}

// ---------- Boot ----------
document.addEventListener("DOMContentLoaded", async () => {
  bindEls();

  // calcula tamanho e liga watcher do campo
  computeCardSizeFromField();
  setupFieldResizeWatcher();

  // defaults
  setPlayerName("");
  setDebugMode(false);

  if (els.finishBtn) els.finishBtn.addEventListener("click", finalizeGame);

  // tecla P: debug (só quando jogo estiver ativo)
  window.addEventListener("keydown", (e) => {
    if (!els.nameScreen) return;
    if (!els.nameScreen.classList.contains("hidden")) return;

    if (e.key === "p" || e.key === "P") {
      e.preventDefault();
      toggleDebug();
    }
  }, { passive: false });

  assetsData = await loadAssets();
  initNameScreen();

  // suporte a onclick inline do HTML
  window.finalizeGame = finalizeGame;
  window.returnToStart = returnToStart;
});
