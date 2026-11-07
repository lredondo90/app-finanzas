// Fondos y ETF: participaciones de partida + compras/ventas que llegan en los movimientos del banco.
// Trade Republic manda p. ej. «Savings plan execution LU1681048804 Amundi S&P 500 Swap UCITS ETF EUR Acc, quantity: 0.073163».
// BBVA solo manda el importe («… QUALITY MEJORES IDEA-17744422»): las participaciones se calculan con el valor liquidativo.
import type { FundHolding, YearData } from "./types";

const ISIN = /\b([A-Z]{2}[A-Z0-9]{9}\d)\b/;

export interface FundTrade { key: string; units: number | null; date: string; amount: number; name: string }

/** Compra/venta de un fondo con ISIN y participaciones en el texto (Trade Republic) */
export function parseIsinTrade(m: { date: string; description: string; amount: number }) {
  const q = /quantity:\s*([\d.,]+)/i.exec(m.description);
  const isin = ISIN.exec(m.description);
  if (!q || !isin) return null;
  const units = Number(q[1].replace(/,(?=\d{3}\b)/g, "").replace(",", "."));
  if (!units) return null;
  const name = m.description.slice(isin.index + isin[1].length).replace(/,\s*quantity:.*$/i, "").trim() || isin[1];
  const sell = /\b(sell|venta|verkauf)\b/i.test(m.description) || m.amount > 0;
  return { key: isin[1], name, units: sell ? -units : units, date: m.date, amount: m.amount };
}

type Src = Pick<YearData, "fundMovements" | "holdings" | "settings">;

/** Todas las operaciones por fondo (las de BBVA se reconocen por su texto; los duplicados del mismo día e importe se cuentan una vez) */
export function fundTrades(d: Src): FundTrade[] {
  const out: FundTrade[] = [];
  const seen = new Set<string>();
  for (const m of d.fundMovements) {
    const t = parseIsinTrade(m);
    if (t) { out.push(t); continue; }
    const h = d.holdings.find((x) => x.match_text && m.description.toUpperCase().includes(x.match_text.toUpperCase()));
    if (!h) continue;
    const k = `${h.isin}|${m.date}|${m.amount}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ key: h.isin, name: h.name, units: null, date: m.date, amount: m.amount });
  }
  return out;
}

/** Cartera de fondos: participaciones, valor al último precio y ganancia */
export function fundsSummary(d: Src) {
  const trades = fundTrades(d);
  const keys = Array.from(new Set([...d.holdings.map((h) => h.isin), ...trades.map((t) => t.key)]));
  const rows = keys.map((isin) => {
    const h: FundHolding | undefined = d.holdings.find((x) => x.isin === isin);
    // Lo anterior a la fecha de partida ya está en las cifras de partida
    const since = h?.initial_date ?? (d.settings?.start_date ? dayBefore(d.settings.start_date) : null);
    const price = h?.price ?? null;
    const mine = trades.filter((t) => t.key === isin && (!since || t.date > since));
    // Sin participaciones en el texto (BBVA): importe / valor liquidativo
    const bought = mine.reduce((s, t) => s + (t.units ?? (price ? -t.amount / price : 0)), 0);
    const invested = mine.reduce((s, t) => s - t.amount, 0);
    // Las participaciones de partida se calculan al conseguir el precio de ese día (ver refreshFundPrices)
    const initialUnits = Number(h?.initial_units ?? 0) || (h?.initial_value != null && price ? h.initial_value / price : 0);
    const units = initialUnits + bought;
    let value = price == null ? null : units * price;
    // Hasta tener el primer precio, el valor es el de partida más lo aportado
    if (value == null && h?.initial_value != null) value = h.initial_value + invested;
    const cost = h?.initial_cost != null ? h.initial_cost + invested : null;
    const gain = value != null && cost != null ? value - cost : null;
    const name = h?.name ?? trades.find((t) => t.key === isin)?.name ?? isin;
    return { isin, name, since, bought, invested, units, price, priceDate: h?.price_date ?? null, priceManual: !!h?.price_manual,
      value, cost, gain, gainPct: gain != null && cost ? gain / cost : null, trades: mine.length, known: !!h };
  }).sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  const total = rows.reduce((s, r) => s + (r.value ?? 0), 0);
  const cost = rows.reduce((s, r) => s + (r.cost ?? 0), 0);
  const gain = rows.every((r) => r.gain != null || !r.value) ? rows.reduce((s, r) => s + (r.gain ?? 0), 0) : null;
  return { rows, total, cost, gain, gainPct: gain != null && cost ? gain / cost : null };
}

function dayBefore(date: string) {
  const t = new Date(`${date}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() - 1);
  return t.toISOString().slice(0, 10);
}
