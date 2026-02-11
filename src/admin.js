async function apiGet() {
    const r = await fetch("/api/prizes");
    return r.json();
}
async function apiAdd({ name, stock, threshold }) {
    const r = await fetch("/api/prizes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, stock, threshold })
    });
    return r.json();
}
async function apiPatch(id, patch) {
    const r = await fetch(`/api/prizes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch)
    });
    return r.json();
}
async function apiDel(id) {
    const r = await fetch(`/api/prizes/${id}`, { method: "DELETE" });
    return r.json();
}

const els = {
    rows: document.getElementById("rows"),
    btnRefresh: document.getElementById("btn-refresh"),
    btnAdd: document.getElementById("btn-add"),
    newName: document.getElementById("new-name"),
    newStock: document.getElementById("new-stock"),
    newThreshold: document.getElementById("new-threshold"),
    addMsg: document.getElementById("add-msg"),
};

function rowHTML(p) {
    return `
    <tr data-id="${p.id}">
      <td class="p-3 font-mono text-xs text-slate-400">${p.id}</td>
      <td class="p-3">
        <input class="name bg-slate-800 border border-slate-700 rounded px-2 py-1 w-full" value="${escapeHtml(p.name)}" />
      </td>
      <td class="p-3">
        <input class="stock bg-slate-800 border border-slate-700 rounded px-2 py-1 w-24" type="number" value="${p.stock}" />
      </td>
      <td class="p-3">
        <input class="threshold bg-slate-800 border border-slate-700 rounded px-2 py-1 w-24" type="number" value="${p.threshold}" />
      </td>
      <td class="p-3 text-right whitespace-nowrap">
        <button class="save bg-emerald-600 hover:bg-emerald-500 rounded px-3 py-1 font-bold">Salvar</button>
        <button class="del bg-red-600 hover:bg-red-500 rounded px-3 py-1 font-bold ml-2">Excluir</button>
      </td>
    </tr>
  `;
}

function escapeHtml(s) {
    return String(s ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

async function render() {
    const data = await apiGet();
    els.rows.innerHTML = (data.prizes || []).map(rowHTML).join("");
}

els.btnRefresh.addEventListener("click", render);

els.btnAdd.addEventListener("click", async () => {
    const name = els.newName.value.trim();
    const stock = Number.parseInt(els.newStock.value, 10);
    const threshold = Number.parseInt(els.newThreshold.value, 10);

    if (!name) { els.addMsg.textContent = "Nome obrigatório."; return; }
    if (!Number.isFinite(stock) || stock < 0) { els.addMsg.textContent = "Estoque inválido."; return; }
    if (!Number.isFinite(threshold) || threshold < 0) { els.addMsg.textContent = "Threshold inválido."; return; }

    const res = await apiAdd({ name, stock, threshold });
    els.addMsg.textContent = res.ok ? "Adicionado!" : (res.error || "Erro ao adicionar.");
    if (res.ok) {
        els.newName.value = "";
        els.newStock.value = "";
        els.newThreshold.value = "";
        await render();
    }
});

els.rows.addEventListener("click", async (e) => {
    const tr = e.target.closest("tr[data-id]");
    if (!tr) return;
    const id = tr.dataset.id;

    if (e.target.classList.contains("save")) {
        const name = tr.querySelector(".name").value.trim();
        const stock = Number.parseInt(tr.querySelector(".stock").value, 10);
        const threshold = Number.parseInt(tr.querySelector(".threshold").value, 10);

        const res = await apiPatch(id, { name, stock, threshold });
        if (!res.ok) alert(res.error || "Erro ao salvar");
        else await render();
    }

    if (e.target.classList.contains("del")) {
        if (!confirm("Excluir este brinde?")) return;
        const res = await apiDel(id);
        if (!res.ok) alert(res.error || "Erro ao excluir");
        else await render();
    }
});

render();
