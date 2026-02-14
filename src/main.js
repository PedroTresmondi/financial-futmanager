const PROFILES = {
  CONSERVADOR: { min: 15, max: 35, color: "text-blue-400", label: "Conservador" },
  MODERADO: { min: 36, max: 60, color: "text-yellow-400", label: "Moderado" },
  ARROJADO: { min: 61, max: 100, color: "text-red-500", label: "Arrojado" }
};

const MAX_PLAYERS = 6;
const PLAYER_NAME_KEY = "ffm_player_name";
const SCORE_CORRECT = 100;

const els = {};
// Elementos das novas telas de fluxo
const flowEls = {};

// Mapa de Telas para a Máquina de Estados
const SCREENS = {
  idle: null,
  name: null,
  terms: null,
  instructions: null,
  profileModal: null,
  countdown: null,
  game: null,
  ranking: null,
  endSplash: null,
  summaryOverlay: null // Novo nome para a tela de resumo transparente
};

let assetsData = [];
let currentProfileKey = null;
let currentProfile = null;

let placedCards = [];
let gameScore = 0;
let playerName = "";

// Drag state
let activeDrag = null;

// Debug mode
let debugMode = false;

// Timers de fluxo
let prizeResetTimer = null; 

// Timer da Partida
let matchTimerInterval = null;
let matchTimeRemaining = 0;
let matchTimeConfig = { active: false, seconds: 60 };
let isTimerPaused = false;

// ---------- Campo responsivo ----------
const BASE_CARD_W = 90;
const BASE_CARD_H = 126;

let CARD_SCALE = 1;
let INNER_SCALE = 1;

let CARD_W = BASE_CARD_W;
let CARD_H = BASE_CARD_H;

let fieldResizeObserver = null;

// FALLBACK
const FALLBACK_ASSETS = [
  { "id": 1, "name": "Tesouro Selic", "type": "Renda Fixa", "suitability": 10, "retorno": 15, "seguranca": 100, "desc": "Segurança máxima. Ideal para reservas." },
  { "id": 2, "name": "CDB Banco", "type": "Renda Fixa", "suitability": 20, "retorno": 25, "seguranca": 90, "desc": "Garantia FGC. Retorno superior à poupança." },
  { "id": 3, "name": "Fundo DI", "type": "Fundo", "suitability": 25, "retorno": 30, "seguranca": 85, "desc": "Carteira diversificada em renda fixa." },
  { "id": 4, "name": "LCI / LCA", "type": "Isento", "suitability": 30, "retorno": 35, "seguranca": 85, "desc": "Isento de IR. Setor imobiliário/agro." },
  { "id": 5, "name": "Debênture", "type": "Crédito", "suitability": 40, "retorno": 45, "seguranca": 70, "desc": "Dívida de empresas privadas." },
  { "id": 6, "name": "Multimercado", "type": "Fundo", "suitability": 50, "retorno": 55, "seguranca": 60, "desc": "Mistura renda fixa, ações e câmbio." },
  { "id": 7, "name": "FII Papel", "type": "Imobiliário", "suitability": 55, "retorno": 60, "seguranca": 55, "desc": "Fundo de recebíveis (CRIs). Isento de IR." },
  { "id": 8, "name": "FII Tijolo", "type": "Imobiliário", "suitability": 60, "retorno": 65, "seguranca": 50, "desc": "Imóveis físicos: shoppings e galpões." },
  { "id": 9, "name": "ETF S&P500", "type": "Internacional", "suitability": 65, "retorno": 70, "seguranca": 50, "desc": "As 500 maiores empresas dos EUA." },
  { "id": 10, "name": "Ações Blue Chips", "type": "Ações", "suitability": 70, "retorno": 75, "seguranca": 45, "desc": "Grandes empresas consolidadas na Bolsa." },
  { "id": 11, "name": "Small Caps", "type": "Ações", "suitability": 80, "retorno": 85, "seguranca": 30, "desc": "Empresas menores com alto potencial." },
  { "id": 12, "name": "Dólar Futuro", "type": "Derivativos", "suitability": 85, "retorno": 80, "seguranca": 30, "desc": "Especulação com variação cambial." },
  { "id": 13, "name": "Bitcoin", "type": "Cripto", "suitability": 90, "retorno": 95, "seguranca": 20, "desc": "Ouro digital, descentralizado e escasso." },
  { "id": 14, "name": "Altcoins", "type": "Cripto", "suitability": 95, "retorno": 100, "seguranca": 10, "desc": "Criptos alternativas. Risco extremo." },
  { "id": 15, "name": "Opções", "type": "Derivativos", "suitability": 100, "retorno": 100, "seguranca": 5, "desc": "Alavancagem máxima. Risco total." }
];

