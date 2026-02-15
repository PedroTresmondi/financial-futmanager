const PROFILES = {
  CONSERVADOR: { min: 15, max: 35, color: "text-blue-400", label: "Conservador" },
  MODERADO: { min: 36, max: 60, color: "text-yellow-400", label: "Moderado" },
  ARROJADO: { min: 61, max: 100, color: "text-red-500", label: "Arrojado" }
};

const MAX_PLAYERS = 6;
const PLAYER_NAME_KEY = "ffm_player_name";
const SCORE_CORRECT = 100;

const els = {};
const flowEls = {};

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
  summaryOverlay: null
};

let assetsData = [];
let currentProfileKey = null;
let currentProfile = null;

let placedCards = [];
let gameScore = 0;
let playerName = "";

let activeDrag = null;
let debugMode = false;
let prizeResetTimer = null;

let matchTimerInterval = null;
let matchTimeRemaining = 0;
let matchTimeConfig = { active: false, seconds: 60 };
let isTimerPaused = false;

// ---------- Campo responsivo ----------
const BASE_CARD_W = 140;
const BASE_CARD_H = 194;

let CARD_SCALE = 1;
let INNER_SCALE = 1;

let CARD_W = BASE_CARD_W;
let CARD_H = BASE_CARD_H;

let fieldResizeObserver = null;

const FALLBACK_ASSETS = [
  {
    "id": 1,
    "name": "Tesouro Selic",
    "type": "Renda Fixa",
    "suitability": 10,
    "retorno": 15,
    "seguranca": 100,
    "desc": "O investimento mais seguro do país. Ideal para reservas de emergência e perfis conservadores."
  },
  {
    "id": 2,
    "name": "CDB Banco",
    "type": "Renda Fixa",
    "suitability": 20,
    "retorno": 25,
    "seguranca": 90,
    "desc": "Emprestimo para o banco com garantia do FGC. Retorno superior à poupança."
  },
  {
    "id": 3,
    "name": "Fundo DI",
    "type": "Fundo",
    "suitability": 25,
    "retorno": 30,
    "seguranca": 85,
    "desc": "Carteira diversificada em renda fixa. Liquidez diária e gestão profissional."
  },
  {
    "id": 4,
    "name": "LCI / LCA",
    "type": "Isento",
    "suitability": 30,
    "retorno": 35,
    "seguranca": 85,
    "desc": "Investimento isento de Imposto de Renda, focado nos setores imobiliário e do agronegócio."
  },
  {
    "id": 5,
    "name": "Debênture",
    "type": "Crédito",
    "suitability": 40,
    "retorno": 45,
    "seguranca": 70,
    "desc": "Dívida de empresas privadas. Maior risco de crédito, mas com taxas atrativas."
  },
  {
    "id": 6,
    "name": "Multimercado",
    "type": "Fundo",
    "suitability": 50,
    "retorno": 55,
    "seguranca": 60,
    "desc": "Fundo que mistura renda fixa, ações e câmbio. Busca superar o CDI com volatilidade controlada."
  },
  {
    "id": 7,
    "name": "FII Papel",
    "type": "Imobiliário",
    "suitability": 55,
    "retorno": 60,
    "seguranca": 55,
    "desc": "Fundo imobiliário focado em dívidas (CRIs). Paga dividendos mensais isentos de IR."
  },
  {
    "id": 8,
    "name": "FII Tijolo",
    "type": "Imobiliário",
    "suitability": 60,
    "retorno": 65,
    "seguranca": 50,
    "desc": "Investimento em imóveis físicos como shoppings e galpões. Renda de aluguéis e valorização."
  },
  {
    "id": 9,
    "name": "ETF S&P500",
    "type": "Internacional",
    "suitability": 65,
    "retorno": 70,
    "seguranca": 50,
    "desc": "Exposição às 500 maiores empresas dos EUA. Diversificação em dólar sem sair do Brasil."
  },
  {
    "id": 10,
    "name": "Ações Blue Chips",
    "type": "Ações",
    "suitability": 70,
    "retorno": 75,
    "seguranca": 45,
    "desc": "Ações de empresas grandes, consolidadas e com bom histórico de lucros na Bolsa."
  },
  {
    "id": 11,
    "name": "Small Caps",
    "type": "Ações",
    "suitability": 80,
    "retorno": 85,
    "seguranca": 30,
    "desc": "Ações de empresas menores com alto potencial de crescimento, mas maior volatilidade."
  },
  {
    "id": 12,
    "name": "Dólar Futuro",
    "type": "Derivativos",
    "suitability": 85,
    "retorno": 80,
    "seguranca": 30,
    "desc": "Proteção ou especulação com a variação cambial. Alto risco e alavancagem."
  },
  {
    "id": 13,
    "name": "Bitcoin",
    "type": "Cripto",
    "suitability": 90,
    "retorno": 95,
    "seguranca": 20,
    "desc": "A principal criptomoeda do mercado. Ouro digital, descentralizado e escasso."
  },
  {
    "id": 14,
    "name": "Altcoins",
    "type": "Cripto",
    "suitability": 95,
    "retorno": 100,
    "seguranca": 10,
    "desc": "Criptomoedas alternativas com projetos inovadores, mas risco extremo de oscilação."
  },
  {
    "id": 15,
    "name": "Opções",
    "type": "Derivativos",
    "suitability": 100,
    "retorno": 100,
    "seguranca": 5,
    "desc": "Instrumentos para alavancagem máxima. Potencial de ganhos explosivos ou perda total."
  }
];

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

