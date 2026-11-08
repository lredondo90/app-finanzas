// Cálculos que replican las fórmulas del Excel (hojas Mensual, Anuales, Planes, Cartera, Patrimonio)
import { fundsSummary } from "./funds";
import type { BudgetLine, Investment, YearData } from "./types";

export const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
export const MONTHS_SHORT = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

const n = (v: unknown) => (v == null || v === "" ? 0 : Number(v));

/** Primer mes del año con datos reales (la app empieza en settings.start_date) */
export function firstMonth(d: Pick<YearData, "settings" | "year">) {
  const st = d.settings?.start_date;
  if (!st) return 1;
  const y = Number(st.slice(0, 4));
  if (y > d.year) return 13;
  return y === d.year ? Number(st.slice(5, 7)) : 1;
}

export function monthOf(date: string) {
  return Number(date.slice(5, 7));
}

/** Cuota mensual del fondo de anuales (Anuales!D37) */
export function annualMonthlyQuota(d: YearData) {
  return d.annuals.reduce((s, a) => s + n(a.amount), 0) / 12;
}

/** Valor de un concepto en un mes: el ajuste si existe, si no lo fijo (Mensual!B7 = IF(Ajustes="",Fijos,Ajustes)) */
export function lineValue(d: YearData, line: BudgetLine, month: number) {
  const v = d.values.find((x) => x.line_id === line.id && x.month === month && x.year === d.year);
  if (line.is_annual_fund) {
    return v?.adjusted != null ? n(v.adjusted) : annualMonthlyQuota(d);
  }
  if (!v) return 0;
  return v.adjusted != null ? n(v.adjusted) : n(v.planned);
}

export function plannedValue(d: YearData, line: BudgetLine, month: number) {
  if (line.is_annual_fund) return annualMonthlyQuota(d);
  const v = d.values.find((x) => x.line_id === line.id && x.month === month && x.year === d.year);
  return n(v?.planned);
}

export function isAdjusted(d: YearData, line: BudgetLine, month: number) {
  const v = d.values.find((x) => x.line_id === line.id && x.month === month && x.year === d.year);
  return v?.adjusted != null;
}

/** Aportación a planes de ahorro en un mes (Planes!E20): fijo dentro de Desde/Hasta + extra del mes */
export function plansMonth(d: YearData, month: number) {
  return d.plans.reduce((s, p) => s + planMonth(d, p.id, month), 0);
}

export function planMonth(d: YearData, planId: string, month: number) {
  const p = d.plans.find((x) => x.id === planId);
  if (!p) return 0;
  const from = p.from_month ?? 1;
  const to = p.to_month ?? 12;
  const fixed = month >= from && month <= to ? n(p.monthly_amount) : 0;
  const extra = d.extras
    .filter((e) => e.plan_id === planId && e.month === month && e.year === d.year)
    .reduce((s, e) => s + n(e.amount), 0);
  return fixed + extra;
}

export function investmentNet(i: Investment) {
  const gross = n(i.quantity) * n(i.unit_price);
  return i.type === "Compra" ? gross + n(i.fees) : gross - n(i.fees);
}

export interface MonthSummary {
  month: number;
  ingresos: number;
  fijos: number;
  prevision: number;
  variableReal: number;
  desviacion: number;
  /** pasado = usa el gasto real · actual = va día a día · futuro = usa la provisión */
  periodo: "pasado" | "actual" | "futuro";
  ritmo: { dia: number; dias: number; previstoHastaHoy: number; proyeccion: number; quedaPorDia: number } | null;
  variableConsiderado: number;
  totalGastos: number;
  resultado: number;
  planes: number;
  compras: number;
  ventas: number;
  inversion: number;
  resultadoTrasInversion: number;
  fondoAnuales: number;
  porCategoria: { id: string | null; name: string; total: number }[];
  lineas: { line: BudgetLine; value: number; adjusted: boolean; done: boolean }[];
  ingresosPuntuales: number;
  /** Estado de cobros/pagos del mes: recibidos (ingresos) y pagados (gastos fijos) */
  estado: Record<"ingreso" | "fijo", { hechos: number; total: number; pendiente: number }>;
}

