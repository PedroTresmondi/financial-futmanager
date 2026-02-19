const CARDS_JSON_PATH = "./cards.json";

export async function loadAssets() {
  const paths = ["/cards.json", CARDS_JSON_PATH, "/src/cards.json", "src/cards.json"];
  for (const path of paths) {
    try {
      const res = await fetch(path, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const list = json.assets || json;
      if (Array.isArray(list) && list.length > 0) return list;
    } catch (_) {
      continue;
    }
  }
  console.warn("loadAssets: não foi possível carregar cards.json em nenhum dos caminhos tentados.");
  return [];
}

export async function tryAwardPrize(points, { playerName, placedCards, currentProfileKey }) {
  try {
    const cardsSummary = placedCards.map((c) => ({
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