function showScreen(screenKey) {
  Object.values(SCREENS).forEach(el => {
    if (el && el.id !== 'game-root') el.classList.add('hidden');
  });
  if (screenKey && SCREENS[screenKey]) {
    SCREENS[screenKey].classList.remove('hidden');
  }

  // ✅ modos de UI
  document.body.classList.toggle("game-mode", screenKey === "game" || screenKey === "summaryOverlay");
  document.body.classList.toggle("summary-mode", screenKey === "summaryOverlay");
}


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

function setPlayerName(name) {
  playerName = normalizeName(name);
  if (els.playerNameHud) els.playerNameHud.innerText = playerName || "Nome do Jogador";
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
  // Fecha o modal de prêmio para não atrapalhar
  if (els.prizeModal) els.prizeModal.classList.add("hidden");

  showScreen('ranking');

  // Garante a data de hoje
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

    // --- ALTERAÇÃO AQUI: PEGAR SÓ OS 3 PRIMEIROS ---
    const top3 = data.slice(0, 3);

    if (top3.length === 0) {
      listEl.innerHTML = `<tr><td colspan="5" class="empty-rank-msg">O dia está começando! Seja o primeiro.</td></tr>`;
      return;
    }

    listEl.innerHTML = top3.map((game, index) => {
      const isMe = (game.playerName === playerName && game.points === gameScore);
      const rank = index + 1;

      // Classes especiais para cada posição
      let rowClass = "ranking-row";
      if (isMe) rowClass += " ranking-row--me";
      if (rank === 1) rowClass += " rank-1";
      if (rank === 2) rowClass += " rank-2";
      if (rank === 3) rowClass += " rank-3";

      // Ícones de medalha
      let medalIcon = "";
      if (rank === 1) medalIcon = "🥇";
      if (rank === 2) medalIcon = "🥈";
      if (rank === 3) medalIcon = "🥉";

      return `
        <tr class="${rowClass}">
          <td class="td-rank">
            <div class="rank-badge">${medalIcon || rank}</div>
          </td>
          <td class="td-name">
            <div class="player-info">
              <span class="player-name">${game.playerName}</span>
              <span class="player-profile">${game.profile || '-'}</span>
            </div>
          </td>
          <td class="td-points">${game.points}</td>
          <td class="td-prize">
            ${game.prize ? `<div class="prize-pill">🎁</div>` : ''}
          </td>
        </tr>
      `;
    }).join("");
  } catch (err) {
    console.error("Erro ao carregar ranking", err);
    if (loadingEl) loadingEl.classList.add("hidden");
  }

  // Reinicia em 30s
  if (prizeResetTimer) clearTimeout(prizeResetTimer);
  prizeResetTimer = setTimeout(() => {
    returnToStart();
  }, 30000);
}

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

  const s = Math.max(0, matchTimeRemaining);
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  el.innerText = `${mm}:${ss}`;

  el.classList.toggle("timer-danger", s <= 10);
}


