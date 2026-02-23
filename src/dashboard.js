import * as api from "./api.js";

document.addEventListener("DOMContentLoaded", () => {
  loadDashboard();
  document.querySelectorAll(".heatmap-filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => setHeatmapProfile(btn.dataset.profile));
  });
});

let allGames = [];
let heatmapProfile = "ALL";

function setHeatmapProfile(profile) {
  heatmapProfile = profile;
  document.querySelectorAll(".heatmap-filter-btn").forEach((btn) => {
    const active = btn.dataset.profile === profile;
    btn.className = "heatmap-filter-btn px-2 py-0.5 rounded text-xs font-bold transition " +
      (active ? "bg-violet-600 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600");
  });
  renderHeatmap();
}

async function loadDashboard() {
  const loading = document.getElementById("dashboard-loading");
  const content = document.getElementById("dashboard-content");
  const errEl = document.getElementById("dashboard-error");
  try {
    const data = await api.getGames();
    allGames = data.games || [];
    loading.classList.add("hidden");
    content.classList.remove("hidden");
    content.classList.add("contents");
    renderStats();
    renderProfileMetrics();
    renderMatrixAssetProfile();
    renderByUser();
    renderHeatmap();
    renderTopByZone();
    renderByDay();
  } catch (err) {
    loading.classList.add("hidden");
    errEl.classList.remove("hidden");
    errEl.textContent = err.message || "Erro ao carregar partidas.";
  }
}

function renderStats() {
  const total = allGames.length;
  const uniqueNames = new Set();
  const byProfile = { CONSERVADOR: 0, MODERADO: 0, ARROJADO: 0 };
  allGames.forEach((g) => {
    const name = (g.playerName || "").trim();
    if (name) uniqueNames.add(name.toUpperCase());
    const p = (g.profile || "").toUpperCase();
    if (byProfile[p] !== undefined) byProfile[p]++;
  });
  document.getElementById("stat-total-games").textContent = total.toLocaleString("pt-BR");
  const uniqueEl = document.getElementById("stat-unique-names");
  if (uniqueEl) uniqueEl.textContent = uniqueNames.size.toLocaleString("pt-BR");
  document.getElementById("stat-conservador").textContent = byProfile.CONSERVADOR.toLocaleString("pt-BR");
  document.getElementById("stat-moderado").textContent = byProfile.MODERADO.toLocaleString("pt-BR");
  document.getElementById("stat-arrojado").textContent = byProfile.ARROJADO.toLocaleString("pt-BR");
}

function renderProfileMetrics() {
  const profiles = ["CONSERVADOR", "MODERADO", "ARROJADO"];
  const labels = { CONSERVADOR: "Conservador", MODERADO: "Moderado", ARROJADO: "Arrojado" };
  const colors = { CONSERVADOR: "text-blue-400", MODERADO: "text-amber-400", ARROJADO: "text-red-400" };
  const data = {};
  profiles.forEach((p) => {
    data[p] = { count: 0, totalPoints: 0, correct: 0, totalCards: 0 };
  });
  allGames.forEach((g) => {
    const p = (g.profile || "").toUpperCase();
    if (!data[p]) return;
    data[p].count++;
    data[p].totalPoints += Number(g.points) || 0;
    (g.cards || []).forEach((c) => {
      data[p].totalCards++;
      if (c.correct) data[p].correct++;
    });
  });
  const rows = profiles.map((p) => {
    const d = data[p];
    const avg = d.count ? (d.totalPoints / d.count).toFixed(1) : "—";
    const rate = d.totalCards ? ((d.correct / d.totalCards) * 100).toFixed(1) + "%" : "—";
    return { profile: labels[p], count: d.count, avg, rate, color: colors[p] };
  });
  const tbody = document.getElementById("table-by-profile-metrics");
  if (!tbody) return;
  tbody.innerHTML = rows
    .map(
      (r) =>
        `<tr class="hover:bg-slate-700/50">
          <td class="p-1.5 font-medium ${r.color}">${escapeHtml(r.profile)}</td>
          <td class="p-1.5 text-right font-mono">${r.count}</td>
          <td class="p-1.5 text-right font-mono text-emerald-400">${r.avg}</td>
          <td class="p-1.5 text-right font-mono">${r.rate}</td>
        </tr>`
    )
    .join("");
}

