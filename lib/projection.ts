// Calculadora de ahorro futuro: desde el patrimonio de hoy, sumando cada mes el ahorro del plan
// (una parte a fondos y el resto en efectivo) y aplicando una TAE con interés compuesto mensual.
import { EXTRA_MONTHS, extraValue, normalValue } from "./plan";
import type { YearData } from "./types";

/** Ahorro de un mes normal según «Mi plan» y lo que la paga extra (enero y julio) añade */
export function planSavingsPattern(d: YearData) {
  const sum = (sec: string, f: (l: YearData["lines"][number]) => number) => d.lines.filter((l) => l.section === sec).reduce((a, l) => a + f(l), 0);
  const normal = sum("ingreso", (l) => normalValue(d, l)) - sum("fijo", (l) => normalValue(d, l)) - sum("provision", (l) => normalValue(d, l));
  const extra = sum("ingreso", (l) => extraValue(d, l));
  return { normal: Math.round(normal), extra: Math.round(extra) };
}

/** Aportación mensual a los planes de ahorro (fondos) que hay ahora */
export function fundsMonthly(d: YearData) {
  return d.plans.reduce((s, p) => s + Number(p.monthly_amount ?? 0), 0);
}

export interface ProjectionInput {
  cash: number;
  funds: number;
  /** Ahorro de un mes normal (efectivo + fondos) */
  monthly: number;
  /** De ese ahorro, lo que va a fondos */
  toFunds: number;
  /** Lo que añade la paga extra en enero y julio (va a efectivo) */
  extra: number;
  /** TAE en %, de los fondos y del efectivo */
  taeFunds: number;
  taeCash: number;
  /** Mes de partida (el primero que suma) y mes final, ambos incluidos: «aaaa-mm» */
  from: string;
  to: string;
}

export interface ProjectionPoint { ym: string; cash: number; funds: number; aportado: number }

const addMonth = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
};

/** Tipo mensual equivalente a una TAE (la TAE ya es el rendimiento anual con el compuesto incluido) */
export const monthlyRate = (tae: number) => Math.pow(1 + tae / 100, 1 / 12) - 1;

export function project(p: ProjectionInput) {
  const rf = monthlyRate(p.taeFunds), rc = monthlyRate(p.taeCash);
  let cash = p.cash, funds = p.funds, aportado = 0;
  const points: ProjectionPoint[] = [];
  for (let ym = p.from, i = 0; ym <= p.to && i < 1200; ym = addMonth(ym), i++) {
    const month = Number(ym.slice(5, 7));
    const ahorro = p.monthly + (EXTRA_MONTHS.includes(month) ? p.extra : 0);
    funds = funds * (1 + rf) + p.toFunds;
    cash = cash * (1 + rc) + (ahorro - p.toFunds);
    aportado += ahorro;
    points.push({ ym, cash, funds, aportado });
  }
  const start = p.cash + p.funds;
  const total = cash + funds;
  return { points, cash, funds, total, start, aportado, intereses: total - start - aportado, months: points.length };
}