function openCardDetails(asset) {
  if (!asset) return;
  pauseMatchTimer();

  const modal = document.getElementById("card-details-modal");
  const nameEl = document.getElementById("detail-name");
  const typeEl = document.getElementById("detail-type");
  const descEl = document.getElementById("detail-desc");
  const iconEl = document.getElementById("detail-icon");

  // 1) texto
  if (nameEl) nameEl.innerText = String(asset.name || "--").toUpperCase();
  if (descEl) descEl.innerText = asset.desc || "Sem descrição disponível.";

  // 2) pill = risco (baixo/médio/alto)
  let risco = "Risco Médio";
  if (asset.suitability <= 35) risco = "Risco Baixo";
  else if (asset.suitability <= 60) risco = "Risco Médio";
  else risco = "Risco Alto";
  if (typeEl) typeEl.innerText = risco;

  // 3) ícone = 3 tipos (perfil atual do jogador)
  if (iconEl) {
    const iconMap = {
      CONSERVADOR: "/assets/icons/profile-conservador.png",
      MODERADO: "/assets/icons/profile-moderado.png",
      ARROJADO: "/assets/icons/profile-arrojado.png",
    };
    iconEl.src = iconMap[currentProfileKey] || iconMap.MODERADO;
    iconEl.alt = "";
  }

  // 4) abre
  if (modal) modal.classList.remove("hidden");
}



function closeCardDetails() {
  const modal = document.getElementById("card-details-modal");
  modal.classList.add("hidden");
  resumeMatchTimer();
}

function getStars(percentage) {
  const starsCount = Math.round((percentage / 100) * 5);
  let html = "";
  for (let i = 0; i < 5; i++) html += `<span class="${i < starsCount ? "" : "star-dim"}">★</span>`;
  return html;
}

function getRiskLevel(suitability) {
  if (suitability <= 35) return "low";
  if (suitability <= 60) return "med";
  return "high";
}

function createPremiumCardHTML(asset) {
  return `
    <div class="game-card-base" data-risk="${getRiskLevel(asset.suitability)}">
      <div class="card-name">${asset.name}</div>
      <div class="card-type-pill">${asset.type}</div>
    </div>
    <div class="card-hit-area" title="Arraste / Clique"></div>
  `;
}

function fieldCardContentHTML(asset) {
  return `
    <div class="game-card-base" data-risk="${getRiskLevel(asset.suitability)}">
      <div class="card-name">${asset.name}</div>
      <div class="card-type-pill">${asset.type}</div>
    </div>
  `;
}


function setFieldCardContent(el, asset) {
  el.innerHTML = fieldCardContentHTML(asset);
  applyDebugOnlyVisibility();
}

