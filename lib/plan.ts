// Plan frente a real: gasto libre, previsión de fin de mes y de fin de año.
// «Plan» = lo previsto en el presupuesto (planned). «Real/previsto» = lo que ya llegó (ajuste) o, si no, lo previsto.
import { lineValue, monthOf, monthSummary, plannedValue, type MonthSummary } from "./finance";
import type { BudgetLine, Expense, YearData } from "./types";

const n = (v: unknown) => (v == null || v === "" ? 0 : Number(v));

/** A partir de este día del mes la previsión usa tu ritmo real; antes, lo gastado + el resto al ritmo del plan */
const DIAS_PARA_RITMO = 7;

export interface MonthPlan {
  s: MonthSummary;
  /** Plan del mes (lo escrito en «Mi plan») */
  plan: { ingresos: number; fijos: number; libre: number; ahorro: number };
  /** Gasto libre: el bote de todo lo que no es fijo, de todas tus cuentas */
  libre: { presupuesto: number; gastado: number; queda: number; previsto: number; hoyTocaria: number | null; porDia: number | null };
  /** Ahorro previsto del mes con lo real hasta hoy y la previsión del resto */
  ahorroPrevisto: number;
  desviacion: number;
}

/** Gasto libre previsto a fin de mes */
export function libreFinDeMes(s: MonthSummary) {
  if (s.periodo === "pasado") return s.variableReal;
  if (s.periodo === "futuro") return s.prevision;
  const { dia, dias } = s.ritmo!;
  if (dia < DIAS_PARA_RITMO) return s.variableReal + Math.max(0, (s.prevision * (dias - dia)) / dias);
  return (s.variableReal / dia) * dias;
}

export function monthPlan(d: YearData, month: number): MonthPlan {
  const s = monthSummary(d, month);
  const sumPlan = (sec: string) => d.lines.filter((l) => l.section === sec).reduce((a, l) => a + plannedValue(d, l, month), 0);
  const plan = { ingresos: sumPlan("ingreso") + s.ingresosPuntuales, fijos: sumPlan("fijo"), libre: sumPlan("provision"), ahorro: 0 };
  plan.ahorro = plan.ingresos - plan.fijos - plan.libre;
  const previsto = libreFinDeMes(s);
  const libre = {
    presupuesto: s.prevision,
    gastado: s.variableReal,
    queda: s.prevision - s.variableReal,
    previsto,
    hoyTocaria: s.ritmo ? s.ritmo.previstoHastaHoy : null,
    porDia: s.ritmo ? s.ritmo.quedaPorDia : null,
  };
  const ahorroPrevisto = s.ingresos - s.fijos - previsto;
  return { s, plan, libre, ahorroPrevisto, desviacion: ahorroPrevisto - plan.ahorro };
}

/** Los 12 meses del año: plan, previsto y desviación, y el total a 31 de diciembre */
export function yearPlan(d: YearData, first = 1) {
  const months = Array.from({ length: 12 }, (_, i) => monthPlan(d, i + 1)).filter((m) => m.s.month >= first);
  const plan = months.reduce((a, m) => a + m.plan.ahorro, 0);
  const previsto = months.reduce((a, m) => a + m.ahorroPrevisto, 0);
  return { months, plan, previsto, desviacion: previsto - plan };
}

/** Cuenta de la que sale un gasto (los importados del banco lo dicen en las notas) */
export function expenseSource(e: Pick<Expense, "notes">) {
  const m = /^Importado de (.+)$/.exec(String(e.notes ?? "").trim());
  return m ? m[1] : "A mano";
}

/** Gasto libre del mes por cuenta, de mayor a menor */
export function libreByAccount(d: YearData, month: number) {
  const out: { name: string; total: number }[] = [];
  for (const e of d.expenses) {
    if (!e.date.startsWith(`${d.year}-`) || monthOf(e.date) !== month) continue;
    const name = expenseSource(e);
    const row = out.find((x) => x.name === name);
    if (row) row.total += n(e.amount); else out.push({ name, total: n(e.amount) });
  }
  return out.sort((a, b) => b.total - a.total);
}

// ---------------- Mi plan: mes normal + paga extra ----------------

/** Meses en que llega la paga extra: julio (la del 25 de junio) y enero (la del 25 de diciembre) */
export const EXTRA_MONTHS = [1, 7];

/** Importe de un mes normal: el que más se repite en los últimos meses del año fuera de enero y julio (empate: el mayor) */
export function normalValue(d: YearData, line: BudgetLine) {
  const counts = new Map<number, number>();
  for (const m of [6, 8, 9, 10, 11, 12]) {
    const v = Math.round(plannedValue(d, line, m) * 100) / 100;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  let best = 0, bestCount = -1;
  for (const [v, c] of counts) if (c > bestCount || (c === bestCount && v > best)) { best = v; bestCount = c; }
  return best;
}

/** Paga extra de un ingreso: lo que julio tiene de más sobre un mes normal */
export function extraValue(d: YearData, line: BudgetLine) {
  return Math.max(0, Math.round((plannedValue(d, line, 7) - normalValue(d, line)) * 100) / 100);
}

/** Lo que tocaría en un mes según el patrón (normal, más la extra en enero y julio) */
export function patternValue(d: YearData, line: BudgetLine, month: number, extra = line.section === "ingreso" ? extraValue(d, line) : 0) {
  return normalValue(d, line) + (EXTRA_MONTHS.includes(month) ? extra : 0);
}

/** Meses que se salen del patrón: los cambios puntuales */
export function exceptions(d: YearData, line: BudgetLine) {
  if (line.is_annual_fund) return [];
  const extra = line.section === "ingreso" ? extraValue(d, line) : 0;
  const out: { month: number; value: number; normal: number }[] = [];
  for (let m = 1; m <= 12; m++) {
    const v = plannedValue(d, line, m);
    const p = patternValue(d, line, m, extra);
    if (Math.abs(v - p) > 0.005) out.push({ month: m, value: v, normal: p });
  }
  return out;
}

export { lineValue };