export function monthSummary(d: YearData, month: number): MonthSummary {
  const lineas = d.lines.map((line) => ({ line, value: lineValue(d, line, month), adjusted: isAdjusted(d, line, month), done: isDone(d, line, month) }));
  const sum = (s: string) => lineas.filter((l) => l.line.section === s).reduce((a, l) => a + l.value, 0);
  const puntuales = d.oneOffIncomes.filter((i) => i.date.startsWith(`${d.year}-`) && monthOf(i.date) === month);
  const ingresosPuntuales = puntuales.reduce((s, i) => s + n(i.amount), 0);
  const ingresos = sum("ingreso") + ingresosPuntuales;
  const fijos = sum("fijo");
  const prevision = sum("provision");

  const exps = d.expenses.filter((e) => e.date.startsWith(`${d.year}-`) && monthOf(e.date) === month);
  const variableReal = exps.reduce((s, e) => s + n(e.amount), 0);
  const hoy = todayMadrid();
  const periodo: MonthSummary["periodo"] =
    d.year < hoy.year || (d.year === hoy.year && month < hoy.month) ? "pasado"
    : d.year === hoy.year && month === hoy.month ? "actual" : "futuro";
  let ritmo: MonthSummary["ritmo"] = null;
  if (periodo === "actual") {
    const dias = new Date(d.year, month, 0).getDate();
    const dia = hoy.day;
    ritmo = {
      dia, dias,
      previstoHastaHoy: (prevision * dia) / dias,
      proyeccion: (variableReal / dia) * dias,
      quedaPorDia: dias - dia + 1 > 0 ? Math.max(0, prevision - variableReal) / (dias - dia + 1) : 0,
    };
  }
  // Mes pasado: lo real. Mes en curso: lo real si ya supera lo previsto, si no lo previsto. Futuro: lo previsto.
  const variableConsiderado = periodo === "pasado" ? variableReal : periodo === "actual" ? Math.max(variableReal, prevision) : prevision;
  const totalGastos = fijos + variableConsiderado;
  const resultado = ingresos - totalGastos;

  const invs = d.investments.filter((i) => i.date.startsWith(`${d.year}-`) && monthOf(i.date) === month);
  const compras = invs.filter((i) => i.type === "Compra").reduce((s, i) => s + investmentNet(i), 0);
  const ventas = invs.filter((i) => i.type === "Venta").reduce((s, i) => s + investmentNet(i), 0);
  const planes = plansMonth(d, month);
  const inversion = planes + compras - ventas;

  const porCategoria: { id: string | null; name: string; total: number }[] = d.categories.map((c) => ({
    id: c.id,
    name: c.name,
    total: exps.filter((e) => e.category_id === c.id).reduce((s, e) => s + n(e.amount), 0),
  }));
  const sinCat = exps.filter((e) => !e.category_id || !d.categories.some((c) => c.id === e.category_id));
  if (sinCat.length) porCategoria.push({ id: null, name: "Sin categoría", total: sinCat.reduce((s, e) => s + n(e.amount), 0) });

  return {
    month,
    ingresos,
    ingresosPuntuales,
    estado: {
      ingreso: estadoSeccion(lineas, "ingreso"),
      fijo: estadoSeccion(lineas, "fijo"),
    },
    fijos,
    prevision,
    variableReal,
    desviacion: prevision - variableReal,
    periodo,
    ritmo,
    variableConsiderado,
    totalGastos,
    resultado,
    planes,
    compras,
    ventas,
    inversion,
    resultadoTrasInversion: resultado - inversion,
    fondoAnuales: annualFund(d)[month - 1].saldo,
    porCategoria,
    lineas,
  };
}

/** Fecha de hoy en España */
export function todayMadrid() {
  const [y, m, dd] = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date()).split("-").map(Number);
  return { year: y, month: m, day: dd };
}

export function isDone(d: YearData, line: BudgetLine, month: number) {
  return !!d.values.find((x) => x.line_id === line.id && x.month === month && x.year === d.year)?.done;
}

function estadoSeccion(lineas: MonthSummary["lineas"], section: "ingreso" | "fijo") {
  // Solo cuentan los conceptos con importe en el mes (un 0 no se espera)
  const ls = lineas.filter((l) => l.line.section === section && l.value !== 0 && !l.line.is_annual_fund); // la cuota de anuales es ahorro, no un recibo
  return {
    hechos: ls.filter((l) => l.done).length,
    total: ls.length,
    pendiente: ls.filter((l) => !l.done).reduce((a, l) => a + l.value, 0),
  };
}

/** Fondo de anuales mes a mes (Anuales!B41:M43) */
export function annualFund(d: YearData) {
  const quota = annualMonthlyQuota(d);
  let saldo = n(d.settings?.annual_fund_initial);
  return MONTHS.map((_, i) => {
    const month = i + 1;
    const pagados = d.annuals.filter((a) => a.pay_month === month).reduce((s, a) => s + n(a.amount), 0);
    saldo = saldo + quota - pagados;
    return { month, aportacion: quota, pagados, saldo };
  });
}

