document.addEventListener("DOMContentLoaded", () => {
    loadConfig();
    loadPrizes();

    document.getElementById("save-config-btn").addEventListener("click", saveConfig);
    const saveScoringBtn = document.getElementById("save-scoring-btn");
    if (saveScoringBtn) saveScoringBtn.addEventListener("click", saveConfig);
    document.getElementById("add-prize-form").addEventListener("submit", addPrize);
});

// --- CONFIGURAÇÃO (Timer) ---

async function loadConfig() {
    try {
        const res = await fetch("/api/config");
        const data = await res.json();

        document.getElementById("config-time-active").checked = data.timeLimitActive;
        document.getElementById("config-time-seconds").value = data.timeLimitSeconds;
        document.getElementById("config-stock-with-game").checked = data.stockWithGame !== false;

        document.getElementById("config-points-per-card").value = data.pointsPerCorrectCard ?? 3;
        document.getElementById("config-bonus-ideal").value = data.bonusIdealLineup ?? 20;
        document.getElementById("config-max-score").value = data.maxScore ?? 38;
    } catch (err) {
        console.error("Erro ao carregar config", err);
    }
}

async function saveConfig() {
    const active = document.getElementById("config-time-active").checked;
    const seconds = document.getElementById("config-time-seconds").value;
    const stockWithGame = document.getElementById("config-stock-with-game").checked;
    const pointsPerCardEl = document.getElementById("config-points-per-card");
    const bonusIdealEl = document.getElementById("config-bonus-ideal");
    const maxScoreEl = document.getElementById("config-max-score");
    const pointsPerCard = pointsPerCardEl ? (parseInt(pointsPerCardEl.value, 10) || 3) : 3;
    const bonusIdeal = bonusIdealEl ? (parseInt(bonusIdealEl.value, 10) || 20) : 20;
    const maxScore = maxScoreEl ? (parseInt(maxScoreEl.value, 10) || 38) : 38;
    const feedback = document.getElementById("config-feedback");

    try {
        const res = await fetch("/api/config", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                timeLimitActive: active,
                timeLimitSeconds: seconds,
                stockWithGame,
                pointsPerCorrectCard: pointsPerCard,
                bonusIdealLineup: bonusIdeal,
                maxScore
            })
        });

        if (res.ok) {
            feedback.innerText = "Configuração salva com sucesso!";
            feedback.className = "text-xs font-bold mt-2 h-4 text-emerald-400";
        } else {
            throw new Error();
        }
    } catch (err) {
        feedback.innerText = "Erro ao salvar.";
        feedback.className = "text-xs font-bold mt-2 h-4 text-red-400";
    }

    setTimeout(() => { feedback.innerText = ""; }, 3000);
}


// --- PRÊMIOS (Código existente mantido abaixo...) ---

async function loadPrizes() {
    const res = await fetch("/api/prizes");
    const data = await res.json();
    renderPrizes(data.prizes || []);
}

function renderPrizes(list) {
    const tbody = document.getElementById("prizes-list");
    tbody.innerHTML = "";

    list.forEach(p => {
        const tr = document.createElement("tr");
        tr.className = "hover:bg-slate-700/50 transition";
        tr.innerHTML = `
      <td class="p-3 font-bold text-white">${p.name}</td>
      <td class="p-3 font-mono text-blue-300">${p.threshold} pts</td>
      <td class="p-3 font-mono ${p.stock < 5 ? 'text-red-400' : 'text-emerald-400'}">${p.stock}</td>
      <td class="p-3 text-right gap-2 flex justify-end">
        <button onclick="updateStock('${p.id}', ${p.stock + 1})" class="bg-slate-700 hover:bg-slate-600 p-1 rounded text-xs px-2">+</button>
        <button onclick="updateStock('${p.id}', ${p.stock - 1})" class="bg-slate-700 hover:bg-slate-600 p-1 rounded text-xs px-2">-</button>
        <button onclick="deletePrize('${p.id}')" class="bg-red-900/50 hover:bg-red-800 text-red-200 p-1 rounded text-xs px-2 ml-2">Del</button>
      </td>
    `;
        tbody.appendChild(tr);
    });
}

async function addPrize(e) {
    e.preventDefault();
    const name = document.getElementById("new-name").value;
    const thr = document.getElementById("new-threshold").value;
    const stock = document.getElementById("new-stock").value;

    await fetch("/api/prizes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, threshold: thr, stock })
    });

    e.target.reset();
    loadPrizes();
}

async function updateStock(id, newStock) {
    if (newStock < 0) return;
    await fetch(`/api/prizes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stock: newStock })
    });
    loadPrizes();
}

async function deletePrize(id) {
    if (!confirm("Tem certeza?")) return;
    await fetch(`/api/prizes/${id}`, { method: "DELETE" });
    loadPrizes();
}

// Tornar funções acessíveis globalmente para o onclick do HTML
window.updateStock = updateStock;
window.deletePrize = deletePrize;