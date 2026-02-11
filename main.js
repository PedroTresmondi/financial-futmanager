/* ============================================================
   Financial Football Manager
   - Tela inicial: nome do jogador com teclado virtual
   - Nome aparece no header e pode ser usado no modal final
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

const els = {};
let assetsData = [];
let currentProfileKey = null;
let currentProfile = null;
let placedCards = [];

// Player
let playerName = "";

// Drag state
let activeDrag = null;

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

function setPlayerName(name) {
  playerName = normalizeName(name);
  els.playerName.innerText = playerName || "--";
  try { localStorage.setItem(PLAYER_NAME_KEY, playerName); } catch (_) { }
}

function getThemeClass(suitability) {
  if (suitability <= 40) return "theme-low";
  if (suitability <= 70) return "theme-med";
  return "theme-high";
}

function getStars(percentage) {
  const starsCount = Math.round((percentage / 100) * 5);
  let html = "";
  for (let i = 0; i < 5; i++) html += `<span class="${i < starsCount ? "" : "star-dim"}">★</span>`;
  return html;
}

function isZoneAllowed(assetSuit, zone, profileKey) {
  const isSafe = assetSuit <= 40;
  const isRisky = assetSuit > 70;

  if (profileKey === "CONSERVADOR") {
    if (zone === "defense" && isRisky) return "Muito arriscado para a Defesa!";
    if (zone === "midfield" && isRisky) return "Alto risco deve ficar isolado no Ataque!";
  } else if (profileKey === "MODERADO") {
    if (zone === "defense" && isRisky) return "Defesa não suporta Alta Volatilidade!";
    if (zone === "attack" && isSafe) return "Conservador demais para o Ataque!";
  } else if (profileKey === "ARROJADO") {
    if (zone === "attack" && isSafe) return "Desperdício de Ataque!";
    if (zone === "midfield" && isSafe) return "Falta pimenta no Meio de Campo!";
  }

  return true;
}

function getAllowedZones(assetSuit, profileKey) {
  return {
    def: isZoneAllowed(assetSuit, "defense", profileKey) === true,
    mid: isZoneAllowed(assetSuit, "midfield", profileKey) === true,
    atk: isZoneAllowed(assetSuit, "attack", profileKey) === true
  };
}

function getRiskBorderClass(asset) {
  if (asset.suitability > 70) return "risk-high";
  if (asset.suitability > 40) return "risk-med";
  return "risk-low";
}

// ---------- HTML generators ----------
function createPremiumCardHTML(asset, allowedZones) {
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

    <!-- NOVO: ZONAS PERMITIDAS -->
    <div class="mt-2 pt-2 border-t border-white/10">
      <div class="text-[10px] text-white/70 font-bold uppercase tracking-widest mb-1">Posições</div>
      <div class="zone-indicators">
        <span class="zone-box ${allowedZones.def ? "active-def" : ""}">DEF</span>
        <span class="zone-box ${allowedZones.mid ? "active-mid" : ""}">MEI</span>
        <span class="zone-box ${allowedZones.atk ? "active-atk" : ""}">ATQ</span>
      </div>
    </div>

    <div class="card-footer-pill mt-2">
      ${asset.suitability > 70 ? "AGRESSIVO" : asset.suitability > 40 ? "MODERADO" : "CONSERVADOR"}
    </div>
  `;
}


function createFieldCardHTML(asset, allowedZones) {
  return `
    <div class="flex flex-col h-full relative z-10 pointer-events-none">
      <div class="flex justify-between items-start mb-1">
        <span class="text-[10px]">🪙</span>
        <span class="text-[8px] font-mono bg-slate-800/80 px-1 rounded text-white border border-white/20">${asset.suitability}</span>
      </div>

      <div class="text-center mb-1">
        <div class="font-bold text-[8px] text-white leading-tight font-display mb-0.5 truncate px-1">${asset.name}</div>
        <div class="text-[6px] text-slate-400 truncate">${asset.type}</div>
      </div>

      <div class="space-y-1 mt-auto">
        <div class="compact-bar"><div class="compact-fill" style="width:${asset.retorno}%; background:#3b82f6;"></div></div>
        <div class="compact-bar"><div class="compact-fill" style="width:${asset.seguranca}%; background:#10b981;"></div></div>
      </div>

      <div class="zone-indicators pt-1 mt-1 border-t border-slate-700/50">
        <span class="zone-box ${allowedZones.def ? "active-def" : ""}">D</span>
        <span class="zone-box ${allowedZones.mid ? "active-mid" : ""}">M</span>
        <span class="zone-box ${allowedZones.atk ? "active-atk" : ""}">A</span>
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

  // linha de ações
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
    // letra
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

  initGame(); // inicia jogo com nome já setado
}

function initNameScreen() {
  buildVirtualKeyboard();

  // Preenche com o último nome usado (se existir)
  let saved = "";
  try { saved = localStorage.getItem(PLAYER_NAME_KEY) || ""; } catch (_) { }
  els.nameInput.value = saved || "";
  updateNameUI();

  // Clique nos botões do teclado
  els.vkKeys.addEventListener("click", (e) => {
    const btn = e.target?.closest?.("button[data-key]");
    if (!btn) return;
    applyNameKey(btn.dataset.key);
  });

  // Limpar
  els.nameClear.addEventListener("click", () => {
    els.nameInput.value = "";
    updateNameUI();
  });

  // Começar
  els.startGameBtn.addEventListener("click", startGameFromNameScreen);

  // Teclado físico (sem abrir teclado do celular)
  window.addEventListener("keydown", (e) => {
    // só quando a tela de nome está visível
    if (els.nameScreen.classList.contains("hidden")) return;

    if (e.key === "Enter") {
      e.preventDefault();
      startGameFromNameScreen();
      return;
    }
    if (e.key === "Backspace") {
      e.preventDefault();
      applyNameKey("BACKSPACE");
      return;
    }
    if (e.key === " ") {
      e.preventDefault();
      applyNameKey("SPACE");
      return;
    }

    // letras/números básicos
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

  // Nome no header
  els.playerName = document.getElementById("player-name");

  // Tela de nome
  els.nameScreen = document.getElementById("name-screen");
  els.nameInput = document.getElementById("name-input");
  els.nameWarning = document.getElementById("name-warning");
  els.vkKeys = document.getElementById("vk-keys");
  els.startGameBtn = document.getElementById("start-game-btn");
  els.nameClear = document.getElementById("name-clear");
}

function initGame() {
  placedCards = [];
  els.cardsContainer.innerHTML = "";
  els.fieldLayer.innerHTML = "";

  els.resultModal.classList.add("hidden");
  els.finishBtn.classList.add("hidden");

  const keys = Object.keys(PROFILES);
  currentProfileKey = keys[Math.floor(Math.random() * keys.length)];
  currentProfile = PROFILES[currentProfileKey];

  els.profile.innerText = currentProfile.label;
  els.profile.className = `text-sm font-bold font-display uppercase tracking-widest ${currentProfile.color}`;
  els.targetRange.innerText = `${currentProfile.min} - ${currentProfile.max}`;

  updateStats();
  renderSidebar();
}

function renderSidebar() {
  els.cardsContainer.innerHTML = "";

  assetsData.forEach(asset => {
    const card = document.createElement("div");
    const themeClass = getThemeClass(asset.suitability);

    const allowedZones = getAllowedZones(asset.suitability, currentProfileKey);

    card.className = `premium-card sidebar-item ${themeClass}`;
    card.dataset.id = String(asset.id);
    card.innerHTML = createPremiumCardHTML(asset, allowedZones);

    card.addEventListener("pointerdown", (e) => initDrag(e, asset, "sidebar", card));
    els.cardsContainer.appendChild(card);
  });
}


// ---------- Drag system (Pointer Events) ----------
function initDrag(e, asset, sourceType, originalEl) {
  if (e.pointerType === "mouse" && e.button !== 0) return;

  e.preventDefault();

  const ghost = document.createElement("div");
  const borderClass = getRiskBorderClass(asset);

  const themeClass = getThemeClass(asset.suitability);
  ghost.className = `field-card ${borderClass} ${themeClass} drag-ghost`;
  ghost.style.width = `${FIELD_CARD_W}px`;
  ghost.style.height = `${FIELD_CARD_H}px`;
  ghost.style.left = `${e.clientX}px`;
  ghost.style.top = `${e.clientY}px`;
  ghost.style.transform = `translate(-50%, -50%) scale(1.2)`;

  const allowed = getAllowedZones(asset.suitability, currentProfileKey);
  ghost.innerHTML = createFieldCardHTML(asset, allowed);

  document.body.appendChild(ghost);

  originalEl.classList.add("is-dragging");

  activeDrag = {
    pointerId: e.pointerId,
    asset,
    sourceType,
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

  if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return;

  let x = clientX - rect.left - offsetX;
  let y = clientY - rect.top - offsetY;

  x = clamp(x, 0, rect.width - FIELD_CARD_W);
  y = clamp(y, 0, rect.height - FIELD_CARD_H);

  const existingIndex = placedCards.findIndex(c => c.id === asset.id);

  if (existingIndex === -1 && placedCards.length >= MAX_PLAYERS) {
    showError("Máximo de 6 jogadores!");
    return;
  }

  if (checkCollision(x, y, asset.id)) {
    showError("Sem espaço aqui!");
    return;
  }

  const zoneHeight = rect.height / 3;
  let zone = "defense";
  if (y + (FIELD_CARD_H / 2) < zoneHeight) zone = "attack";
  else if (y + (FIELD_CARD_H / 2) < zoneHeight * 2) zone = "midfield";

  const permission = isZoneAllowed(asset.suitability, zone, currentProfileKey);
  if (permission !== true) {
    showError(permission);
    return;
  }

  if (existingIndex !== -1) {
    const oldEl = document.querySelector(`.field-item[data-id="${asset.id}"]`);
    if (oldEl) oldEl.remove();
    placedCards.splice(existingIndex, 1);
  } else {
    const sidebarItem = document.querySelector(`.sidebar-item[data-id="${asset.id}"]`);
    if (sidebarItem) sidebarItem.classList.add("hidden");
  }

  placeCardOnField(asset, x, y);
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

function placeCardOnField(asset, x, y) {
  const el = document.createElement("div");
  const allowed = getAllowedZones(asset.suitability, currentProfileKey);
  const borderClass = getRiskBorderClass(asset);

  const themeClass = getThemeClass(asset.suitability);
  el.className = `field-card field-item ${borderClass} ${themeClass}`;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.dataset.id = String(asset.id);
  el.innerHTML = createFieldCardHTML(asset, allowed);

  el.addEventListener("pointerdown", (e) => initDrag(e, asset, "field", el));

  const closeBtn = document.createElement("div");
  closeBtn.className = "absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full text-white flex items-center justify-center font-bold text-xs cursor-pointer shadow-md z-50";
  closeBtn.innerText = "×";
  closeBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
  closeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const sidebarItem = document.querySelector(`.sidebar-item[data-id="${asset.id}"]`);
    if (sidebarItem) sidebarItem.classList.remove("hidden");
    el.remove();
    placedCards = placedCards.filter(c => c.id !== asset.id);
    updateStats();
  });

  el.appendChild(closeBtn);

  els.fieldLayer.appendChild(el);
  placedCards.push({ id: asset.id, asset, x, y });
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

  const totalSuit = placedCards.reduce((acc, c) => acc + c.asset.suitability, 0);
  const avgSuit = Math.round(totalSuit / placedCards.length);
  const inRange = avgSuit >= currentProfile.min && avgSuit <= currentProfile.max;

  let points = 0;
  if (inRange) {
    points = 50 + (placedCards.length * 10);
    if (typeof confetti === "function") confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
  } else {
    const dist = avgSuit < currentProfile.min ? (currentProfile.min - avgSuit) : (avgSuit - currentProfile.max);
    points = Math.max(0, 50 - dist);
  }

  els.finalScore.innerText = String(points);
  els.finalRiskVal.innerText = String(avgSuit);
  els.finalRiskTarget.innerText = `Meta: ${currentProfile.min} - ${currentProfile.max}`;

  const who = playerName ? `, <strong class="text-white">${playerName}</strong>` : "";

  if (inRange) {
    points = 50 + (placedCards.length * 10);
  } else {
    els.finalRiskVal.className = "text-2xl font-bold text-red-500 font-display";
    els.finalMessage.innerHTML =
      `⚠️ <strong class="text-white">Atenção${who}!</strong><br>` +
      `Sua média (${avgSuit}) ficou fora do alvo. Tente equilibrar melhor.`;
  }

  els.resultModal.classList.remove("hidden");
}

function showError(msg) {
  els.toast.innerText = msg;
  els.toast.style.opacity = "1";
  els.toast.style.transform = "translate(-50%, 0)";
  els.toast.classList.add("error-anim");

  setTimeout(() => {
    els.toast.style.opacity = "0";
    els.toast.style.transform = "translate(-50%, -20px)";
    els.toast.classList.remove("error-anim");
  }, 3000);
}

function resetGame() {
  initGame();
}

// ---------- Boot ----------
document.addEventListener("DOMContentLoaded", async () => {
  bindEls();

  // nome no header começa como --
  setPlayerName("");

  els.finishBtn.addEventListener("click", finalizeGame);
  els.resetBtn.addEventListener("click", resetGame);
  els.playAgainBtn.addEventListener("click", resetGame);

  assetsData = await loadAssets();

  // inicializa teclado virtual e fica na tela de nome
  initNameScreen();
});