/** Hoja Cartera: posición y resultado por activo (coste medio simple) */
export function portfolio(d: YearData) {
  const assets = Array.from(new Set(d.investments.map((i) => i.asset))).sort();
  const rows = assets.map((asset) => {
    const ops = d.investments.filter((i) => i.asset === asset);
    const buys = ops.filter((o) => o.type === "Compra");
    const sells = ops.filter((o) => o.type === "Venta");
    const udsCompradas = buys.reduce((s, o) => s + n(o.quantity), 0);
    const udsVendidas = sells.reduce((s, o) => s + n(o.quantity), 0);
    const uds = udsCompradas - udsVendidas;
    const totalComprado = buys.reduce((s, o) => s + n(o.quantity) * n(o.unit_price), 0);
    const costeMedio = udsCompradas === 0 ? 0 : totalComprado / udsCompradas;
    const totalVendido = sells.reduce((s, o) => s + n(o.quantity) * n(o.unit_price), 0);
    const comisiones = ops.reduce((s, o) => s + n(o.fees), 0);
    const priceRow = d.prices.find((p) => p.asset === asset);
    const precio = priceRow ? n(priceRow.price) : null;
    const valor = precio == null ? null : uds * precio;
    const latente = valor == null ? null : valor - uds * costeMedio;
    const latentePct = latente == null || uds * costeMedio === 0 ? null : latente / (uds * costeMedio);
    const realizado = totalVendido - udsVendidas * costeMedio;
    const neto = realizado + (latente ?? 0) - comisiones;
    return { asset, udsCompradas, udsVendidas, uds, totalComprado, costeMedio, totalVendido, comisiones, precio, valor, latente, latentePct, realizado, neto };
  });
  const total = {
    valor: rows.reduce((s, r) => s + (r.valor ?? 0), 0),
    neto: rows.reduce((s, r) => s + r.neto, 0),
  };
  return { rows, total };
}

/** Planes: aportado calculado y ganancia a partir del valor actual y la rentabilidad de la app */
export function plansSummary(d: YearData) {
  const rows = d.plans.map((p) => {
    const anual = MONTHS.reduce((s, _, i) => s + planMonth(d, p.id, i + 1), 0);
    const valor = p.current_value == null ? null : n(p.current_value);
    const aportado = valor == null || p.return_pct == null ? null : valor / (1 + n(p.return_pct));
    const ganancia = aportado == null || valor == null ? null : valor - aportado;
    return { plan: p, anual, valor, aportado, ganancia };
  });
  const valor = rows.reduce((s, r) => s + (r.valor ?? 0), 0);
  const aportado = rows.reduce((s, r) => s + (r.aportado ?? 0), 0);
  const ganancia = rows.reduce((s, r) => s + (r.ganancia ?? 0), 0);
  return { rows, valor, aportado, ganancia, rentabilidad: aportado === 0 ? null : ganancia / aportado };
}

export function netWorth(d: YearData) {
  // Efectivo: saldos que llegan del banco + cuentas a mano que siguen contando
  const synced = d.syncedAccounts.reduce((s, a) => s + n(a.balance), 0);
  const manual = d.banks.filter((b) => b.counted !== false).reduce((s, b) => s + n(b.balance), 0);
  const cash = synced + manual;
  // Cuentas conjuntas (con tu mujer): cuentan enteras en el total, y aparte para ver lo tuyo
  const joint = d.syncedAccounts.filter((a) => a.kind === "conjunta").reduce((s, a) => s + n(a.balance), 0);
  // Fondos: los de la cartera por ISIN si ya están dados de alta; si no, el valor de los planes
  const funds = fundsSummary(d);
  const fondos = funds.rows.length ? funds.total : plansSummary(d).valor;
  const cartera = portfolio(d).total.valor;
  const total = cash + fondos + cartera;
  // Gasto mensual medio previsto = total gastos fijos del año / 12 (Patrimonio!B29)
  const fijosAnio = MONTHS.reduce(
    (s, _, i) => s + d.lines.filter((l) => l.section === "fijo").reduce((a, l) => a + lineValue(d, l, i + 1), 0),
    0,
  );
  const gastoMedio = fijosAnio / 12;
  return { cash, synced, manual, joint, mine: total - joint, fondos, funds, cartera, total, gastoMedio, mesesReserva: gastoMedio === 0 ? null : cash / gastoMedio };
}

const eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const eur0 = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const pct = new Intl.NumberFormat("es-ES", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const fmt = (v: number | null | undefined) => (v == null ? "—" : eur.format(v));
export const fmt0 = (v: number | null | undefined) => (v == null ? "—" : eur0.format(v));
export const fmtPct = (v: number | null | undefined) => (v == null ? "—" : pct.format(v));
