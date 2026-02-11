/* ============================================================
   Financial Football Manager
   NOVA LÓGICA:
   - Cada ativo tem 1 posição correta (DEF/MEI/ATQ) por perfil
   - Colocar na posição errada: perde pontos (mas pode colocar)
   - Sem indicadores visuais de zona / agressivo etc
   - DEBUG MODE: tecla P liga/desliga e mostra tudo
   ============================================================ */

const PROFILES = {
  CONSERVADOR: { min: 15, max: 35, color: "text-blue-400", label: "Conservador" },
  MODERADO: { min: 36, max: 60, color: "text-yellow-400", label: "Moderado" },
  ARROJADO: { min: 61, max: 100, color: "text-red-500", label: "Arrojado" }
};

const MAX_PLAYERS = 6;
const FIELD_CARD_W = 90;
const FIELD_CARD_H = 126;

const PLAYER_NAME_KEY = "ffm_player_name";

const SCORE_CORRECT = 10;
const SCORE_WRONG = -5; // perde pontos, mas nunca fica < 0

const els = {};
let assetsData = [];
let currentProfileKey = null;
let currentProfile = null;

let placedCards = []; // { id, asset, x, y, zone, correct, delta }
let gameScore = 0;

let playerName = "";

// Drag state
let activeDrag = null;

// Debug mode
let debugMode = false;

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


function getRiskKey(assetSuit) {
  if (assetSuit <= 40) return "low";
  if (assetSuit <= 70) return "med";
  return "high";
}


function setPlayerName(name) {
  playerName = normalizeName(name);
  els.playerName.innerText = playerName || "--";
  try { localStorage.setItem(PLAYER_NAME_KEY, playerName); } catch (_) { }
}

function setDebugMode(on) {
  debugMode = !!on;
  document.body.classList.toggle("debug", debugMode);
  if (els.debugBadge) {
    els.debugBadge.classList.toggle("hidden", !debugMode);
  }
  showToast(debugMode ? "DEBUG: ON" : "DEBUG: OFF", "info");
}

function toggleDebug() {
  setDebugMode(!debugMode);
}

function getThemeClass(suitability) {
  if (suitability <= 40) return "theme-low";
  if (suitability <= 70) return "theme-med";
  return "theme-high";
}

function getRiskBorderClass(asset) {
  if (asset.suitability > 70) return "risk-high";
  if (asset.suitability > 40) return "risk-med";
  return "risk-low";
}

function zoneFromPoint(centerY, fieldHeight) {
  const zoneHeight = fieldHeight / 3;
  if (centerY < zoneHeight) return "attack";      // topo
  if (centerY < zoneHeight * 2) return "midfield"; // meio
  return "defense";                                // baixo
}

/**
 * POSIÇÃO CORRETA POR PERFIL
 * (o mesmo ativo pode mudar de zona dependendo do perfil)
 */