// ---------- Utils ----------
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function onlySpaces(str) { return !str || !String(str).trim(); }

function normalizeName(raw) {
  const s = String(raw || "").replace(/\s+/g, " ").trim().slice(0, 18);
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

function getRiskBorderClass(asset) {
  if (!debugMode) return "";
  if (asset.suitability > 70) return "risk-high";
  if (asset.suitability > 40) return "risk-med";
  return "risk-low";
}

// ---------- Gestão de Telas (FLOW) ----------
function showScreen(screenKey) {
  // O jogo (game-root) nunca deve receber "hidden" via classe se estivermos no fluxo de resumo
  // Pois o resumo agora É o jogo com um overlay.

  Object.values(SCREENS).forEach(el => {
    // Não esconde o game-root
    if (el && el.id !== 'game-root') el.classList.add('hidden');
  });

  if (screenKey && SCREENS[screenKey]) {
    SCREENS[screenKey].classList.remove('hidden');
  }
}

// ---------- Campo responsivo ----------
function getFieldRect() {
  if (!els.fieldLayer) return null;
  const r = els.fieldLayer.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  return r;
}

function computeCardSizeFromField() {
  const rect = getFieldRect();
  if (!rect) return;
  const scale = clamp(Math.min(rect.width / 500, rect.height / 800), 0.55, 1.15);
  CARD_SCALE = scale;
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

function relayoutPlacedCards() {
  const rect = getFieldRect();
  if (!rect) return;
  const compactNow = fieldIsCompact();
  for (const c of placedCards) {
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
    if (wasCompact !== compactNow) {
      setFieldCardContent(el, c.asset);
      ensureCloseButton(el, c.asset);
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
  const nodes = document.querySelectorAll(".debug-only");
  nodes.forEach((n) => {
    n.style.display = debugMode ? "" : "none";
  });
}

function applyDebugVisualsToElement(el, asset) {
  el.classList.remove("risk-low", "risk-med", "risk-high");
  const cls = getRiskBorderClass(asset);
  if (cls) el.classList.add(cls);
}

function refreshCardsDebugVisuals() {
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
  if (debugMode && els.scoreVal) els.scoreVal.innerText = String(gameScore);
  if (!debugMode && els.scoreVal) els.scoreVal.innerText = "";
  applyDebugOnlyVisibility();
  refreshCardsDebugVisuals();
  showToast(debugMode ? "DEBUG: ON" : "DEBUG: OFF", "info");
}

function toggleDebug() {
  setDebugMode(!debugMode);
}

function recomputeScore() {
  const correctCount = placedCards.reduce((acc, c) => acc + (c.correct ? 1 : 0), 0);
  const baseScore = correctCount * SCORE_CORRECT;
  gameScore = baseScore; 
  if (debugMode && els.scoreVal) {
    els.scoreVal.innerText = String(gameScore);
  }
}

// ---------- API ----------

async function tryAwardPrize(points) {
  try {
    const cardsSummary = placedCards.map(c => ({
      assetId: c.asset.id,
      assetName: c.asset.name,
      zone: c.zone,
      correct: c.correct,
      x: Math.round(c.x),
      y: Math.round(c.y)
    }));

    const r = await fetch("/api/award", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        playerName,
        points,
        cards: cardsSummary,
        profile: currentProfileKey
      })
    });

    if (!r.ok) return null;
    return await r.json();
  } catch (error) {
    console.error("Erro ao salvar partida:", error);
    return null;
  }
}

async function showRankingScreen() {
  showScreen('ranking');
  const dateEl = document.getElementById("ranking-date-display");
  if (dateEl) dateEl.innerText = new Date().toLocaleDateString("pt-BR");
  const listEl = document.getElementById("ranking-list");
  const loadingEl = document.getElementById("ranking-loading");
  if (!listEl) return;
  listEl.innerHTML = "";
  if (loadingEl) loadingEl.classList.remove("hidden");

  try {
    const res = await fetch("/api/ranking");
    const data = await res.json();
    if (loadingEl) loadingEl.classList.add("hidden");
    const top10 = data.slice(0, 10);

    if (top10.length === 0) {
      listEl.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-500">Nenhum jogo registrado hoje.</td></tr>`;
      return;
    }

    listEl.innerHTML = top10.map((game, index) => {
      const isMe = (game.playerName === playerName && game.points === gameScore);
      const rowClass = isMe ? "bg-emerald-900/30 text-emerald-200 font-bold border-l-2 border-emerald-500" : "hover:bg-slate-800/30";
      return `
        <tr class="${rowClass} transition-colors">
          <td class="p-3 text-slate-500 w-12 text-center">${index + 1}º</td>
          <td class="p-3 truncate max-w-[120px]" title="${game.playerName}">${game.playerName}</td>
          <td class="p-3 text-[10px] uppercase text-slate-400">${game.profile || '-'}</td>
          <td class="p-3 text-right font-display text-emerald-400">${game.points}</td>
          <td class="p-3 text-center text-[10px]">
            ${game.prize ? `<span class="bg-amber-500/20 text-amber-300 px-2 py-1 rounded border border-amber-500/30">${game.prize}</span>` : '<span class="text-slate-600">-</span>'}
          </td>
        </tr>
      `;
    }).join("");
  } catch (err) {
    console.error("Erro ao carregar ranking", err);
    if (loadingEl) loadingEl.classList.remove("hidden");
  }

  if (prizeResetTimer) clearTimeout(prizeResetTimer);
  prizeResetTimer = setTimeout(() => {
    returnToStart();
  }, 30000);
}

// ---------- TIMER LOGIC ----------
function startCountdown() {
  fetch("/api/config")
    .then(r => r.json())
    .then(config => {
      matchTimeConfig.active = config.timeLimitActive;
      matchTimeConfig.seconds = config.timeLimitSeconds;
    })
    .catch(() => { console.log("Usando config default de tempo"); })
    .finally(() => {
      showScreen('countdown');
      const cdNum = document.getElementById("countdown-number");
      let count = 3;
      cdNum.innerText = count;
      const interval = setInterval(() => {
        count--;
        if (count > 0) {
          cdNum.innerText = count;
        } else {
          clearInterval(interval);
          showScreen('game');
          startMatchTimer();
        }
      }, 1000);
    });
}

function startMatchTimer() {
  if (matchTimerInterval) clearInterval(matchTimerInterval);
  const timerContainer = document.getElementById("game-timer-container");
  const timerVal = document.getElementById("game-timer-val");

  if (!matchTimeConfig.active) {
    if (timerContainer) timerContainer.classList.add("hidden");
    return;
  }

  if (timerContainer) timerContainer.classList.remove("hidden");
  matchTimeRemaining = matchTimeConfig.seconds;
  isTimerPaused = false;
  updateTimerDisplay(timerVal);

  runMatchTimer();
}

function runMatchTimer() {
  if (matchTimerInterval) clearInterval(matchTimerInterval);
  const timerVal = document.getElementById("game-timer-val");

  matchTimerInterval = setInterval(() => {
    if (!isTimerPaused) {
      matchTimeRemaining--;
      updateTimerDisplay(timerVal);

      if (matchTimeRemaining <= 0) {
        clearInterval(matchTimerInterval);
        matchTimerInterval = null;
        showToast("Tempo Esgotado!", "warn");
        finalizeGame();
      }
    }
  }, 1000);
}

function pauseMatchTimer() {
  isTimerPaused = true;
  const timerContainer = document.getElementById("game-timer-container");
  if (timerContainer) timerContainer.classList.add("opacity-50");
}

function resumeMatchTimer() {
  isTimerPaused = false;
  const timerContainer = document.getElementById("game-timer-container");
  if (timerContainer) timerContainer.classList.remove("opacity-50");
}

function updateTimerDisplay(el) {
  if (!el) return;
  el.innerText = matchTimeRemaining;
  if (matchTimeRemaining <= 10) {
    el.className = "text-lg font-black font-display text-red-500 leading-none animate-pulse";
  } else {
    el.className = "text-lg font-black font-display text-white leading-none";
  }
}

// ---------- CARD DETAILS MODAL ----------
function openCardDetails(asset) {
  if (!asset) return;
  pauseMatchTimer();
  document.getElementById("detail-name").innerText = asset.name;
  document.getElementById("detail-type").innerText = asset.type;
  document.getElementById("detail-desc").innerText = asset.desc || "Sem descrição disponível.";
  document.getElementById("detail-suitability").innerText = asset.suitability;

  document.getElementById("detail-stars-risk").innerHTML = getStars(asset.suitability);
  document.getElementById("detail-stars-ret").innerHTML = getStars(asset.retorno);
  document.getElementById("detail-stars-sec").innerHTML = getStars(asset.seguranca);

  const modal = document.getElementById("card-details-modal");
  modal.classList.remove("hidden");
}

function closeCardDetails() {
  const modal = document.getElementById("card-details-modal");
  modal.classList.add("hidden");
  resumeMatchTimer();
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
    
    <div class="absolute inset-0 z-20 pointer-events-auto" title="Clique para detalhes"></div>
  `;
}

function fieldCardContentHTML(asset) {
  const compact = fieldIsCompact();
  const statsBlock = compact
    ? `
      <div class="mt-auto space-y-1">
        <div class="compact-bar"><div class="compact-fill" style="width:${asset.suitability}%; background:#fbbf24;"></div></div>
        <div class="compact-bar"><div class="compact-fill" style="width:${asset.retorno}%; background:#3b82f6;"></div></div>
        <div class="compact-bar"><div class="compact-fill" style="width:${asset.seguranca}%; background:#10b981;"></div></div>
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
    return json.assets;
  } catch (err) {
    return FALLBACK_ASSETS;
  }
}

