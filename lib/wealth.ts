// Patrimonio: precios de fondos y foto mensual (se ejecuta al sincronizar). Solo servidor.
import { loadYear } from "./data";
import { netWorth } from "./finance";
import { fetchFundPrices } from "./fundPrices";
import type { createClient } from "./supabase/server";

type Supa = Awaited<ReturnType<typeof createClient>>;

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" });

/** Actualiza una vez al día el precio de los fondos con ISIN (los de precio a mano no se tocan) */
export async function refreshFundPrices(supabase: Supa) {
  const { data } = await supabase.from("fund_holdings").select("*");
  const due = (data ?? []).filter((h) => !h.price_manual && h.price_date !== today() && /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(h.isin));
  if (!due.length) return;
  const prices = await fetchFundPrices(due.map((h) => ({ isin: h.isin, symbol: h.price_symbol, onDate: !Number(h.initial_units) && h.initial_value != null ? h.initial_date : null })));
  for (const h of due) {
    const p = prices[h.isin];
    if (!p) continue;
    const patch: Record<string, unknown> = { price: p.price, price_date: today(), price_symbol: p.symbol, updated_at: new Date().toISOString() };
    // Con el precio del día de partida se fijan las participaciones de partida (valor de partida / precio)
    if (!Number(h.initial_units) && h.initial_value != null && p.startPrice) {
      patch.initial_units = Math.round((Number(h.initial_value) / p.startPrice) * 1e6) / 1e6;
    }
    await supabase.from("fund_holdings").update(patch).eq("isin", h.isin);
  }
}

/** Guarda (o actualiza) la foto del patrimonio del mes en curso: el último valor del mes es el que queda */
export async function saveNetWorthSnapshot(supabase: Supa) {
  const d = await loadYear();
  const nw = netWorth(d);
  if (!nw.total) return;
  const t = today();
  const [y, m] = t.split("-").map(Number);
  const monthEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const row = { date: monthEnd, cash: Math.round(nw.cash * 100) / 100, investments: Math.round((nw.fondos + nw.cartera) * 100) / 100 };
  const { data: existing } = await supabase.from("net_worth_history").select("id").eq("date", monthEnd).limit(1).maybeSingle();
  if (existing) await supabase.from("net_worth_history").update(row).eq("id", existing.id);
  else await supabase.from("net_worth_history").insert(row);
}