function buildMatrixAssetProfile() {
  const map = {};
  const profiles = ["CONSERVADOR", "MODERADO", "ARROJADO"];
  const games =
    heatmapProfile === "ALL"
      ? allGames
      : allGames.filter((g) => (g.profile || "").toUpperCase() === heatmapProfile);
  games.forEach((g) => {
    (g.cards || []).forEach((c) => {
      const assetKey = String(c.assetId ?? c.assetName ?? "?");
      const name = c.assetName || `Ativo ${c.assetId}`;
      const profile = (g.profile || "").toUpperCase();
      if (!profiles.includes(profile)) return;
      if (!map[assetKey]) map[assetKey] = { name, CONSERVADOR: 0, MODERADO: 0, ARROJADO: 0 };
      if (map[assetKey][profile] !== undefined) map[assetKey][profile]++;
    });
  });
  return Object.entries(map).map(([id, data]) => ({
    id,
    ...data,
    total: (data.CONSERVADOR || 0) + (data.MODERADO || 0) + (data.ARROJADO || 0),
  }));
}

function renderMatrixAssetProfile() {
  const rows = buildMatrixAssetProfile();
  const maxVal = Math.max(1, ...rows.map((r) => Math.max(r.CONSERVADOR || 0, r.MODERADO || 0, r.ARROJADO || 0)));
  function heatColor(v) {
    if (v <= 0) return "rgba(51, 65, 85, 0.3)";
    const t = Math.min(1, v / maxVal);
    const r = Math.round(147 + (236 - 147) * t);
    const g = Math.round(51 + (72 - 51) * t);
    const b = Math.round(139 + (233 - 139) * t);
    return `rgb(${r},${g},${b})`;
  }
  const tbody = document.getElementById("matrix-asset-profile-body");
  if (!tbody) return;
  tbody.innerHTML = rows
    .sort((a, b) => b.total - a.total)
    .map(
      (r) =>
        `<tr class="hover:bg-slate-700/30">
          <td class="p-1.5 font-medium truncate max-w-[120px]">${escapeHtml(r.name)}</td>
          <td class="p-1 text-center font-mono" style="background:${heatColor(r.CONSERVADOR || 0)}">${r.CONSERVADOR || 0}</td>
          <td class="p-1 text-center font-mono" style="background:${heatColor(r.MODERADO || 0)}">${r.MODERADO || 0}</td>
          <td class="p-1 text-center font-mono" style="background:${heatColor(r.ARROJADO || 0)}">${r.ARROJADO || 0}</td>
          <td class="p-1 text-center font-mono font-bold">${r.total}</td>
        </tr>`
    )
    .join("");
}