// ---------- Name Screen ----------
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
  showScreen('terms');
}

function initNameScreen() {
  buildVirtualKeyboard();
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
    if (SCREENS.name.classList.contains("hidden")) return;
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

// ---------- Novas Funções do Fluxo ----------

function prepareMatch() {
  initGame();
  updateProfileModalContent();
  showScreen('profileModal');
}

function updateProfileModalContent() {
  if (!currentProfile) return;
  const modalName = document.getElementById("modal-profile-name");
  const modalDesc = document.getElementById("modal-profile-desc");
  modalName.innerText = currentProfile.label;
  modalName.className = `text-5xl font-black font-display mb-4 relative z-10 drop-shadow-lg scale-110 ${currentProfile.color}`;
  let desc = "";
  if (currentProfileKey === "CONSERVADOR") desc = "Priorize a segurança. Evite riscos desnecessários e proteja seu patrimônio.";
  else if (currentProfileKey === "MODERADO") desc = "Busque o equilíbrio entre risco e retorno. Nem muito lento, nem muito afoito.";
  else desc = "Vá com tudo! Busque os maiores retornos e aceite a volatilidade do mercado.";
  modalDesc.innerText = desc;
}

// ---------- Game lifecycle ----------
function bindEls() {
  els.prizeModal = document.getElementById("prize-modal");
  els.prizePoints = document.getElementById("prize-points");
  els.prizeStatus = document.getElementById("prize-status");
  els.prizeName = document.getElementById("prize-name");
  els.prizeExtra = document.getElementById("prize-extra");
  els.cardsContainer = document.getElementById("cards-container");
  els.fieldLayer = document.getElementById("field-interactive-layer");
  els.profile = document.getElementById("target-profile");
  els.targetRange = document.getElementById("target-range");
  els.playersCount = document.getElementById("players-count");
  els.finishBtn = document.getElementById("finish-btn");
  els.toast = document.getElementById("error-toast");
  els.playerName = document.getElementById("player-name");
  els.scoreVal = document.getElementById("score-val");
  els.debugBadge = document.getElementById("debug-badge");

  els.nameScreen = document.getElementById("name-screen");
  els.nameInput = document.getElementById("name-input");
  els.nameWarning = document.getElementById("name-warning");
  els.vkKeys = document.getElementById("vk-keys");
  els.startGameBtn = document.getElementById("start-game-btn");
  els.nameClear = document.getElementById("name-clear");

  els.sidebar = document.getElementById("game-sidebar"); // Novo ID
  els.revealScoreBtn = document.getElementById("reveal-score-btn"); // Novo Botão

  SCREENS.idle = document.getElementById('idle-screen');
  SCREENS.name = document.getElementById('name-screen');
  SCREENS.terms = document.getElementById('terms-screen');
  SCREENS.instructions = document.getElementById('instructions-screen');
  SCREENS.profileModal = document.getElementById('profile-modal-screen');
  SCREENS.countdown = document.getElementById('countdown-screen');
  SCREENS.game = document.getElementById('game-root');
  SCREENS.ranking = document.getElementById('ranking-screen');
  SCREENS.endSplash = document.getElementById('end-splash-screen');
  SCREENS.summaryOverlay = document.getElementById('summary-overlay'); // Novo Overlay

  flowEls.termsBtn = document.getElementById('terms-btn');
  flowEls.instBtn = document.getElementById('instructions-btn');
  flowEls.profileConfirmBtn = document.getElementById('profile-confirm-btn');
}

function pickProfile() {
  const keys = Object.keys(PROFILES);
  currentProfileKey = keys[Math.floor(Math.random() * keys.length)];
  currentProfile = PROFILES[currentProfileKey];
  if (els.profile) {
    els.profile.innerText = currentProfile.label;
    els.profile.className = `text-sm font-bold font-display uppercase tracking-widest ${currentProfile.color}`;
  }
  if (els.targetRange) els.targetRange.innerText = `${currentProfile.min} - ${currentProfile.max}`;
  applyDebugOnlyVisibility();
}

function initGame() {
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

  // Garante que a sidebar está visível no início
  if (els.sidebar) els.sidebar.classList.remove("hidden");

  computeCardSizeFromField();
  pickProfile();
  updateStats();
  renderSidebar();
  applyDebugOnlyVisibility();
  refreshCardsDebugVisuals();
}

function renderSidebar() {
  if (!els.cardsContainer) return;
  els.cardsContainer.innerHTML = "";
  const list = shuffleArray([...assetsData]);
  list.forEach(asset => {
    const card = document.createElement("div");
    const riskClass = getRiskBorderClass(asset);
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
  // Se o overlay de resumo estiver visível, bloqueia drag
  if (!SCREENS.summaryOverlay.classList.contains('hidden')) return;

  e.preventDefault();

  activeDrag = {
    pointerId: e.pointerId,
    asset,
    originalEl,
    startX: e.clientX,
    startY: e.clientY,
    hasMoved: false,
    ghost: null
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

  const dist = Math.hypot(e.clientX - activeDrag.startX, e.clientY - activeDrag.startY);

  if (!activeDrag.hasMoved && dist > 5) {
    activeDrag.hasMoved = true;
    startRealDrag(e);
  }

  if (activeDrag.hasMoved && activeDrag.ghost) {
    const vx = e.clientX - activeDrag.startX; 
    activeDrag.ghost.style.left = `${e.clientX}px`;
    activeDrag.ghost.style.top = `${e.clientY}px`;
    const rotateDeg = clamp(vx * 0.5, -15, 15);
    activeDrag.ghost.style.transform = `translate(-50%, -50%) scale(1.15) rotate(${rotateDeg}deg)`;
  }
}

function startRealDrag(e) {
  computeCardSizeFromField();
  const ghost = document.createElement("div");
  const borderClass = getRiskBorderClass(activeDrag.asset);
  ghost.className = `field-card ${borderClass} drag-ghost`.trim();
  ghost.style.width = `${CARD_W}px`;
  ghost.style.height = `${CARD_H}px`;
  ghost.style.left = `${e.clientX}px`;
  ghost.style.top = `${e.clientY}px`;
  ghost.style.transform = `translate(-50%, -50%) scale(1.2)`;
  ghost.style.setProperty("--innerScale", String(INNER_SCALE));
  ghost.classList.toggle("compact", fieldIsCompact());
  ghost.innerHTML = fieldCardContentHTML(activeDrag.asset);
  document.body.appendChild(ghost);

  activeDrag.originalEl.classList.add("is-dragging");
  activeDrag.ghost = ghost;
}

function handleEnd(e) {
  if (!activeDrag) return;
  if (e.pointerId !== activeDrag.pointerId) return;
  e.preventDefault();
  window.removeEventListener("pointermove", handleMove);
  window.removeEventListener("pointerup", handleEnd);
  window.removeEventListener("pointercancel", handleEnd);

  // CLIQUE (ZOOM)
  if (!activeDrag.hasMoved) {
    openCardDetails(activeDrag.asset);
    activeDrag = null;
    return;
  }

  // DROP
  const { asset, originalEl, ghost } = activeDrag;
  if (ghost) ghost.remove();
  originalEl.classList.remove("is-dragging");
  processDrop(asset.id, e.clientX, e.clientY, CARD_W / 2, CARD_H / 2);
  activeDrag = null;
}

// ---------- Drop / Placement ----------
function processDrop(assetId, clientX, clientY, offsetX, offsetY) {
  const asset = assetsData.find(a => a.id === assetId);
  if (!asset) return;
  computeCardSizeFromField();
  const rect = els.fieldLayer.getBoundingClientRect();
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
  const actualZone = zoneFromPoint(y + (CARD_H / 2), rect.height);
  const expected = expectedZoneFor(asset.suitability, currentProfileKey);
  const correct = (actualZone === expected);
  if (existingIndex !== -1) {
    const oldEl = document.querySelector(`.field-item[data-id="${asset.id}"]`);
    if (oldEl) oldEl.remove();
    placedCards.splice(existingIndex, 1);
  } else {
    const sidebarItem = document.querySelector(`.sidebar-item[data-id="${asset.id}"]`);
    if (sidebarItem) sidebarItem.classList.add("hidden");
  }
  if (!correct) showToast("Posição errada (não conta)", "warn");
  else showToast("Correto (conta pontos)", "info");
  placeCardOnField(asset, x, y, actualZone, correct);
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
  el.addEventListener("pointerdown", (e) => initDrag(e, asset, el));
  ensureCloseButton(el, asset);
  els.fieldLayer.appendChild(el);
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
      els.prizeStatus.innerText = "Servidor indisponível";
      els.prizeStatus.className = "text-sm font-bold text-red-300 mb-1";
    }
    if (els.prizeName) els.prizeName.innerText = "--";
    if (els.prizeExtra) els.prizeExtra.innerText = "Tente novamente.";
    if (els.prizeModal) els.prizeModal.classList.remove("hidden");
    scheduleGoToRanking();
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
    if (remaining != null) parts.push(`Estoque: ${remaining}`);
    if (els.prizeExtra) els.prizeExtra.innerText = parts.join(" • ");
  } else {
    if (els.prizeStatus) {
      els.prizeStatus.innerText = "Sem brinde desta vez";
      els.prizeStatus.className = "text-sm font-bold text-slate-200 mb-1";
    }
    if (els.prizeName) els.prizeName.innerText = "—";
    if (els.prizeExtra) els.prizeExtra.innerText = "Tente fazer mais pontos!";
  }

  if (els.prizeModal) els.prizeModal.classList.remove("hidden");
  scheduleGoToRanking();
}

function scheduleGoToRanking() {
  if (prizeResetTimer) clearTimeout(prizeResetTimer);
  prizeResetTimer = setTimeout(() => {
    showRankingScreen();
  }, 10000);
}

function returnToStart() {
  if (prizeResetTimer) clearTimeout(prizeResetTimer);
  prizeResetTimer = null;
  if (matchTimerInterval) clearInterval(matchTimerInterval);
  matchTimerInterval = null;
  const timerContainer = document.getElementById("game-timer-container");
  if (timerContainer) timerContainer.classList.add("hidden");

  placedCards = [];
  gameScore = 0;
  if (els.cardsContainer) els.cardsContainer.innerHTML = "";
  if (els.fieldLayer) els.fieldLayer.innerHTML = "";
  if (els.finishBtn) els.finishBtn.classList.add("hidden");
  if (els.prizeModal) els.prizeModal.classList.add("hidden");

  // Reseta visibilidade da Sidebar
  if (els.sidebar) els.sidebar.classList.remove("hidden");

  setPlayerName("");
  if (els.nameInput) els.nameInput.value = "";
  if (els.nameWarning) els.nameWarning.classList.add("hidden");
  if (els.startGameBtn) els.startGameBtn.disabled = true;

  showScreen('idle');

  if (debugMode && els.scoreVal) els.scoreVal.innerText = "0";
  if (!debugMode && els.scoreVal) els.scoreVal.innerText = "";
  computeCardSizeFromField();
  relayoutPlacedCards();
  applyDebugOnlyVisibility();
  refreshCardsDebugVisuals();
}

// ---------- Finalize Sequence ----------
async function finalizeGame() {
  // Para timer imediatamente
  if (matchTimerInterval) clearInterval(matchTimerInterval);

  // Calcula pontuação 
  const correctCount = placedCards.reduce((acc, c) => acc + (c.correct ? 1 : 0), 0);
  const baseScore = correctCount * SCORE_CORRECT;

  let timeBonus = 0;
  if (matchTimeConfig.active && matchTimeRemaining > 0) {
    timeBonus = matchTimeRemaining;
  }
  gameScore = baseScore + timeBonus;

  // 1. Mostra Splash "FIM DE JOGO"
  showScreen('endSplash');

  // 2. Espera 5 segundos e vai para o Modo Resumo (Campo Fullscreen)
  setTimeout(() => {
    // Esconde a Splash
    SCREENS.endSplash.classList.add("hidden");

    // Esconde a Sidebar -> O campo vai expandir
    if (els.sidebar) els.sidebar.classList.add("hidden");

    // Mostra o Overlay transparente por cima
    showScreen('summaryOverlay');

    // Força recalculo do layout do campo agora que está "full"
    setTimeout(() => {
      computeCardSizeFromField();
      relayoutPlacedCards();
    }, 100);

  }, 5000);
}

async function revealScoreAndAward() {
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
  computeCardSizeFromField();
  setupFieldResizeWatcher();
  setPlayerName("");
  setDebugMode(false);

  if (els.finishBtn) els.finishBtn.addEventListener("click", finalizeGame);
  if (els.revealScoreBtn) els.revealScoreBtn.addEventListener("click", revealScoreAndAward);

  window.addEventListener("keydown", (e) => {
    if (!SCREENS.game.classList.contains('hidden')) {
      if (e.key === "p" || e.key === "P") {
        e.preventDefault();
        toggleDebug();
        }
    }
  }, { passive: false });

  SCREENS.idle.addEventListener('click', () => { showScreen('name'); });
  flowEls.termsBtn.addEventListener('click', () => { showScreen('instructions'); });
  flowEls.instBtn.addEventListener('click', () => { prepareMatch(); });
  flowEls.profileConfirmBtn.addEventListener('click', () => { startCountdown(); });

  const btnGoRanking = document.getElementById("go-to-ranking-btn");
  if (btnGoRanking) btnGoRanking.addEventListener("click", () => { showRankingScreen(); });

  const btnBackHome = document.getElementById("back-to-home-btn");
  if (btnBackHome) btnBackHome.addEventListener("click", () => { returnToStart(); });

  const btnCloseDetails = document.getElementById("close-details-btn");
  if (btnCloseDetails) btnCloseDetails.addEventListener("click", closeCardDetails);

  document.getElementById("card-details-modal")?.addEventListener("click", (e) => {
    if (e.target.id === "card-details-modal") closeCardDetails();
  });

  showScreen('idle');

  assetsData = await loadAssets();
  initNameScreen();

  window.finalizeGame = finalizeGame;
  window.returnToStart = returnToStart;
});