function expectedZoneFor(assetSuit, profileKey) {
// thresholds escolhidos para permitir:
// Ex: um ativo “médio” pode ser ATQ no conservador e MEI no arrojado.
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

function deltaForPlacement(correct) {
  return correct ? SCORE_CORRECT : SCORE_WRONG;
}

function applyScoreDelta(delta) {
  gameScore = Math.max(0, gameScore + delta);
  if (els.scoreVal) els.scoreVal.innerText = String(gameScore);
}

// ---------- Stars (mantém) ----------
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

    <!-- DEBUG: rótulo agressivo/moderado/conservador -->
    <div class="debug-only card-footer-pill mt-2">
      ${asset.suitability > 70 ? "AGRESSIVO" : asset.suitability > 40 ? "MODERADO" : "CONSERVADOR"}
    </div>
  `;
}

function createFieldCardHTML(asset) {
  return `
    <div class="flex flex-col h-full relative z-10 pointer-events-none">

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

      <!-- (opcional) descrição curtinha -->
      <div class="field-desc text-slate-300 italic truncate px-1 mb-1">"${asset.desc}"</div>

      <!-- AGORA IGUAL À LISTA: atributos com estrelas -->
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

        <!-- DEBUG: posição correta (se você estiver mantendo isso) -->
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

    </div>
  `;
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

// ---------- Name Screen / Virtual Keyboard (mantém do seu) ----------
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

  initGame();
}

function initNameScreen() {
  buildVirtualKeyboard();

  let saved = "";
  try { saved = localStorage.getItem(PLAYER_NAME_KEY) || ""; } catch (_) { }
  els.nameInput.value = saved || "";
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
  els.cardsContainer = document.getElementById("cards-container");
  els.fieldLayer = document.getElementById("field-interactive-layer");
  els.profile = document.getElementById("target-profile");
  els.targetRange = document.getElementById("target-range");
  els.playersCount = document.getElementById("players-count");
  els.finishBtn = document.getElementById("finish-btn");
  els.resetBtn = document.getElementById("reset-btn");

  els.resultModal = document.getElementById("result-modal");
  els.finalScore = document.getElementById("final-score");
  els.finalRiskVal = document.getElementById("final-risk-val");
  els.finalRiskTarget = document.getElementById("final-risk-target");
  els.finalMessage = document.getElementById("final-message");
  els.playAgainBtn = document.getElementById("play-again-btn");

  els.toast = document.getElementById("error-toast");

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

  els.profile.innerText = currentProfile.label;
  els.profile.className = `text-sm font-bold font-display uppercase tracking-widest ${currentProfile.color}`;

  // Mantemos no código (debug-only no HTML)
  if (els.targetRange) els.targetRange.innerText = `${currentProfile.min} - ${currentProfile.max}`;
}

function initGame() {
  placedCards = [];
  gameScore = 0;
  if (els.scoreVal) els.scoreVal.innerText = "0";

  els.cardsContainer.innerHTML = "";
  els.fieldLayer.innerHTML = "";

  els.resultModal.classList.add("hidden");
  els.finishBtn.classList.add("hidden");

  pickProfile();

  updateStats();
  renderSidebar();
}

function renderSidebar() {
  els.cardsContainer.innerHTML = "";

  assetsData.forEach(asset => {
    const card = document.createElement("div");

    card.className = `premium-card sidebar-item`; // sem theme-...
    card.dataset.id = String(asset.id);
    card.dataset.risk = getRiskKey(asset.suitability); // <- novo
    card.innerHTML = createPremiumCardHTML(asset);

    card.addEventListener("pointerdown", (e) => initDrag(e, asset, "sidebar", card));
    els.cardsContainer.appendChild(card);
  });
}


// ---------- Drag system ----------
function initDrag(e, asset, sourceType, originalEl) {
  if (e.pointerType === "mouse" && e.button !== 0) return;
  e.preventDefault();

  const ghost = document.createElement("div");

  const borderClass = getRiskBorderClass(asset);
  const themeClass = getThemeClass(asset.suitability);

  ghost.className = `field-card ${borderClass} drag-ghost`;
  ghost.dataset.risk = getRiskKey(asset.suitability);
  ghost.style.width = `${FIELD_CARD_W}px`;
  ghost.style.height = `${FIELD_CARD_H}px`;
  ghost.style.left = `${e.clientX}px`;
  ghost.style.top = `${e.clientY}px`;
  ghost.style.transform = `translate(-50%, -50%) scale(1.2)`;

  ghost.innerHTML = createFieldCardHTML(asset);

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

  processDrop(asset.id, e.clientX, e.clientY, FIELD_CARD_W / 2, FIELD_CARD_H / 2);

  activeDrag = null;
}

// ---------- Drop / Placement ----------
function processDrop(assetId, clientX, clientY, offsetX, offsetY) {
  const asset = assetsData.find(a => a.id === assetId);
  if (!asset) return;

  const rect = els.fieldLayer.getBoundingClientRect();

  // fora do campo
  if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return;

  let x = clientX - rect.left - offsetX;
  let y = clientY - rect.top - offsetY;

  x = clamp(x, 0, rect.width - FIELD_CARD_W);
  y = clamp(y, 0, rect.height - FIELD_CARD_H);

  const existingIndex = placedCards.findIndex(c => c.id === asset.id);
  if (existingIndex === -1 && placedCards.length >= MAX_PLAYERS) {
    showToast("Máximo de 6 jogadores!", "error");
    return;
  }

  if (checkCollision(x, y, asset.id)) {
    showToast("Sem espaço aqui!", "error");
    return;
  }

  // ZONA onde o jogador soltou
  const actualZone = zoneFromPoint(y + (FIELD_CARD_H / 2), rect.height);

  // ZONA correta do ativo para o perfil
  const expected = expectedZoneFor(asset.suitability, currentProfileKey);
  const correct = (actualZone === expected);
  const delta = deltaForPlacement(correct);

  // aplica score (considerando reposicionamento)
  if (existingIndex !== -1) {
    // remove contribuição anterior
    applyScoreDelta(-placedCards[existingIndex].delta);

    const oldEl = document.querySelector(`.field-item[data-id="${asset.id}"]`);
    if (oldEl) oldEl.remove();
    placedCards.splice(existingIndex, 1);
  } else {
    // some na sidebar se é novo
    const sidebarItem = document.querySelector(`.sidebar-item[data-id="${asset.id}"]`);
    if (sidebarItem) sidebarItem.classList.add("hidden");
  }

  // adiciona nova contribuição
  applyScoreDelta(delta);

  if (!correct) showToast(`Posição errada (${delta})`, "warn");

  placeCardOnField(asset, x, y, actualZone, correct, delta);
  updateStats();
}

function checkCollision(newX, newY, ignoreId) {
  const margin = 5;
  for (const card of placedCards) {
    if (card.id === ignoreId) continue;
    const hit =
      newX < card.x + FIELD_CARD_W - margin &&
      newX + FIELD_CARD_W - margin > card.x &&
      newY < card.y + FIELD_CARD_H - margin &&
      newY + FIELD_CARD_H - margin > card.y;
    if (hit) return true;
  }
  return false;
}

function placeCardOnField(asset, x, y, zone, correct, delta) {
  const el = document.createElement("div");

  const borderClass = getRiskBorderClass(asset);
  const themeClass = getThemeClass(asset.suitability);

  el.className = `field-card field-item ${borderClass}`;
  el.dataset.risk = getRiskKey(asset.suitability);
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.dataset.id = String(asset.id);
  el.innerHTML = createFieldCardHTML(asset);

  // drag no campo
  el.addEventListener("pointerdown", (e) => initDrag(e, asset, "field", el));

  // botão remover
  const closeBtn = document.createElement("div");
  closeBtn.className = "absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full text-white flex items-center justify-center font-bold text-xs cursor-pointer shadow-md z-50";
  closeBtn.innerText = "×";
  closeBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
  closeBtn.addEventListener("click", (e) => {
    e.stopPropagation();

    // devolve pontos do card removido
    const idx = placedCards.findIndex(c => c.id === asset.id);
    if (idx !== -1) {
      applyScoreDelta(-placedCards[idx].delta);
      placedCards.splice(idx, 1);
    }

    const sidebarItem = document.querySelector(`.sidebar-item[data-id="${asset.id}"]`);
    if (sidebarItem) sidebarItem.classList.remove("hidden");

    el.remove();
    updateStats();
  });

  el.appendChild(closeBtn);

  els.fieldLayer.appendChild(el);
  placedCards.push({ id: asset.id, asset, x, y, zone, correct, delta });
}

// ---------- UI / Stats ----------
function updateStats() {
  els.playersCount.innerText = `${placedCards.length}/6`;

  if (placedCards.length === MAX_PLAYERS) {
    els.playersCount.classList.add("limit-warning");
    els.finishBtn.classList.remove("hidden");
  } else {
    els.playersCount.classList.remove("limit-warning");
    els.finishBtn.classList.add("hidden");
  }
}

function finalizeGame() {
  if (placedCards.length === 0) return;

  const correctCount = placedCards.filter(c => c.correct).length;
  const wrongCount = placedCards.length - correctCount;

  els.finalScore.innerText = String(gameScore);

  // reaproveita o card “Risco Médio” como “Acertos”
  els.finalRiskVal.innerText = `${correctCount}/${placedCards.length}`;
  els.finalRiskVal.className = `text-2xl font-bold font-display ${wrongCount === 0 ? "text-emerald-400" : "text-yellow-400"}`;
  els.finalRiskTarget.innerText = `Erros: ${wrongCount}`;

  const who = playerName ? `, <strong class="text-white">${playerName}</strong>` : "";

  if (wrongCount === 0 && placedCards.length === MAX_PLAYERS) {
    els.finalMessage.innerHTML =
      `🏆 <strong class="text-white">Perfeito${who}!</strong><br>` +
      `Você posicionou todos os ativos corretamente para o perfil <strong>${currentProfile.label}</strong>.`;
  } else {
    els.finalMessage.innerHTML =
      `🎯 <strong class="text-white">Boa${who}!</strong><br>` +
      `Você acertou <strong>${correctCount}</strong> e errou <strong>${wrongCount}</strong>. Tente melhorar o posicionamento.`;
  }

  els.resultModal.classList.remove("hidden");
}

function showToast(msg, kind = "error") {
  // popups só no DEBUG
  if (!debugMode) return;

  const t = els.toast;

  // kind: error | warn | info
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

function resetGame() {
  initGame();
}

// ---------- Boot ----------
document.addEventListener("DOMContentLoaded", async () => {
  bindEls();

  // defaults
  setPlayerName("");
  setDebugMode(false);

  els.finishBtn.addEventListener("click", finalizeGame);
  els.resetBtn.addEventListener("click", resetGame);
  els.playAgainBtn.addEventListener("click", resetGame);

  // tecla P: debug (só quando jogo estiver ativo)
  window.addEventListener("keydown", (e) => {
    // se a tela de nome estiver aberta, não toggle debug
    if (!els.nameScreen.classList.contains("hidden")) return;

    if (e.key === "p" || e.key === "P") {
      e.preventDefault();
      toggleDebug();
    }
  }, { passive: false });

  assetsData = await loadAssets();
  initNameScreen();
});