function ensureCloseButton(el, asset) {
  let close = el.querySelector(".field-close-btn");
  if (close) return;

  close = document.createElement("div");
  close.className = "field-close-btn";
  close.innerText = "×";

  // Previne drag ao clicar no fechar
  close.addEventListener("pointerdown", (e) => e.stopPropagation());

  close.addEventListener("click", (e) => {
    e.stopPropagation();
    // Lógica de remoção existente...
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

function prepareMatch() {
  initGame();
  updateProfileModalContent();
  showScreen('profileModal');
}

function updateProfileModalContent() {
  if (!currentProfile) return;

  const nameEl = document.getElementById("modal-profile-name");
  const descEl = document.getElementById("modal-profile-desc");
  const cardEl = document.getElementById("profile-card");
  const iconEl = document.getElementById("profile-icon");

  const label = (currentProfile.label || "").toUpperCase();
  if (nameEl) nameEl.textContent = `PERFIL ${label}`;

  const descMap = {
    ARROJADO: "Você busca alta rentabilidade e aceita mais risco. Foque em investimentos de alto potencial de retorno!",
    MODERADO: "Seu perfil busca equilíbrio entre risco e retorno. Distribua seus ativos de forma balanceada!",
    CONSERVADOR: "Seu perfil valoriza segurança e estabilidade. Foque em ativos de baixo risco para pontuar melhor!"
  };
  if (descEl) descEl.textContent = descMap[currentProfileKey] || descMap.MODERADO;

  if (iconEl) {
    const iconMap = {
      ARROJADO: "/assets/icons/profile-arrojado.png",
      MODERADO: "/assets/icons/profile-moderado.png",
      CONSERVADOR: "/assets/icons/profile-conservador.png",
    };
    iconEl.src = iconMap[currentProfileKey] || iconMap.MODERADO;
  }

  if (cardEl) {
    // 1) trocar imagem
    const bgMap = {
      ARROJADO: "url('/assets/backgrounds/profile-arrojado.png')",
      MODERADO: "url('/assets/backgrounds/profile-moderado.png')",
      CONSERVADOR: "url('/assets/backgrounds/profile-conservador.png')",
    };
    const bg = bgMap[currentProfileKey] || bgMap.MODERADO;
    cardEl.style.setProperty("--profile-bg", bg);
    cardEl.style.backgroundImage = bg; // fallback direto

    // 2) trocar classe de tema (pra não ficar preso no moderado)
    cardEl.classList.remove("profile-theme--arrojado", "profile-theme--moderado", "profile-theme--conservador");
    if (currentProfileKey === "ARROJADO") cardEl.classList.add("profile-theme--arrojado");
    else if (currentProfileKey === "CONSERVADOR") cardEl.classList.add("profile-theme--conservador");
    else cardEl.classList.add("profile-theme--moderado");

    // 3) contraste
    cardEl.classList.remove("profile-contrast--light", "profile-contrast--dark");
    if (currentProfileKey === "CONSERVADOR") cardEl.classList.add("profile-contrast--light");
    else cardEl.classList.add("profile-contrast--dark");
  }
}






function bindEls() {
  els.prizeModal = document.getElementById("prize-modal");
  els.prizePoints = document.getElementById("prize-points");
  els.prizeStatus = document.getElementById("prize-status");
  els.playerNameHud = document.getElementById("player-name-hud");
  els.profilePill = document.getElementById("profile-pill");
  els.profileIconHud = document.getElementById("profile-icon-hud");

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

  els.sidebar = document.getElementById("game-sidebar");
  els.revealScoreBtn = document.getElementById("reveal-score-btn");

  SCREENS.idle = document.getElementById('idle-screen');
  SCREENS.name = document.getElementById('name-screen');
  SCREENS.terms = document.getElementById('terms-screen');
  SCREENS.instructions = document.getElementById('instructions-screen');
  SCREENS.profileModal = document.getElementById('profile-modal-screen');
  SCREENS.countdown = document.getElementById('countdown-screen');
  SCREENS.game = document.getElementById('game-root');
  SCREENS.ranking = document.getElementById('ranking-screen');
  SCREENS.endSplash = document.getElementById('end-splash-screen');
  SCREENS.summaryOverlay = document.getElementById('summary-overlay');

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

  if (els.profilePill) els.profilePill.dataset.profile = currentProfileKey;

  if (els.profileIconHud) {
    const iconMap = {
      ARROJADO: "/assets/icons/profile-arrojado.png",
      MODERADO: "/assets/icons/profile-moderado.png",
      CONSERVADOR: "/assets/icons/profile-conservador.png",
    };
    els.profileIconHud.src = iconMap[currentProfileKey] || iconMap.MODERADO;
  }
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

function initDrag(e, asset, originalEl) {
  if (e.pointerType === "mouse" && e.button !== 0) return;
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

  if (!activeDrag.hasMoved) {
    const asset = activeDrag.asset;
    const originalEl = activeDrag.originalEl;

    try { originalEl.releasePointerCapture?.(e.pointerId); } catch (_) { }

    activeDrag = null;

    setTimeout(() => openCardDetails(asset), 0);
    return;
  }


  const { asset, originalEl, ghost } = activeDrag;
  if (ghost) ghost.remove();
  originalEl.classList.remove("is-dragging");
  processDrop(asset.id, e.clientX, e.clientY, CARD_W / 2, CARD_H / 2);
  activeDrag = null;
}

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

function updateStats() {
  if (!els.playersCount) return;
  const n = String(placedCards.length).padStart(2, "0");
  els.playersCount.innerText = `${n}/06`; if (placedCards.length === MAX_PLAYERS) {
    els.playersCount.classList.add("limit-warning");
    if (els.finishBtn) els.finishBtn.classList.remove("hidden");
  } else {
    els.playersCount.classList.remove("limit-warning");
    if (els.finishBtn) els.finishBtn.classList.add("hidden");
  }
}

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

async function finalizeGame() {
  // 1. Para o timer imediatamente
  if (matchTimerInterval) clearInterval(matchTimerInterval);

  // 2. Calcula a pontuação
  const correctCount = placedCards.reduce((acc, c) => acc + (c.correct ? 1 : 0), 0);
  const baseScore = correctCount * SCORE_CORRECT;

  let timeBonus = 0;
  if (matchTimeConfig.active && matchTimeRemaining > 0) {
    timeBonus = matchTimeRemaining;
  }
  gameScore = baseScore + timeBonus;

  // 3. Mostra o splash de "FIM DE JOGO"
  showScreen('endSplash');

  // 4. Aguarda 3 segundos (ajuste se quiser mais/menos tempo) e vai para o resumo
  setTimeout(() => {
    // Esconde o splash
    SCREENS.endSplash.classList.add("hidden");

    // IMPORTANTE: Esconde a lista de cartas lateral (sidebar)
    // Isso limpa a tela para ficar só o campo e o resultado
    if (els.sidebar) els.sidebar.classList.add("hidden");

    // Ativa a tela de resumo.
    // Ao chamar showScreen('summaryOverlay'), o body ganha a classe .summary-mode
    // que ativa todo aquele CSS novo que criamos.
    showScreen('summaryOverlay');

    // Pequeno delay para garantir que o navegador renderizou o layout novo
    // antes de recalcular a posição das cartas no campo
    setTimeout(() => {
      computeCardSizeFromField();
      relayoutPlacedCards();
    }, 100);

  }, 3000);
}

async function revealScoreAndAward() {
  const award = await tryAwardPrize(gameScore);
  showPrizeModal(award, gameScore);
}

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

  const idleBtn = document.querySelector('.idle-play-btn');
  if (idleBtn) {
    // Remove qualquer listener anterior
    const newBtn = idleBtn.cloneNode(true);
    idleBtn.parentNode.replaceChild(newBtn, idleBtn);

    // Adiciona o evento de forma limpa
    newBtn.addEventListener('click', (e) => {
      console.log("CLIQUE NO BOTÃO DETECTADO!"); // Veja se isso aparece no console (F12)
      e.preventDefault();
      e.stopPropagation();
      showScreen('name');
    });

    // Suporte a toque (mobile/quiosque)
    newBtn.addEventListener('touchstart', (e) => {
      console.log("TOQUE NO BOTÃO DETECTADO!");
      e.preventDefault();
      e.stopPropagation();
      showScreen('name');
    }, { passive: false });
  }

  flowEls.termsBtn.addEventListener('click', () => { showScreen('instructions'); });
  flowEls.instBtn.addEventListener('click', () => { prepareMatch(); });
  flowEls.profileConfirmBtn.addEventListener('click', () => { startCountdown(); });

  const btnGoRanking = document.getElementById("go-to-ranking-btn");
  if (btnGoRanking) btnGoRanking.addEventListener("click", () => { showRankingScreen(); });

  const btnBackHome = document.getElementById("back-to-home-btn");
  if (btnBackHome) btnBackHome.addEventListener("click", () => { returnToStart(); });

  const btnCloseDetails = document.getElementById("close-details-btn");
  if (btnCloseDetails) btnCloseDetails.addEventListener("click", closeCardDetails);

  const modalEl = document.getElementById("card-details-modal");

  modalEl?.addEventListener("pointerdown", (e) => {
    if (e.target === modalEl) closeCardDetails();
  }, { passive: false });

  document.getElementById("detail-card-container")?.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
  }, { passive: false });


  showScreen('idle');

  assetsData = await loadAssets();
  initNameScreen();

  window.finalizeGame = finalizeGame;
  window.returnToStart = returnToStart;
});