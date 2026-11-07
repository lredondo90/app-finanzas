// Precio de fondos y ETF por ISIN. Solo servidor.
// ---------- Precio (Yahoo Finance, público y sin clave) ----------
const UA = { "User-Agent": "Mozilla/5.0 (compatible; MisFinanzas/1.0)" };

/** Último cierre en euros, o el cierre de una fecha (el último disponible hasta ese día) */
async function chartPrice(symbol: string, onDate?: string | null): Promise<{ price: number; date: string } | null> {
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1mo&interval=1d`, { headers: UA, cache: "no-store" });
  if (!r.ok) return null;
  const j = await r.json();
  const res = j?.chart?.result?.[0];
  if (!res?.meta || res.meta.currency !== "EUR") return null;
  const ts: number[] = res.timestamp ?? [];
  const closes: (number | null)[] = res.indicators?.quote?.[0]?.close ?? [];
  const points = ts.map((t, i) => ({ date: new Date(t * 1000).toISOString().slice(0, 10), price: closes[i] })).filter((p): p is { date: string; price: number } => p.price != null);
  if (onDate) {
    const p = points.filter((x) => x.date <= onDate).pop();
    return p ?? null;
  }
  if (res.meta.regularMarketPrice) {
    return { price: Number(res.meta.regularMarketPrice), date: new Date((res.meta.regularMarketTime ?? Date.now() / 1000) * 1000).toISOString().slice(0, 10) };
  }
  return points.pop() ?? null;
}

async function findSymbol(isin: string): Promise<string[]> {
  const r = await fetch(`https://query2.finance.yahoo.com/v1/finance/search?q=${isin}&quotesCount=10&newsCount=0`, { headers: UA, cache: "no-store" });
  if (!r.ok) return [];
  const j = await r.json();
  const symbols: string[] = (j?.quotes ?? []).map((q: { symbol?: string }) => q.symbol).filter(Boolean);
  // Primero las bolsas en euros (Xetra, Fráncfort, París, Milán, Ámsterdam, Madrid)
  const rank = (s: string) => (/\.(DE|F)$/.test(s) ? 0 : /\.(PA|MI|AS|MC)$/.test(s) ? 1 : 2);
  return symbols.sort((a, b) => rank(a) - rank(b)).slice(0, 5);
}

/** Precio en euros de un ISIN (y el de la fecha de partida, para calcular las participaciones iniciales) */
async function fetchFundPrice(isin: string, knownSymbol?: string | null, onDate?: string | null) {
  try {
    const candidates = knownSymbol ? [knownSymbol] : await findSymbol(isin);
    for (const s of candidates) {
      const now = await chartPrice(s);
      if (!now) continue;
      const atStart = onDate ? await chartPrice(s, onDate) : null;
      return { symbol: s, price: now.price, date: now.date, startPrice: atStart?.price ?? null };
    }
    return null;
  } catch {
    return null;
  }
}

/** Precios de varios fondos a la vez */
export async function fetchFundPrices(list: { isin: string; symbol: string | null; onDate: string | null }[]) {
  const out: Record<string, { symbol: string; price: number; date: string; startPrice: number | null }> = {};
  await Promise.all(list.map(async (f) => {
    const p = await fetchFundPrice(f.isin, f.symbol, f.onDate);
    if (p) out[f.isin] = p;
  }));
  return out;
}
