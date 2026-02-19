document.addEventListener("DOMContentLoaded", () => {
    loadManualStock();
    document.getElementById("add-manual-item-form").addEventListener("submit", addManualItem);
});

async function loadManualStock() {
    try {
        const res = await fetch("/api/manual-stock");
        const data = await res.ok ? await res.json() : { items: [] };
        renderManualStock(data.items || []);
    } catch (err) {
        console.error("Erro ao carregar estoque manual", err);
        renderManualStock([]);
    }
}

function renderManualStock(items) {
    const list = document.getElementById("manual-stock-list");
    const empty = document.getElementById("manual-stock-empty");
    list.innerHTML = "";
    empty.classList.toggle("hidden", items.length > 0);

    items.forEach((item) => {
        const li = document.createElement("li");
        li.className = "flex flex-wrap items-center gap-3 bg-slate-900/70 border border-slate-700 rounded-lg p-3";
        const qty = Number(item.quantity) || 0;
        const lowStock = qty < 5;
        li.innerHTML = `
            <span class="font-bold text-white flex-1 min-w-[140px]">${escapeHtml(item.name)}</span>
            <span class="font-mono px-2 py-1 rounded ${lowStock ? "bg-red-900/50 text-red-300" : "bg-slate-700 text-emerald-300"}">${qty} un.</span>
            <button type="button" data-withdraw-id="${escapeHtml(item.id)}" class="manual-withdraw-btn bg-amber-600 hover:bg-amber-500 text-white font-bold py-2 px-4 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed" ${qty === 0 ? "disabled" : ""}>
                Retirar brinde
            </button>
            <button type="button" data-delete-id="${escapeHtml(item.id)}" class="text-slate-400 hover:text-red-400 p-1 rounded text-xs" title="Remover item">✕</button>
        `;
        list.appendChild(li);
    });

    list.querySelectorAll(".manual-withdraw-btn").forEach((btn) => {
        btn.addEventListener("click", () => withdrawManualItem(btn.dataset.withdrawId));
    });
    list.querySelectorAll("[data-delete-id]").forEach((btn) => {
        btn.addEventListener("click", () => deleteManualItem(btn.dataset.deleteId));
    });
}

function escapeHtml(s) {
    const div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
}

async function addManualItem(e) {
    e.preventDefault();
    const name = document.getElementById("manual-item-name").value.trim();
    const quantity = parseInt(document.getElementById("manual-item-qty").value, 10) || 0;
    const feedback = document.getElementById("manual-stock-feedback");
    if (!name) return;
    try {
        const res = await fetch("/api/manual-stock", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, quantity })
        });
        const data = await res.json();
        if (res.ok) {
            feedback.textContent = "Item cadastrado.";
            feedback.className = "text-xs font-bold mt-2 h-4 text-emerald-400";
            e.target.reset();
            document.getElementById("manual-item-qty").value = 1;
            loadManualStock();
        } else {
            feedback.textContent = data.error || "Erro ao cadastrar.";
            feedback.className = "text-xs font-bold mt-2 h-4 text-red-400";
        }
    } catch (err) {
        feedback.textContent = "Erro ao cadastrar.";
        feedback.className = "text-xs font-bold mt-2 h-4 text-red-400";
    }
    setTimeout(() => { feedback.textContent = ""; }, 3000);
}

async function withdrawManualItem(id) {
    try {
        const res = await fetch(`/api/manual-stock/${id}/withdraw`, { method: "POST" });
        if (res.ok) loadManualStock();
    } catch (err) {
        console.error("Erro ao retirar brinde", err);
    }
}

async function deleteManualItem(id) {
    if (!confirm("Remover este item do estoque?")) return;
    try {
        await fetch(`/api/manual-stock/${id}`, { method: "DELETE" });
        loadManualStock();
    } catch (err) {
        console.error("Erro ao remover item", err);
    }
}
