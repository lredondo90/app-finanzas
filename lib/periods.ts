// Mes de nómina a nómina para ingresos y recibos: carga de las fechas de nómina y recolocación de lo ya guardado
import { type Periods, isPayroll, periodOf } from "./accounting";
import type { createClient } from "./supabase/server";

type Supa = Awaited<ReturnType<typeof createClient>>;

const round = (v: number) => Math.round(v * 100) / 100;
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

export async function loadPeriods(supabase: Supa): Promise<Periods> {
  const [{ data: settings }, { data: lines }] = await Promise.all([
    supabase.from("settings").select("cutoff_day").maybeSingle(),
    supabase.from("budget_lines").select("id, section, name"),
  ]);
  const ids = (lines ?? []).filter(isPayroll).map((l) => l.id as string);
  const { data: pays } = ids.length
    ? await supabase.from("bank_movements").select("date").in("line_id", ids).gt("amount", 0).order("date")
    : { data: [] as { date: string }[] };
  return { cutoff: settings?.cutoff_day ?? 25, payDates: (pays ?? []).map((x) => x.date as string) };
}

/**
 * Coloca cada ingreso y recibo del banco en su mes (de nómina a nómina) y deja el concepto pagado/recibido con su importe real.
 * Si un concepto estaba marcado en un mes por un movimiento que ahora cuenta para el mes de al lado, ese mes vuelve a pendiente.
 * Lo marcado a mano, sin movimiento del banco, no se toca.
 */
export async function reconcileLines(supabase: Supa, p?: Periods) {
  const periods = p ?? await loadPeriods(supabase);
  const { data: movs } = await supabase.from("bank_movements").select("line_id, date, amount").not("line_id", "is", null).gte("date", daysAgo(120));
  const groups = new Map<string, number>(); // línea|año|mes → suma
  for (const m of movs ?? []) {
    const am = periodOf(periods, m.date as string);
    const k = `${m.line_id}|${am.year}|${am.month}`;
    groups.set(k, (groups.get(k) ?? 0) + Number(m.amount));
  }
  const lineIds = [...new Set((movs ?? []).map((m) => m.line_id as string))];
  if (!lineIds.length) return;
  const { data: values } = await supabase.from("budget_values").select("line_id, year, month, adjusted, done").in("line_id", lineIds);
  const value = (k: string) => (values ?? []).find((v) => `${v.line_id}|${v.year}|${v.month}` === k);
  const today = new Date().toISOString().slice(0, 10);

  for (const [k, sum] of groups) {
    const [line_id, y, m] = k.split("|");
    const real = round(Math.abs(sum));
    const ex = value(k);
    if (ex?.done && (ex.adjusted == null || Math.abs(Number(ex.adjusted) - real) < 0.005)) continue;
    const patch = { done: true, done_date: today, adjusted: real };
    if (ex) await supabase.from("budget_values").update(patch).eq("line_id", line_id).eq("year", Number(y)).eq("month", Number(m));
    else await supabase.from("budget_values").insert({ line_id, year: Number(y), month: Number(m), planned: 0, ...patch });
  }

  // Meses marcados por un movimiento que ya no les toca
  for (const v of values ?? []) {
    if (!v.done || v.adjusted == null) continue;
    if (groups.has(`${v.line_id}|${v.year}|${v.month}`)) continue;
    const y = v.year as number, m = v.month as number;
    const around = [m === 1 ? `${y - 1}|12` : `${y}|${m - 1}`, m === 12 ? `${y + 1}|1` : `${y}|${m + 1}`];
    const moved = around.some((a) => {
      const s = groups.get(`${v.line_id}|${a}`);
      return s != null && Math.abs(round(Math.abs(s)) - Number(v.adjusted)) < 0.005;
    });
    if (moved) await supabase.from("budget_values").update({ done: false, done_date: null, adjusted: null }).eq("line_id", v.line_id).eq("year", y).eq("month", m);
  }
}
