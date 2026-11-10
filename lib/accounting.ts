// Mes contable: la nómina y los recibos marcados que llegan después del día de corte cuentan para el mes siguiente.
// El resto de movimientos (gastos del día a día) se quedan en su mes natural.

export const DEFAULT_CUTOFF = 25;

const pad = (n: number) => String(n).padStart(2, "0");

/** Año y mes al que cuenta un movimiento de un concepto. shift = el concepto está marcado «cuenta para el mes siguiente» */
export function accountingMonth(date: string, shift: boolean, cutoff = DEFAULT_CUTOFF) {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const d = Number(date.slice(8, 10));
  if (!shift || d <= cutoff) return { year: y, month: m };
  return m === 12 ? { year: y + 1, month: 1 } : { year: y, month: m + 1 };
}

/** Fechas [desde, hasta) de los movimientos que cuentan para un mes en un concepto */
export function accountingWindow(year: number, month: number, shift: boolean, cutoff = DEFAULT_CUTOFF) {
  if (!shift) {
    const to = month === 12 ? `${year + 1}-01-01` : `${year}-${pad(month + 1)}-01`;
    return { from: `${year}-${pad(month)}-01`, to };
  }
  const py = month === 1 ? year - 1 : year;
  const pm = month === 1 ? 12 : month - 1;
  return { from: `${py}-${pad(pm)}-${pad(cutoff + 1)}`, to: `${year}-${pad(month)}-${pad(cutoff + 1)}` };
}

/** Primer día desde el que se descargan movimientos: el día siguiente al corte del mes anterior al inicio */
export function firstSyncDate(startDate: string | null | undefined, cutoff = DEFAULT_CUTOFF) {
  if (!startDate) return null;
  const y = Number(startDate.slice(0, 4));
  const m = Number(startDate.slice(5, 7));
  return accountingWindow(y, m, true, cutoff).from;
}

/** Fecha corta del periodo de un concepto con corte, p. ej. «26 oct – 25 nov» */
export function windowLabel(year: number, month: number, cutoff = DEFAULT_CUTOFF) {
  const w = accountingWindow(year, month, true, cutoff);
  const f = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", timeZone: "UTC" });
  const last = new Date(`${w.to}T00:00:00Z`);
  last.setUTCDate(last.getUTCDate() - 1);
  return `${f.format(new Date(`${w.from}T00:00:00Z`))} – ${f.format(last)}`.replace(/\./g, "");
}

// ---------------- De nómina a nómina ----------------
// Para ingresos y recibos el mes empieza el día que llega la nómina (la que entra desde el día 15 abre el mes siguiente).
// Si la nómina aún no ha llegado, o llega más tarde del día de corte, el mes empieza el día siguiente al corte.
// Los gastos del día a día no usan esto: van por mes natural.

export interface Periods { cutoff: number; /** Fechas en que ha llegado la nómina */ payDates: string[] }

const prevMonth = (year: number, month: number) => (month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 });
const nextMonth = (year: number, month: number) => (month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 });

/** Primer día que cuenta para un mes en ingresos y recibos */
export function periodStart(p: Periods, year: number, month: number) {
  const pm = prevMonth(year, month);
  const fallback = `${pm.year}-${pad(pm.month)}-${pad(p.cutoff + 1)}`;
  const from = `${pm.year}-${pad(pm.month)}-15`;
  const to = `${year}-${pad(month)}-15`;
  const pay = p.payDates.filter((d) => d >= from && d < to).sort()[0];
  return pay && pay < fallback ? pay : fallback;
}

/** Año y mes al que cuenta un ingreso o recibo según su fecha */
export function periodOf(p: Periods, date: string) {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const nm = nextMonth(y, m);
  return date >= periodStart(p, nm.year, nm.month) ? nm : { year: y, month: m };
}

/** Fechas [desde, hasta) de los ingresos y recibos que cuentan para un mes */
export function periodWindow(p: Periods, year: number, month: number) {
  const nm = nextMonth(year, month);
  return { from: periodStart(p, year, month), to: periodStart(p, nm.year, nm.month) };
}

/** Fecha corta del periodo, p. ej. «29 oct – 25 nov» */
export function periodLabel(p: Periods, year: number, month: number) {
  const w = periodWindow(p, year, month);
  const f = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", timeZone: "UTC" });
  const last = new Date(`${w.to}T00:00:00Z`);
  last.setUTCDate(last.getUTCDate() - 1);
  return `${f.format(new Date(`${w.from}T00:00:00Z`))} – ${f.format(last)}`.replace(/\./g, "");
}

/** ¿Es este concepto la nómina? */
export const isPayroll = (l: { section: string; name: string }) => l.section === "ingreso" && /n[oó]mina/i.test(l.name);
