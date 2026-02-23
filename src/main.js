

import {
  clamp,
  onlySpaces,
  normalizeName,
  normalizeNameLive,
  shuffleArray,
  zoneFromPoint,
  expectedZoneFor,
  getExpectedZoneForAsset,
  isExpectedZone,
  formatExpectedZoneLabel,
  getRiskLevel,
  escapeHtml,
  formatPtsBR
} from "./utils.js";
import { loadAssets, tryAwardPrize as apiTryAwardPrize, getConfig, getRanking } from "./api.js";

const PROFILES = {
  CONSERVADOR: { min: 15, max: 35, color: "text-blue-400", label: "Conservador" },
  MODERADO: { min: 36, max: 60, color: "text-yellow-400", label: "Moderado" },
  ARROJADO: { min: 61, max: 100, color: "text-red-500", label: "Arrojado" }
};

const MAX_PLAYERS = 6;
const PLAYER_NAME_KEY = "ffm_player_name";
/** Regras de pontuação (carregadas do /api/config ao iniciar a partida) */
let POINTS_PER_CORRECT_CARD = 3;
let POINTS_PER_WRONG_CARD = 0;
let BONUS_IDEAL_LINEUP = 20;
let MAX_SCORE = 38;

/** Escalação ideal por tipo de carteira: quantidade de cartas em Defesa, Meio, Ataque */
const IDEAL_FORMATION = {
  CONSERVADOR: { defense: 2, midfield: 3, attack: 1 },
  MODERADO: { defense: 2, midfield: 2, attack: 2 },
  ARROJADO: { defense: 1, midfield: 3, attack: 2 },
};

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

const sidebarHideTimers = new Map();

// ✅ trava pra impedir “volta duas vezes”
const restoringIds = new Set();
// ✅ trava pra impedir “ida duas vezes” em race conditions
const movingToFieldIds = new Set();

let assetsData = [];
let currentProfileKey = null;
let currentProfile = null;

let placedCards = [];
let gameScore = 0;
let playerName = "";

let activeDrag = null;
let debugMode = false;
let prizeResetTimer = null;
/** Quando true, ranking/prêmio abertos pelo menu não disparam retorno automático à idle */
let navigatedViaMenu = false;

let matchTimerInterval = null;
let matchTimeRemaining = 0;
let matchTimeConfig = { active: false, seconds: 60 };
let isTimerPaused = false;
/** Pausa do timer por modal de ajuda/cancelar: só retoma quando ambos estiverem fechados */
let timerPausedByAppModal = { help: false, cancel: false };

// ---------- Campo responsivo ----------
const BASE_CARD_W = 140;
const BASE_CARD_H = 194;

let CARD_SCALE = 1;
let INNER_SCALE = 1;

let CARD_W = BASE_CARD_W;
let CARD_H = BASE_CARD_H;