function renderByUser() {
  const byUser = new Map();
  allGames.forEach((g) => {
    const name = (g.playerName || "").trim() || "—";
    if (!byUser.has(name)) byUser.set(name, { count: 0, totalPoints: 0 });
    byUser.get(name).count++;
    byUser.get(name).totalPoints += Number(g.points) || 0;
  });
  const rows = Array.from(byUser.entries())
    .map(([name, data]) => ({ name, ...data, avg: data.count ? (data.totalPoints / data.count).toFixed(0) : 0 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 50);
  const tbody = document.getElementById("table-by-user");
  tbody.innerHTML = rows
    .map(
      (r) =>
        `<tr class="hover:bg-slate-700/50">
          <td class="p-1.5 font-medium truncate max-w-[100px]">${escapeHtml(r.name)}</td>
          <td class="p-1.5 text-right font-mono">${r.count}</td>
          <td class="p-1.5 text-right font-mono text-emerald-400">${r.avg}</td>
        </tr>`
    )
    .join("");
}

function buildHeatmapData() {
  const zones = ["defense", "midfield", "attack"];
  const map = {};
  const games =
    heatmapProfile === "ALL"
      ? allGames
      : allGames.filter((g) => (g.profile || "").toUpperCase() === heatmapProfile);
  games.forEach((g) => {
    (g.cards || []).forEach((c) => {
      const assetKey = String(c.assetId ?? c.assetName ?? "?");
      const name = c.assetName || `Ativo ${c.assetId}`;
      const zone = (c.zone || "").toLowerCase();
      if (!zones.includes(zone)) return;
      if (!map[assetKey]) map[assetKey] = { name, defense: 0, midfield: 0, attack: 0 };
      if (zone === "defense") map[assetKey].defense++;
      if (zone === "midfield") map[assetKey].midfield++;
      if (zone === "attack") map[assetKey].attack++;
    });
  });
  return Object.entries(map).map(([id, data]) => ({ id, ...data }));
}

function renderHeatmap() {
  const rows = buildHeatmapData();
  const maxVal = Math.max(1, ...rows.flatMap((r) => [r.defense, r.midfield, r.attack]));
  function heatColor(v) {
    if (v <= 0) return "rgba(51, 65, 85, 0.3)";
    const t = v / maxVal;
    const r = Math.round(147 + (236 - 147) * t);
    const g = Math.round(51 + (72 - 51) * t);
    const b = Math.round(139 + (233 - 139) * t);
    return `rgb(${r},${g},${b})`;
  }
  const tbody = document.getElementById("heatmap-body");
  tbody.innerHTML = rows
    .sort((a, b) => (b.defense + b.midfield + b.attack) - (a.defense + a.midfield + a.attack))
    .map(
      (r) =>
        `<tr class="hover:bg-slate-700/30">
          <td class="p-1.5 font-medium truncate max-w-[100px]">${escapeHtml(r.name)}</td>
          <td class="p-1 text-center font-mono" style="background:${heatColor(r.defense)}">${r.defense}</td>
          <td class="p-1 text-center font-mono" style="background:${heatColor(r.midfield)}">${r.midfield}</td>
          <td class="p-1 text-center font-mono" style="background:${heatColor(r.attack)}">${r.attack}</td>
        </tr>`
    )
    .join("");
}

function renderTopByZone() {
  const zones = { defense: [], midfield: [], attack: [] };
  const key = (c) => String(c.assetId ?? c.assetName ?? "?");
  const name = (c) => c.assetName || `Ativo ${c.assetId}`;
  allGames.forEach((g) => {
    (g.cards || []).forEach((c) => {
      const z = (c.zone || "").toLowerCase();
      if (z === "defense") {
        const k = key(c);
        const existing = zones.defense.find((x) => x.id === k);
        if (existing) existing.count++;
        else zones.defense.push({ id: k, name: name(c), count: 1 });
      } else if (z === "midfield") {
        const k = key(c);
        const existing = zones.midfield.find((x) => x.id === k);
        if (existing) existing.count++;
        else zones.midfield.push({ id: k, name: name(c), count: 1 });
      } else if (z === "attack") {
        const k = key(c);
        const existing = zones.attack.find((x) => x.id === k);
        if (existing) existing.count++;
        else zones.attack.push({ id: k, name: name(c), count: 1 });
      }
    });
  });
  const listIds = ["top-defense-list", "top-midfield-list", "top-attack-list"];
  const zoneKeys = ["defense", "midfield", "attack"];
  zoneKeys.forEach((zk, i) => {
    const el = document.getElementById(listIds[i]);
    if (!el) return;
    const sorted = zones[zk].sort((a, b) => b.count - a.count).slice(0, 10);
    el.innerHTML = sorted.map((a) => `<li class="flex justify-between gap-1 text-[0.65rem]"><span class="truncate">${escapeHtml(a.name)}</span><span class="font-mono text-slate-400 shrink-0">${a.count}</span></li>`).join("");
  });
}

function renderByDay() {
  const byDay = new Map();
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    byDay.set(key, 0);
  }
  allGames.forEach((g) => {
    const t = g.timestamp ? new Date(g.timestamp).toISOString().slice(0, 10) : null;
    if (t && byDay.has(t)) byDay.set(t, byDay.get(t) + 1);
    else if (t) byDay.set(t, (byDay.get(t) || 0) + 1);
  });
  const rows = Array.from(byDay.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, count]) => ({
      date: new Date(date + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" }),
      count,
    }));
  const tbody = document.getElementById("table-by-day");
  if (!tbody) return;
  tbody.innerHTML = rows
    .map(
      (r) =>
        `<tr class="hover:bg-slate-700/50"><td class="p-1.5">${escapeHtml(r.date)}</td><td class="p-1.5 text-right font-mono">${r.count}</td></tr>`
    )
    .join("");
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}
