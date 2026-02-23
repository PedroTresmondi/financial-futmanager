export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export function onlySpaces(str) {
  return !str || !String(str).trim();
}

export function normalizeName(raw) {
  const s = String(raw || "").replace(/\s+/g, " ").trim().slice(0, 18);
  return s.toUpperCase();
}

export function normalizeNameLive(raw) {
  let s = String(raw || "").replace(/\s+/g, " ");
  s = s.replace(/^\s+/, "");
  s = s.slice(0, 18);
  return s.toUpperCase();
}

export function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function zoneFromPoint(centerY, fieldHeight) {
  const zoneHeight = fieldHeight / 3;
  if (centerY < zoneHeight) return "attack";
  if (centerY < zoneHeight * 2) return "midfield";
  return "defense";
}

export function expectedZoneFor(assetSuit, profileKey) {
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

/** Normaliza nome de zona (PT ou EN) para defense | midfield | attack */
function normalizeZoneName(value) {
  if (!value) return null;
  const v = String(value).toLowerCase().trim();
  if (v === "defesa" || v === "defense") return "defense";
  if (v === "meio de campo" || v === "meio" || v === "midfield" || v === "meio-campo") return "midfield";
  if (v === "ataque" || v === "attack") return "attack";
  return null;
}

/**
 * Retorna a zona(is) ideal(is) do ativo para o perfil.
 * Pode ser string (uma zona) ou string[] (várias zonas válidas, ex.: Meio ou Ataque no arrojado).
 */
export function getExpectedZoneForAsset(asset, profileKey) {
  const positions = asset?.positions;
  if (positions && profileKey) {
    const raw = positions[profileKey];
    if (Array.isArray(raw)) {
      const zones = raw.map((r) => normalizeZoneName(r)).filter(Boolean);
      if (zones.length > 0) return zones;
    }
    const zone = normalizeZoneName(raw);
    if (zone) return zone;
  }
  const suit = asset?.suitability ?? 50;
  return expectedZoneFor(suit, profileKey);
}

/** Retorna true se a zona atual está entre as zonas esperadas (uma ou várias). */
export function isExpectedZone(actualZone, expected) {
  if (Array.isArray(expected)) return expected.includes(actualZone);
  return actualZone === expected;
}

/** Formata zona(is) para exibição (ex.: "MEIO" ou "MEIO ou ATQ"). zoneMap: { defense: "DEF", midfield: "MEIO", attack: "ATQ" } */
export function formatExpectedZoneLabel(expected, zoneMap = { defense: "DEF", midfield: "MEIO", attack: "ATQ" }) {
  if (Array.isArray(expected)) {
    return expected.map((z) => zoneMap[z] || z).join(" ou ");
  }
  return zoneMap[expected] || expected;
}

export function zoneFlags(expectedZone) {
  return {
    def: expectedZone === "defense",
    mid: expectedZone === "midfield",
    atk: expectedZone === "attack"
  };
}

export function getRiskLevel(suitability) {
  if (suitability <= 35) return "low";
  if (suitability <= 60) return "med";
  return "high";
}

export function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function formatPtsBR(v) {
  const n = Number(v) || 0;
  return n.toLocaleString("pt-BR");
}
