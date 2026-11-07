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