let fieldResizeObserver = null;

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
  if (screenKey) {
    let el = SCREENS[screenKey];
    if (!el && screenKey === "ranking") {
      el = document.getElementById("ranking-screen");
      if (el) SCREENS.ranking = el;
    }
    if (el) el.classList.remove('hidden');
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

function updateDebugPanel() {
  const panel = document.getElementById("debug-panel-content");
  if (!panel || !debugMode) return;

  const correctCount = placedCards.reduce((acc, c) => acc + (c.correct ? 1 : 0), 0);
  const ptsCartas = correctCount * POINTS_PER_CORRECT_CARD;
  const formationIdeal = isIdealFormation();
  const bonusIdeal = formationIdeal ? BONUS_IDEAL_LINEUP : 0;
  const zoneMap = { attack: "ATQ", midfield: "MEIO", defense: "DEF" };
  const counts = getFormationCounts();

  let html = "<div class=\"debug-section\"><strong>Pontuação</strong><br>";
  html += `Total: <strong>${gameScore}</strong> pts (máx. ${MAX_SCORE})<br>`;
  html += `Certas: ${correctCount} × ${POINTS_PER_CORRECT_CARD} = ${ptsCartas} pts<br>`;
  html += `Formação: ${counts.defense} DEF, ${counts.midfield} MEIO, ${counts.attack} ATQ`;
  if (placedCards.length === MAX_PLAYERS) {
    const ideal = IDEAL_FORMATION[currentProfileKey];
    if (ideal) html += ` (ideal: ${ideal.defense}-${ideal.midfield}-${ideal.attack})`;
    if (formationIdeal) html += ` ✓ +${BONUS_IDEAL_LINEUP} pts`;
  }
  html += "<br></div>";

  html += "<div class=\"debug-section\"><strong>Perfil</strong><br>";
  html += `${currentProfileKey || "—"} (suit ${currentProfile?.min ?? "?"}-${currentProfile?.max ?? "?"})</div>`;

  html += "<div class=\"debug-section\"><strong>Timer</strong><br>";
  html += matchTimeConfig.active
    ? `${matchTimeRemaining}s restantes · ${isTimerPaused ? "⏸ Pausado" : "▶ Ativo"}`
    : "Desativado";
  html += "</div>";

  if (placedCards.length > 0) {
    html += "<div class=\"debug-section\"><strong>Cartas no campo</strong><br>";
    placedCards.forEach((c, i) => {
      const exp = currentProfileKey ? getExpectedZoneForAsset(c.asset, currentProfileKey) : "?";
      const expLabel = Array.isArray(exp) ? formatExpectedZoneLabel(exp, zoneMap) : (zoneMap[exp] || exp);
      const actLabel = zoneMap[c.zone] || c.zone;
      const ok = c.correct ? "✓" : "✗";
      html += `${i + 1}. ${escapeHtml(c.asset.name)} · suit ${c.asset.suitability} · esperado ${expLabel} → ${actLabel} ${ok}<br>`;
    });
    html += "</div>";
  }

  html += "<div class=\"debug-section\"><strong>Assets</strong><br>";
  html += `${assetsData.length} cartas carregadas</div>`;

  panel.innerHTML = html;
}

function setDebugMode(on) {
  debugMode = !!on;
  document.body.classList.toggle("debug", debugMode);
  if (els.debugBadge) els.debugBadge.classList.toggle("hidden", !debugMode);
  if (els.debugPanel) els.debugPanel.setAttribute("aria-hidden", !debugMode);
  if (debugMode && els.scoreVal) els.scoreVal.innerText = String(gameScore);
  if (!debugMode && els.scoreVal) els.scoreVal.innerText = "";
  applyDebugOnlyVisibility();
  refreshCardsDebugVisuals();
  updateDebugPanel();
  showToast(debugMode ? "DEBUG: ON" : "DEBUG: OFF", "info");
}

function toggleDebug() {
  setDebugMode(!debugMode);
}

function getFormationCounts() {
  const counts = { defense: 0, midfield: 0, attack: 0 };
  for (const c of placedCards) {
    if (c.zone === "defense") counts.defense += 1;
    else if (c.zone === "midfield") counts.midfield += 1;
    else if (c.zone === "attack") counts.attack += 1;
  }
  return counts;
}

function isIdealFormation() {
  if (!currentProfileKey || placedCards.length !== MAX_PLAYERS) return false;
  const ideal = IDEAL_FORMATION[currentProfileKey];
  if (!ideal) return false;
  const counts = getFormationCounts();
  return counts.defense === ideal.defense && counts.midfield === ideal.midfield && counts.attack === ideal.attack;
}

function recomputeScore() {
  const correctCount = placedCards.reduce((acc, c) => acc + (c.correct ? 1 : 0), 0);
  const wrongCount = placedCards.length - correctCount;
  const ptsCartas = correctCount * POINTS_PER_CORRECT_CARD;
  const bonusIdeal = isIdealFormation() ? BONUS_IDEAL_LINEUP : 0;
  const penalty = wrongCount * POINTS_PER_WRONG_CARD;
  gameScore = Math.max(0, Math.min(MAX_SCORE, ptsCartas + bonusIdeal - penalty));
  if (debugMode && els.scoreVal) els.scoreVal.innerText = String(gameScore);
  updateDebugPanel();
}

async function tryAwardPrize(points) {
  return apiTryAwardPrize(points, { playerName, placedCards, currentProfileKey });
}

async function showRankingScreen(opts = {}) {
  const fromMenu = opts.fromMenu === true;
  const awardData = opts.award;
  if (fromMenu) navigatedViaMenu = true;

  // Fecha o modal de prêmio para não atrapalhar
  if (els.prizeModal) els.prizeModal.classList.add("hidden");

  // Garante que a tela de ranking seja exibida (antes de qualquer async)
  showScreen("ranking");
  const rankingEl = document.getElementById("ranking-screen");
  if (rankingEl) rankingEl.classList.remove("hidden");
  // Força o ranking a ficar por cima: esconde game e overlay de resumo que vêm depois no DOM
  const gameRoot = document.getElementById("game-root");
  const summaryOverlay = document.getElementById("summary-overlay");
  if (gameRoot) gameRoot.classList.add("hidden");
  if (summaryOverlay) summaryOverlay.classList.add("hidden");

  // --- refs do novo layout ---
  const scoreEl = document.getElementById("ranking-score");
  const placeEl = document.getElementById("ranking-place");
  const prizeEl = document.getElementById("ranking-prize");
  const listHostEl = document.getElementById("ranking-list");      // onde entra o HTML dos itens
  const listWrapEl = document.querySelector(".ranking-list");      // container que deve ficar branco
  const timerEl = document.getElementById("ranking-timer");        // opcional (se existir)

  // Brinde não é exibido ao usuário (mantém elemento oculto)
  if (prizeEl) {
    prizeEl.classList.add("hidden");
    prizeEl.setAttribute("aria-hidden", "true");
    prizeEl.innerHTML = "";
  }

  // Pontuação do jogador na tela
  if (scoreEl) {
    try {
      scoreEl.textContent = Number(gameScore).toLocaleString("pt-BR");
    } catch (_) {
      scoreEl.textContent = String(gameScore);
    }
  }

  // Reset visual: mostra "Carregando..." dentro da lista (sem remover o loading do DOM antes)
  if (placeEl) placeEl.textContent = "Carregando sua posição...";
  if (listWrapEl) listWrapEl.classList.remove("has-me");
  if (listHostEl) {
    listHostEl.innerHTML = '<div class="ranking-loading">Carregando ranking...</div>';
  }
  if (timerEl) timerEl.textContent = "60";

  try {
    const data = await getRanking();

    // Top 3
    const top3 = Array.isArray(data) ? data.slice(0, 3) : [];

    if (!listHostEl) return;

    if (top3.length === 0) {
      if (placeEl) placeEl.textContent = "O dia está começando! Seja o primeiro.";
      listHostEl.innerHTML = `
        <div class="rank-empty">Sem resultados ainda</div>
      `;
      return;
    }

    // detectar "VOCÊ"
    let myIndex = -1;
    for (let i = 0; i < top3.length; i++) {
      const g = top3[i];
      if (!g) continue;

      const sameName = String(g.playerName || "").trim().toUpperCase() === String(playerName || "").trim().toUpperCase();
      const sameScore = Number(g.points) === Number(gameScore);

      if (sameName && sameScore) {
        myIndex = i;
        break;
      }
    }

    const hasMe = myIndex !== -1;
    if (hasMe && listWrapEl) {
      // ✅ aqui: quando você aparece, o container da lista vira branco
      listWrapEl.classList.add("has-me");
    }

    // frase "Você conquistou..."
    if (placeEl) {
      if (hasMe) {
        const place = myIndex + 1;
        const suffix = place === 1 ? "º" : "º";
        placeEl.textContent = `Você conquistou o ${place}${suffix} lugar!`;
      } else {
        placeEl.textContent = `Você ficou fora do Top 3 hoje. Tente de novo!`;
      }
    }

    // Render dos itens (estilo igual ao mock)
    listHostEl.innerHTML = top3
      .map((g, i) => {
        const rank = i + 1;

        const sameName = String(g.playerName || "").trim().toUpperCase() === String(playerName || "").trim().toUpperCase();
        const sameScore = Number(g.points) === Number(gameScore);
        const isMe = sameName && sameScore;

        const showName = isMe ? "VOCÊ" : (g.playerName || "PLAYER");

        // 1º–3º: troféus (ouro, prata, bronze); 4º–5º: medalhas (assets/icons)
        const iconPaths = {
          1: "/assets/icons/trophy-gold.png",
          2: "/assets/icons/trophy-silver.png",
          3: "/assets/icons/trophy-bronze.png",
          4: "/assets/icons/medal.png",
          5: "/assets/icons/medal.png"
        };
        const iconSrc = iconPaths[rank] || "/assets/icons/medal.png";
        const iconClass = rank <= 3 ? "rank-icon-trophy rank-icon-img" : "rank-icon-medal rank-icon-img";

        const pts = (() => {
          try { return Number(g.points).toLocaleString("pt-BR"); }
          catch (_) { return String(g.points); }
        })();

        return `
          <div class="rank-item ${isMe ? "is-me" : ""} ${rank === 1 ? "is-first" : ""}">
            <div class="rank-left">
              <div class="rank-pos">${rank}º</div>
              <div class="rank-icon ${iconClass}"><img src="${iconSrc}" alt="" class="rank-icon-img" /></div>
            </div>
            <div class="rank-right">
              <div class="rank-points">${pts}</div>
              <div class="rank-points-label">Pontos</div>
              <div class="rank-name">${showName}</div>
            </div>
          </div>
        `;
      })
      .join("");
  } catch (err) {
    console.error("Erro ao carregar ranking", err);
    if (placeEl) placeEl.textContent = "Não foi possível carregar o ranking.";
    if (listHostEl) listHostEl.innerHTML = `
      <div class="rank-empty">Erro ao carregar</div>
    `;
  }

  // Retorno automático à idle só quando NÃO veio do menu de navegação
  if (prizeResetTimer) clearTimeout(prizeResetTimer);
  if (!navigatedViaMenu) {
    prizeResetTimer = setTimeout(() => {
      returnToStart();
    }, 30000);
  }
}



function startCountdown() {
  getConfig()
    .then(config => {
      matchTimeConfig.active = config.timeLimitActive;
      matchTimeConfig.seconds = config.timeLimitSeconds;
      applyScoringConfig(config);
    })
    .catch(() => { console.log("Usando config default de tempo e pontuação"); })
    .finally(() => {
      // 1. Tira o 'hidden' do jogo AGORA, para ele aparecer no fundo
      const gameRoot = document.getElementById('game-root');
      if (gameRoot) gameRoot.classList.remove('hidden');

      // 2. Chama a tela de Countdown (que vai ficar por cima com blur)
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

          // Quando terminar, apenas esconde o countdown, o jogo já está lá
          document.getElementById('countdown-screen').classList.add('hidden');

          // Inicia o tempo da partida
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
  if (debugMode) updateDebugPanel();
}

const MODAL_BG_BY_TYPE = {
  "Crédito": "/assets/backgrounds/modal-background-credito.png",
  "Imobiliário": "/assets/backgrounds/modal-background-imobiliario.png",
  "Ações e Multiestratégia": "/assets/backgrounds/modal-background-am.png",
};

function openCardDetails(asset) {
  if (!asset) return;
  pauseMatchTimer();

  const modal = document.getElementById("card-details-modal");
  const container = document.getElementById("detail-card-container");
  const nameEl = document.getElementById("detail-name");
  const typeEl = document.getElementById("detail-type");
  const descEl = document.getElementById("detail-desc");
  const iconEl = document.getElementById("detail-icon");

  // 0) fundo e tema do modal conforme o tipo da carta (cores de texto no CSS por data-modal-category)
  if (container) {
    const bgUrl = MODAL_BG_BY_TYPE[asset.type] || MODAL_BG_BY_TYPE["Crédito"];
    container.style.backgroundImage = bgUrl ? `url("${bgUrl}")` : "";
    container.dataset.modalCategory = asset.type || "";
  }

  // 1) texto
  if (nameEl) nameEl.innerText = String(asset.name || "--").toUpperCase();
  if (descEl) descEl.innerText = asset.desc || "Sem descrição disponível.";

  // 2) pill = risco (baixo/médio/alto)
  let risco = "Risco Médio";
  if (asset.suitability <= 35) risco = "Risco Baixo";
  else if (asset.suitability <= 60) risco = "Risco Médio";
  else risco = "Risco Alto";
  if (typeEl) typeEl.innerText = risco;

  // 3) ícone = conforme o perfil/risco da CARTA (suitability), não do jogador
  if (iconEl) {
    const origin = (typeof window !== "undefined" && window.location?.origin) ? window.location.origin : "";
    const isFile = !origin || origin === "file://" || origin.startsWith("file:");
    const prefix = isFile ? "" : origin;
    const iconMap = {
      conservador: prefix + "/assets/icons/profile-conservador.png",
      moderado: prefix + "/assets/icons/profile-moderado.png",
      arrojado: prefix + "/assets/icons/profile-arrojado.png",
    };
    const cardProfile =
      asset.suitability <= 35 ? "conservador" : asset.suitability <= 60 ? "moderado" : "arrojado";
    let iconSrc = iconMap[cardProfile] || iconMap.moderado;
    if (isFile) {
      iconMap.conservador = "assets/icons/profile-conservador.png";
      iconMap.moderado = "assets/icons/profile-moderado.png";
      iconMap.arrojado = "assets/icons/profile-arrojado.png";
      iconSrc = iconMap[cardProfile] || iconMap.moderado;
    }
    if (cardProfile === "conservador") iconSrc += "?v=1";
    iconEl.onerror = function onDetailIconError() {
      iconEl.onerror = null;
      iconEl.src = iconMap.moderado;
    };
    iconEl.alt = risco;
    iconEl.src = iconSrc;
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

function createPremiumCardHTML(asset) {
  const zone = currentProfileKey ? getExpectedZoneForAsset(asset, currentProfileKey) : "?";
  const zoneMap = { attack: "ATQ", midfield: "MEIO", defense: "DEF" };
  const zoneLabel = formatExpectedZoneLabel(zone, zoneMap);
  const riskLabel = getRiskLevel(asset.suitability);

  return `
    <div class="game-card-base" data-risk="${riskLabel}">
      <div class="card-debug-info debug-only">
        ID: ${asset.id} · Type: ${escapeHtml(asset.type || "—")}<br>
        Suit: ${asset.suitability} · Ret: ${asset.retorno ?? "?"}% · Risk: ${riskLabel}<br>
        <strong>ZONA: ${zoneLabel}</strong>
      </div>

      <div class="card-name">${asset.name}</div>
    </div>
    <div class="card-hit-area" title="Arraste / Clique"></div>
  `;
}

function fieldCardContentHTML(asset) {
  const zone = currentProfileKey ? getExpectedZoneForAsset(asset, currentProfileKey) : "?";
  const zoneMap = { attack: "ATQ", midfield: "MEIO", defense: "DEF" };
  const zoneLabel = formatExpectedZoneLabel(zone, zoneMap);
  const riskLabel = getRiskLevel(asset.suitability);

  return `
    <div class="game-card-base" data-risk="${riskLabel}">
      <div class="card-debug-info debug-only style="font-size: 26px;">
        ID: ${asset.id} · Type: ${escapeHtml(asset.type || "—")}<br>
        Suit: ${asset.suitability} · Ret: ${asset.retorno ?? "?"}% · Risk: ${riskLabel}<br>
        <strong>Target: ${zoneLabel}</strong>
      </div>

      <div class="card-name">${asset.name}</div>
    </div>
  `;
}

function setFieldCardContent(el, asset) {
  el.innerHTML = fieldCardContentHTML(asset);
  applyDebugOnlyVisibility();
}

/* ============================================================
   ✅ ANIMAÇÕES DA FILA (FLIP) + VOOS (clone)
   ============================================================ */

function getSidebarItems() {
  if (!els.cardsContainer) return [];
  return Array.from(els.cardsContainer.querySelectorAll(".sidebar-item"))
    .filter(el => !el.classList.contains("hidden"));
}

// FLIP para reflow da fila: cartas "andam" até o lugar vago (esquerda ou direita)
function animateSidebarReflow(mutator, duration = 420) {
  const itemsBefore = getSidebarItems();
  const first = new Map();
  itemsBefore.forEach(el => first.set(el, el.getBoundingClientRect()));

  // aplica alteração (remover/insert) — layout muda
  mutator?.();

  // força layout e anima cada carta da posição antiga → nova
  requestAnimationFrame(() => {
    const itemsAfter = getSidebarItems();
    itemsAfter.forEach((el, i) => {
      const r1 = first.get(el);
      const r2 = el.getBoundingClientRect();
      if (!r1 || !r2) return;
      const dx = r1.left - r2.left;
      const dy = r1.top - r2.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;

      // stagger leve para efeito cascata (esquerda → direita)
      const stagger = Math.min(i * 25, 80);

      el.style.transition = "none";
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      el.style.willChange = "transform";

      requestAnimationFrame(() => {
        el.style.transition = `transform ${duration}ms cubic-bezier(0.25, 1, 0.5, 1)`;
        el.style.transitionDelay = `${stagger}ms`;
        el.style.transform = "translate(0px, 0px)";
        const clear = () => {
          el.style.transition = "";
          el.style.transitionDelay = "";
          el.style.transform = "";
          el.style.willChange = "";
          el.removeEventListener("transitionend", clear);
        };
        el.addEventListener("transitionend", clear);
      });
    });
  });
}

// cria um clone visual para “voar”
function createFlyCloneFromElement(el, fromRect) {
  const clone = el.cloneNode(true);
  clone.classList.remove("is-dragging", "hidden", "removing-to-field");
  clone.classList.add("fly-clone");
  clone.style.display = "block";
  clone.style.position = "fixed";
  clone.style.left = `${fromRect.left}px`;
  clone.style.top = `${fromRect.top}px`;
  clone.style.width = `${fromRect.width}px`;
  clone.style.height = `${fromRect.height}px`;
  clone.style.margin = "0";
  clone.style.zIndex = "99999";
  clone.style.pointerEvents = "none";
  clone.style.transform = "translate(0px, 0px) scale(1)";
  clone.style.opacity = "1";
  clone.style.filter = "none";
  clone.style.willChange = "transform, opacity";
  document.body.appendChild(clone);
  return clone;
}

// anima clone de fromRect -> toRect
function flyCloneToRect(clone, fromRect, toRect, opts = {}) {
  const {
    duration = 520,
    easing = "cubic-bezier(0.22, 1, 0.36, 1)",
    scaleTo = 1,
    fadeOut = false
  } = opts;

  const dx = toRect.left - fromRect.left;
  const dy = toRect.top - fromRect.top;
  const sx = (toRect.width / Math.max(1, fromRect.width)) * scaleTo;
  const sy = (toRect.height / Math.max(1, fromRect.height)) * scaleTo;

  // start
  clone.style.transition = "none";
  clone.style.transformOrigin = "top left";
  clone.style.transform = "translate(0px, 0px) scale(1, 1)";
  clone.style.opacity = "1";

  // play
  requestAnimationFrame(() => {
    clone.style.transition = `transform ${duration}ms ${easing}, opacity ${duration}ms ${easing}`;
    clone.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
    if (fadeOut) clone.style.opacity = "0";
  });

  return new Promise((resolve) => {
    const done = () => {
      clone.removeEventListener("transitionend", done);
      resolve();
    };
    clone.addEventListener("transitionend", done);
    // fallback
    setTimeout(() => resolve(), duration + 60);
  });
}

// encontra o rect alvo no campo (posição final)
function getFieldTargetRect(x, y) {
  const r = getFieldRect() || els.fieldLayer.getBoundingClientRect();
  // card no campo é absolute dentro do layer, então converte p/ viewport
  return {
    left: r.left + x,
    top: r.top + y,
    width: CARD_W,
    height: CARD_H
  };
}

// volta animada: cria/mostra card na fila e faz ele voar do campo para a vaga real
async function restoreSidebarCardAnimated(asset, fromRect) {
  const id = String(asset.id);

  // ✅ lock anti “volta dupla”
  if (restoringIds.has(id)) return;
  restoringIds.add(id);

  try {
    // cancela hide pendente
    const t = sidebarHideTimers.get(id);
    if (t) {
      clearTimeout(t);
      sidebarHideTimers.delete(id);
    }

    if (!els.cardsContainer) return;

    // se já existe, só garante visibilidade
    let card = document.querySelector(`.sidebar-item[data-id="${id}"]`);

    // vamos animar o reflow da fila na inserção/reativação
    animateSidebarReflow(() => {
      if (card) {
        card.classList.remove("hidden", "removing-to-field", "is-dragging");
        card.style.width = "";
        card.style.maxWidth = "";
        card.style.opacity = "";
        card.style.transform = "";
        card.style.pointerEvents = "";
      } else {
        card = document.createElement("div");
        const riskClass = getRiskBorderClass(asset);
        card.className = `premium-card sidebar-item ${riskClass}`.trim();
        card.dataset.id = id;
        if (asset.type) card.dataset.category = asset.type;
        card.innerHTML = createPremiumCardHTML(asset);
        card.addEventListener("pointerdown", (e) => initDrag(e, asset, card));

        // ✅ insere no final (se quiser ordenar por id, dá pra fazer aqui)
        els.cardsContainer.appendChild(card);
      }
    }, 420);

    // se não tem origem, só entra com reflow
    if (!fromRect || typeof fromRect.left !== "number") return;

    // espera o layout assentar e pega o rect final (vaga real)
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    if (!card) return;

    const toRect = card.getBoundingClientRect();

    // cria clone “no campo” (a partir do card da fila, mas posiciona no fromRect)
    // pra evitar “pular” visual
    const flyClone = createFlyCloneFromElement(card, fromRect);

    // deixa o card real invisível durante o voo (evita duplicar na tela)
    card.style.opacity = "0";

    await flyCloneToRect(flyClone, fromRect, toRect, {
      duration: 560,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      scaleTo: 1,
      fadeOut: true
    });

    flyClone.remove();
    card.style.opacity = ""; // volta a aparecer certinho
  } finally {
    restoringIds.delete(id);
  }
}

/* ============================================================
   CLOSE BUTTON (CORRIGIDO: só pointerdown + animação)
   ============================================================ */
function ensureCloseButton(el, asset) {
  let close = el.querySelector(".field-close-btn");
  if (close) return;

  close = document.createElement("div");
  close.className = "field-close-btn";
  close.innerText = "×";

  // Previne drag ao clicar no fechar
  close.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation?.();

    // ✅ anti-duplo clique
    if (close.dataset.busy === "1") return;
    close.dataset.busy = "1";
    close.style.pointerEvents = "none";

    const fromRect = el.getBoundingClientRect();

    const idx = placedCards.findIndex(c => c.id === asset.id);
    if (idx !== -1) placedCards.splice(idx, 1);

    el.remove();

    // ✅ volta animada
    restoreSidebarCardAnimated(asset, fromRect);

    recomputeScore();
    updateStats();

    setTimeout(() => {
      close.dataset.busy = "0";
      close.style.pointerEvents = "";
    }, 650);
  }, { passive: false });

  el.appendChild(close);
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
  const value = normalizeNameLive(els.nameInput.value);
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

  const cardWrap = document.getElementById('profile-card-wrap');
  if (cardWrap) cardWrap.classList.remove('flipped');

  if (flowEls.profileConfirmBtn) {
    flowEls.profileConfirmBtn.disabled = false;
    flowEls.profileConfirmBtn.textContent = "REVELAR MEU PERFIL";
  }
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
    const bgMap = {
      ARROJADO: "url('/assets/backgrounds/profile-arrojado.png')",
      MODERADO: "url('/assets/backgrounds/profile-moderado.png')",
      CONSERVADOR: "url('/assets/backgrounds/profile-conservador.png')",
    };
    const bg = bgMap[currentProfileKey] || bgMap.MODERADO;
    cardEl.style.setProperty("--profile-bg", bg);
    cardEl.style.backgroundImage = bg; // fallback direto

    cardEl.classList.remove("profile-theme--arrojado", "profile-theme--moderado", "profile-theme--conservador");
    if (currentProfileKey === "ARROJADO") cardEl.classList.add("profile-theme--arrojado");
    else if (currentProfileKey === "CONSERVADOR") cardEl.classList.add("profile-theme--conservador");
    else cardEl.classList.add("profile-theme--moderado");

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
  els.debugPanel = document.getElementById("debug-panel");
  els.debugPanelContent = document.getElementById("debug-panel-content");

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

/* ========== Modais: Ajuda, Cancelar partida, Instruções (carousel) ========== */
let instructionsCarouselIndex = 0;
const INSTRUCTIONS_CAROUSEL_TOTAL = 3;

function isGameScreenActive() {
  return SCREENS.game && !SCREENS.game.classList.contains('hidden');
}

function openHelpModal() {
  if (isGameScreenActive() && matchTimeConfig.active) {
    pauseMatchTimer();
    timerPausedByAppModal.help = true;
  }
  const el = document.getElementById('help-modal');
  if (el) el.classList.remove('hidden');
}

function closeHelpModal() {
  const el = document.getElementById('help-modal');
  if (el) el.classList.add('hidden');
  if (timerPausedByAppModal.help) {
    timerPausedByAppModal.help = false;
    if (!timerPausedByAppModal.cancel) resumeMatchTimer();
  }
}

function openCancelMatchModal() {
  if (isGameScreenActive() && matchTimeConfig.active) {
    pauseMatchTimer();
    timerPausedByAppModal.cancel = true;
  }
  const el = document.getElementById('cancel-match-modal');
  if (el) el.classList.remove('hidden');
}

function closeCancelMatchModal() {
  const el = document.getElementById('cancel-match-modal');
  if (el) el.classList.add('hidden');
  if (timerPausedByAppModal.cancel) {
    timerPausedByAppModal.cancel = false;
    if (!timerPausedByAppModal.help) resumeMatchTimer();
  }
}

function openInstructionsCarouselModal() {
  instructionsCarouselIndex = 0;
  updateInstructionsCarouselSlide();
  const el = document.getElementById('instructions-carousel-modal');
  if (el) el.classList.remove('hidden');
}

function closeInstructionsCarouselModal() {
  const el = document.getElementById('instructions-carousel-modal');
  if (el) el.classList.add('hidden');
}

function updateInstructionsCarouselSlide() {
  const slides = document.querySelectorAll('.instructions-carousel-slide');
  const dots = document.querySelectorAll('.carousel-dot');
  slides.forEach((s, i) => s.classList.toggle('active', i === instructionsCarouselIndex));
  dots.forEach((d, i) => d.classList.toggle('active', i === instructionsCarouselIndex));
}

function initInstructionsCarousel() {
  const dotsContainer = document.getElementById('instructions-carousel-dots');
  if (!dotsContainer) return;
  dotsContainer.innerHTML = '';
  for (let i = 0; i < INSTRUCTIONS_CAROUSEL_TOTAL; i++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'carousel-dot' + (i === 0 ? ' active' : '');
    btn.setAttribute('aria-label', `Slide ${i + 1}`);
    btn.addEventListener('click', () => {
      instructionsCarouselIndex = i;
      updateInstructionsCarouselSlide();
    });
    dotsContainer.appendChild(btn);
  }
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
    if (asset.type) card.dataset.category = asset.type;
    card.innerHTML = createPremiumCardHTML(asset);
    card.addEventListener("pointerdown", (e) => initDrag(e, asset, card));
    els.cardsContainer.appendChild(card);
  });
  applyDebugOnlyVisibility();
}

/* ============================================================
   DRAG & DROP (corrigido: voo no drop)
   ============================================================ */
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
  if (activeDrag.asset.type) ghost.dataset.category = activeDrag.asset.type;
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

  processDrop(asset.id, e.clientX, e.clientY, CARD_W / 2, CARD_H / 2, originalEl);
  activeDrag = null;
}

// ✅ processDrop agora recebe "sourceEl" (o card da fila) pra animar o voo sem “quadrado transparente”
function processDrop(assetId, clientX, clientY, offsetX, offsetY, sourceEl) {
  const asset = assetsData.find(a => a.id === assetId);
  if (!asset) return;

  computeCardSizeFromField();
  const rect = els.fieldLayer.getBoundingClientRect();

  // só aceita drop dentro do campo
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
  const expected = getExpectedZoneForAsset(asset, currentProfileKey);
  const correct = isExpectedZone(actualZone, expected);

  // se está reposicionando no campo
  if (existingIndex !== -1) {
    const oldEl = document.querySelector(`.field-item[data-id="${asset.id}"]`);
    if (oldEl) oldEl.remove();
    placedCards.splice(existingIndex, 1);
  } else {
    // ✅ vindo da fila: anima fila (reflow) + voo para o campo
    const sidebarItem = document.querySelector(`.sidebar-item[data-id="${String(asset.id)}"]`);
    if (sidebarItem) {
      const id = String(asset.id);

      if (!movingToFieldIds.has(id)) {
        movingToFieldIds.add(id);

        // captura origem
        const fromRect = sidebarItem.getBoundingClientRect();
        const toRect = getFieldTargetRect(x, y);

        // ✅ FLIP reflow da fila + “colapso” do item
        animateSidebarReflow(() => {
          sidebarItem.classList.add("hidden", "removing-to-field");
        }, 420);

        // cria clone e voa pro campo
        const flyClone = createFlyCloneFromElement(sidebarItem, fromRect);

        // esconde o card real (evita duplicar) — mas mantém no DOM até o reflow terminar
        sidebarItem.style.opacity = "0";

        flyCloneToRect(flyClone, fromRect, toRect, {
          duration: 520,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          scaleTo: 1,
          fadeOut: true
        }).then(() => {
          flyClone.remove();
          // depois de tudo, some o card real
          sidebarItem.classList.add("hidden");
          sidebarItem.style.opacity = "";
          sidebarItem.classList.remove("removing-to-field");
          movingToFieldIds.delete(id);
        });
      }
    }
  }

  if (debugMode) {
    if (!correct) showToast("Posição errada (não conta)", "warn");
    else showToast("Correto (conta pontos)", "info");
  }

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
  el.className = `field-card field-item field-card-land ${borderClass}`.trim();
  if (asset.type) el.dataset.category = asset.type;
  el.classList.toggle("correct", correct);
  el.classList.toggle("incorrect", !correct);
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
  // Remove classe de entrada após animação; mantém correct/incorrect para estilo opcional
  setTimeout(() => el.classList.remove("field-card-land"), 500);
}

function updateStats() {
  if (!els.playersCount) return;
  const n = String(placedCards.length).padStart(2, "0");
  els.playersCount.innerText = `${n}/06`;
  if (placedCards.length === MAX_PLAYERS) {
    els.playersCount.classList.add("limit-warning");
    if (els.finishBtn) els.finishBtn.classList.remove("hidden");
  } else {
    els.playersCount.classList.remove("limit-warning");
    if (els.finishBtn) els.finishBtn.classList.add("hidden");
  }
  updateDebugPanel();
}

function showPrizeModal(awardData, points, opts = {}) {
  const fromMenu = opts.fromMenu === true;
  if (els.prizePoints) els.prizePoints.innerText = String(points);
  if (els.prizeStatus) els.prizeStatus.innerText = "";
  if (els.prizeName) els.prizeName.innerText = "";
  if (els.prizeExtra) els.prizeExtra.innerText = "";
  if (els.prizeModal) els.prizeModal.classList.remove("hidden");
  if (!fromMenu) scheduleGoToRanking();
}

function scheduleGoToRanking() {
  if (prizeResetTimer) clearTimeout(prizeResetTimer);
  prizeResetTimer = setTimeout(() => {
    showRankingScreen();
  }, 10000);
}

function returnToStart() {
  navigatedViaMenu = false;
  timerPausedByAppModal = { help: false, cancel: false };
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
  timerPausedByAppModal = { help: false, cancel: false };
  if (matchTimerInterval) clearInterval(matchTimerInterval);

  // 2. Calcula a pontuação: +N por carta certa, +bônus formação ideal, -M por carta errada; máx. MAX_SCORE
  const correctCount = placedCards.reduce((acc, c) => acc + (c.correct ? 1 : 0), 0);
  const wrongCount = placedCards.length - correctCount;
  const ptsCartas = correctCount * POINTS_PER_CORRECT_CARD;
  const bonusIdeal = isIdealFormation() ? BONUS_IDEAL_LINEUP : 0;
  const penalty = wrongCount * POINTS_PER_WRONG_CARD;
  gameScore = Math.max(0, Math.min(MAX_SCORE, ptsCartas + bonusIdeal - penalty));

  // 3. Mostra o splash de "FIM DE JOGO"
  showScreen('endSplash');

  // 4. Aguarda 3 segundos e vai para o resumo
  setTimeout(() => {
    // Esconde o splash
    SCREENS.endSplash.classList.add("hidden");

    // Esconde a lista de cartas lateral
    if (els.sidebar) els.sidebar.classList.add("hidden");

    // Ativa a tela de resumo
    showScreen('summaryOverlay');

    setTimeout(() => {
      computeCardSizeFromField();
      relayoutPlacedCards();
    }, 100);

  }, 3000);
}

async function revealScoreAndAward() {
  let award = null;
  try {
    award = await tryAwardPrize(gameScore);
  } catch (_) {
    // Falha na API não impede de abrir o ranking
  }
  showRankingScreen({ award });
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

/* ============================================================
   SWIPE / DRAG-TO-SCROLL NA LISTA DE CARTAS
   - Mouse: drag manual (arrastar)
   - Touch: swipe nativo via touch-action: pan-x no CSS
   ============================================================ */
document.addEventListener("DOMContentLoaded", () => {
  const slider = document.getElementById('game-sidebar');
  if (!slider) return;
  let isDown = false;
  let startX;
  let scrollLeft;

  slider.addEventListener('mousedown', (e) => {
    isDown = true;
    slider.classList.add('active');
    startX = e.pageX - slider.offsetLeft;
    scrollLeft = slider.scrollLeft;
  });

  slider.addEventListener('mouseleave', () => {
    isDown = false;
    slider.classList.remove('active');
  });

  slider.addEventListener('mouseup', () => {
    isDown = false;
    slider.classList.remove('active');
  });

  slider.addEventListener('mousemove', (e) => {
    if (!isDown) return;
    e.preventDefault();
    const x = e.pageX - slider.offsetLeft;
    const walk = (x - startX) * 2;
    slider.scrollLeft = scrollLeft - walk;
  });
});

function applyScoringConfig(config) {
  if (!config) return;
  POINTS_PER_CORRECT_CARD = Math.max(0, Number(config.pointsPerCorrectCard) || 3);
  BONUS_IDEAL_LINEUP = Math.max(0, Number(config.bonusIdealLineup) || 20);
  MAX_SCORE = Math.max(1, Number(config.maxScore) || 38);
  POINTS_PER_WRONG_CARD = Math.max(0, Number(config.pointsPerWrongCard) || 0);
}

document.addEventListener("DOMContentLoaded", async () => {
  bindEls();
  computeCardSizeFromField();
  setupFieldResizeWatcher();
  setPlayerName("");
  setDebugMode(false);

  // Carrega regras de pontuação do admin logo ao abrir o jogo (e de novo no countdown)
  getConfig().then(applyScoringConfig).catch(() => {});

  if (els.finishBtn) els.finishBtn.addEventListener("click", finalizeGame);
  if (els.revealScoreBtn) els.revealScoreBtn.addEventListener("click", revealScoreAndAward);

  window.addEventListener("keydown", (e) => {
    if (!SCREENS.game.classList.contains('hidden')) {
      if (e.key === "p" || e.key === "P") {
        e.preventDefault();
        toggleDebug();
      }
      return;
    }
    if (e.key === "m" || e.key === "M") {
      const idleVisible = SCREENS.idle && !SCREENS.idle.classList.contains("hidden");
      const menuEl = document.getElementById("idle-nav-menu");
      if (idleVisible && menuEl) {
        e.preventDefault();
        const isOpen = !menuEl.classList.contains("hidden");
        menuEl.classList.toggle("hidden", isOpen);
        menuEl.setAttribute("aria-hidden", isOpen ? "true" : "false");
      }
    }
  }, { passive: false });

  if (SCREENS.idle) SCREENS.idle.addEventListener('click', (e) => {
    const menuEl = document.getElementById("idle-nav-menu");
    if (menuEl && !menuEl.classList.contains("hidden")) return;
    showScreen('name');
  });

  const idleNavMenu = document.getElementById("idle-nav-menu");
  const idleNavBackdrop = document.getElementById("idle-nav-backdrop");
  if (idleNavMenu) idleNavMenu.addEventListener("click", (e) => e.stopPropagation());
  if (idleNavBackdrop) idleNavBackdrop.addEventListener("click", () => {
    idleNavMenu.classList.add("hidden");
    idleNavMenu.setAttribute("aria-hidden", "true");
  });
  const idleNavLinks = document.querySelectorAll(".idle-nav-link[data-nav]");
  idleNavLinks.forEach((btn) => {
    btn.addEventListener("click", () => {
      const nav = btn.getAttribute("data-nav");
      idleNavMenu.classList.add("hidden");
      idleNavMenu.setAttribute("aria-hidden", "true");
      if (nav === "idle") return;
      if (nav === "name") {
        showScreen("name");
        return;
      }
      if (nav === "ranking") {
        navigatedViaMenu = true;
        showRankingScreen({ fromMenu: true });
        return;
      }
      if (nav === "prize") {
        navigatedViaMenu = true;
        showPrizeModal(null, 0, { fromMenu: true });
        return;
      }
      if (nav === "admin") {
        window.location.href = "/admin.html";
        return;
      }
    });
  });

  const idleBtn = document.querySelector('.idle-play-btn');
  if (idleBtn) {
    const newBtn = idleBtn.cloneNode(true);
    idleBtn.parentNode.replaceChild(newBtn, idleBtn);

    newBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showScreen('name');
    });

    newBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showScreen('name');
    }, { passive: false });
  }

  if (flowEls.termsBtn) flowEls.termsBtn.addEventListener('click', () => { showScreen('instructions'); });
  if (flowEls.instBtn) flowEls.instBtn.addEventListener('click', () => { prepareMatch(); });
  if (flowEls.profileConfirmBtn) flowEls.profileConfirmBtn.addEventListener('click', () => {
    const cardWrap = document.getElementById('profile-card-wrap');
    if (cardWrap && !cardWrap.classList.contains('flipped')) {
      cardWrap.classList.add('flipped');
      flowEls.profileConfirmBtn.textContent = "ESCALAR MEUS ATIVOS";
    } else {
      startCountdown();
    }
  });

  const btnGoRanking = document.getElementById("go-to-ranking-btn");
  if (btnGoRanking) btnGoRanking.addEventListener("click", () => {
    showRankingScreen(navigatedViaMenu ? { fromMenu: true } : {});
  });

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

  /* --- Botões Ajuda (abrem modal de ajuda) --- */
  const helpButtons = [
    document.getElementById('help-btn'),
    document.getElementById('name-help'),
    document.getElementById('terms-help'),
    document.getElementById('instructions-help'),
    document.querySelector('.ranking-help')
  ];
  helpButtons.forEach(btn => {
    if (btn) btn.addEventListener('click', openHelpModal);
  });

  /* --- Cancelar partida (abre modal de confirmação) --- */
  const cancelMatchBtn = document.getElementById('cancel-match-btn');
  if (cancelMatchBtn) cancelMatchBtn.addEventListener('click', openCancelMatchModal);

  /* --- Delegação de cliques nos modais (garante que fecham e ações funcionem) --- */
  document.body.addEventListener('click', (e) => {
    const id = e.target.id || e.target.closest?.('[id]')?.id;
    const closeBtn = e.target.closest?.('button.app-modal-close, [id$="-close"]');
    if (closeBtn) {
      e.preventDefault();
      if (closeBtn.id === 'help-modal-close') closeHelpModal();
      else if (closeBtn.id === 'cancel-match-modal-close') closeCancelMatchModal();
      else if (closeBtn.id === 'instructions-carousel-close') closeInstructionsCarouselModal();
      return;
    }
    if (id === 'help-modal-instructions') {
      e.preventDefault();
      closeHelpModal();
      openInstructionsCarouselModal();
      return;
    }
    if (id === 'help-modal-call-tech') {
      e.preventDefault();
      closeHelpModal();
      return;
    }
    if (id === 'cancel-match-confirm') {
      e.preventDefault();
      closeCancelMatchModal();
      returnToStart();
      return;
    }
    if (id === 'cancel-match-back') {
      e.preventDefault();
      closeCancelMatchModal();
      return;
    }
    if (id === 'instructions-carousel-back') {
      e.preventDefault();
      closeInstructionsCarouselModal();
      return;
    }
    if (id === 'instructions-carousel-help') {
      e.preventDefault();
      closeInstructionsCarouselModal();
      openHelpModal();
      return;
    }
    if (id === 'instructions-carousel-prev') {
      e.preventDefault();
      instructionsCarouselIndex = (instructionsCarouselIndex - 1 + INSTRUCTIONS_CAROUSEL_TOTAL) % INSTRUCTIONS_CAROUSEL_TOTAL;
      updateInstructionsCarouselSlide();
      return;
    }
    if (id === 'instructions-carousel-next') {
      e.preventDefault();
      instructionsCarouselIndex = (instructionsCarouselIndex + 1) % INSTRUCTIONS_CAROUSEL_TOTAL;
      updateInstructionsCarouselSlide();
      return;
    }
    /* Backdrop: fechar ao clicar no overlay (no próprio modal, não na caixa) */
    const modal = e.target.closest?.('.app-modal');
    if (modal && e.target === modal) {
      e.preventDefault();
      if (modal.id === 'help-modal') closeHelpModal();
      else if (modal.id === 'cancel-match-modal') closeCancelMatchModal();
      else if (modal.id === 'instructions-carousel-modal') closeInstructionsCarouselModal();
    }
  }, true);

  initInstructionsCarousel();

  /* --- Voltar: uma tela anterior --- */
  const nameBack = document.getElementById('name-back');
  if (nameBack) nameBack.addEventListener('click', (e) => { e.preventDefault(); showScreen('idle'); });
  const termsBack = document.getElementById('terms-back');
  if (termsBack) termsBack.addEventListener('click', (e) => { e.preventDefault(); showScreen('name'); });
  const instructionsBack = document.getElementById('instructions-back');
  if (instructionsBack) instructionsBack.addEventListener('click', (e) => { e.preventDefault(); showScreen('terms'); });

  showScreen('idle');

  assetsData = await loadAssets();
  initNameScreen();

  window.finalizeGame = finalizeGame;
  window.returnToStart = returnToStart;
});
