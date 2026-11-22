// Extracto de cuenta de Trade Republic (PDF «Estado de cuenta»): lee cada movimiento con su fecha, tipo, concepto e importe.
// La conexión con el banco solo da fecha e importe; el extracto pone nombre a cada uno.
// El lector usa la posición del texto en la página (columnas FECHA · TIPO · DESCRIPCIÓN · ENTRADA · SALIDA · BALANCE)
// y comprueba cada importe con el saldo que hay después: si algo no cuadra, lo dice en vez de inventarse datos.

export interface PdfItem { page: number; x: number; y: number; str: string }

export interface StatementLine {
  date: string; // YYYY-MM-DD
  type: string; // «Transacción con tarjeta», «Operar», «Transferencia»…
  description: string; // comercio o concepto
  amount: number; // con signo: negativo = salida
  balance: number | null; // saldo después del movimiento
}

export interface Statement {
  from: string | null;
  to: string | null;
  opening: number | null;
  closing: number | null;
  lines: StatementLine[];
  /** El último saldo coincide con el saldo final del extracto y todos los importes cuadran con su saldo */
  balanced: boolean;
  warnings: string[];
}

const MONTHS: Record<string, string> = {
  ene: "01", feb: "02", mar: "03", abr: "04", may: "05", jun: "06", jul: "07", ago: "08", sep: "09", oct: "10", nov: "11", dic: "12",
};
const month = (s: string) => MONTHS[s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().slice(0, 3)] ?? null;
const MONEY = /^-?[\d.]+,\d{2}\s*€$/;
const money = (s: string) => Number(s.replace(/[€\s.]/g, "").replace(",", "."));
const round = (n: number) => Math.round(n * 100) / 100;

function textDate(s: string) {
  const m = /(\d{1,2})\s+([a-zé]{3,5})\.?\s+(\d{4})/i.exec(s);
  const mm = m && month(m[2]);
  return m && mm ? `${m[3]}-${mm}-${m[1].padStart(2, "0")}` : null;
}

export function parseTrStatement(items: PdfItem[]): Statement {
  const warnings: string[] = [];
  const clean = items.map((i) => ({ ...i, str: i.str.replace(/\s+/g, " ").trim() })).filter((i) => i.str);
  const all = clean.map((i) => i.str).join(" ");
  if (!/trade republic/i.test(all)) throw new Error("Este PDF no parece un extracto de Trade Republic.");

  // Periodo: «FECHA 01 nov 2026 - 21 nov 2026»
  const period = /(\d{1,2}\s+[a-zé]{3,5}\.?\s+\d{4})\s*-\s*(\d{1,2}\s+[a-zé]{3,5}\.?\s+\d{4})/i.exec(all);
  const from = period ? textDate(period[1]) : null;
  const to = period ? textDate(period[2]) : null;

  // Saldo inicial y final: la fila «Cuenta corriente» del resumen
  let opening: number | null = null, closing: number | null = null;
  const cc = clean.find((i) => /^cuenta corriente$/i.test(i.str));
  if (cc) {
    const row = clean.filter((i) => i.page === cc.page && Math.abs(i.y - cc.y) < 3 && MONEY.test(i.str)).sort((a, b) => a.x - b.x);
    if (row.length >= 2) { opening = money(row[0].str); closing = money(row[row.length - 1].str); }
  }

  const lines: StatementLine[] = [];
  const pages = [...new Set(clean.map((i) => i.page))].sort((a, b) => a - b);
  for (const p of pages) {
    const its = clean.filter((i) => i.page === p);
    // Cabecera de la tabla de movimientos de esta página
    const head = its.find((i) => /^descripci[oó]n$/i.test(i.str));
    if (!head) continue;
    const near = (re: RegExp) => its.find((i) => re.test(i.str) && Math.abs(i.y - head.y) < 8);
    const cFecha = near(/^fecha$/i), cTipo = near(/^tipo$/i), cIn = near(/^entrada/i), cOut = near(/^salida/i), cBal = near(/^balance$/i);
    if (!cFecha || !cTipo || !cIn || !cOut || !cBal) { warnings.push(`Página ${p}: no encuentro todas las columnas.`); continue; }
    const descEnd = cIn.x - 2;

    // Cada movimiento empieza con el día (01) en la columna de fecha, con el mes y el año debajo
    const days = its.filter((i) => i.y < head.y - 3 && Math.abs(i.x - cFecha.x) < 6 && /^\d{1,2}$/.test(i.str)).sort((a, b) => b.y - a.y);
    for (const d of days) {
      const below = its.filter((i) => Math.abs(i.x - cFecha.x) < 6 && i.y < d.y && i.y > d.y - 25).sort((a, b) => b.y - a.y);
      const mon = below.find((i) => month(i.str));
      const year = below.find((i) => /^\d{4}$/.test(i.str));
      const mm = mon && month(mon.str);
      if (!mm || !year) continue;
      const top = d.y + 6, bottom = year.y - 4;
      const inRow = its.filter((i) => i.y <= top && i.y >= bottom).sort((a, b) => b.y - a.y || a.x - b.x);
      let type = inRow.filter((i) => i.x >= cTipo.x - 2 && i.x < head.x - 2).map((i) => i.str).join(" ");
      let description = inRow.filter((i) => i.x >= head.x - 2 && i.x < descEnd && !MONEY.test(i.str)).map((i) => i.str).join(" ").replace(/\s+/g, " ").trim();
      // Sin columna de descripción (p. ej. «Transferencia Outgoing transfer for …» en un solo texto): la primera palabra es el tipo
      if (!description && /\s/.test(type)) {
        const [t, ...rest] = type.split(" ");
        type = t; description = rest.join(" ");
      }
      const amounts = inRow.filter((i) => i.x >= head.x && MONEY.test(i.str)).sort((a, b) => a.x - b.x);
      if (!amounts.length) { warnings.push(`No encuentro el importe de «${description}».`); continue; }
      const bal = amounts.length >= 2 && amounts[amounts.length - 1].x >= cBal.x - 20 ? amounts[amounts.length - 1] : null;
      const amt = amounts.find((a) => a !== bal);
      if (!amt) { warnings.push(`No encuentro el importe de «${description}».`); continue; }
      // Entrada o salida según la columna en la que está
      const out = Math.abs(amt.x - cOut.x) < Math.abs(amt.x - cIn.x);
      lines.push({
        date: `${year.str}-${mm}-${d.str.padStart(2, "0")}`, type, description,
        amount: round(out ? -money(amt.str) : money(amt.str)), balance: bal ? money(bal.str) : null,
      });
    }
  }

  // Comprobación con los saldos: cada saldo = anterior + importe
  let balanced = lines.length > 0;
  let prev = opening;
  for (const l of lines) {
    if (prev != null && l.balance != null && Math.abs(round(prev + l.amount) - l.balance) > 0.005) {
      // Si el signo está al revés (columna mal leída), el saldo lo corrige
      if (Math.abs(round(prev - l.amount) - l.balance) <= 0.005) l.amount = -l.amount;
      else { balanced = false; warnings.push(`El saldo no cuadra en ${l.date} «${l.description}».`); }
    }
    if (l.balance != null) prev = l.balance;
  }
  const last = lines.length ? lines[lines.length - 1].balance : null;
  if (closing != null && last != null && Math.abs(last - closing) > 0.005) {
    balanced = false;
    warnings.push("El último saldo no coincide con el saldo final del extracto: puede faltar algún movimiento.");
  }
  if (opening == null || closing == null) balanced = false;
  return { from, to, opening, closing, lines, balanced, warnings };
}

/** Lee el texto del PDF con su posición (en el servidor) */
export async function readPdfItems(data: Uint8Array): Promise<PdfItem[]> {
  const { getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(data);
  const out: PdfItem[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    for (const it of tc.items as { str?: string; transform?: number[] }[]) {
      if (!it.str || !it.transform) continue;
      out.push({ page: p, x: it.transform[4], y: it.transform[5], str: it.str });
    }
  }
  return out;
}

/** Compra del plan de inversión (Savings plan execution …) */
export const isFundPurchase = (l: Pick<StatementLine, "type" | "description">) =>
  /savings plan|\boperar\b|\btrade\b/i.test(`${l.description} ${l.type}`) && /\b[A-Z]{2}[A-Z0-9]{9}\d\b/.test(l.description);

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const days = (a: string, b: string) => Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86400000;

/**
 * Empareja cada línea del extracto con un movimiento guardado del mismo importe: primero el mismo día, luego hasta 3 días
 * de diferencia. Entre varios iguales, antes el que cuenta en la app (no «ignorar»), luego el más cercano y el que ya tiene ese nombre.
 */
export function matchStatement<R extends { id: string; date: string; amount: number; action: string; description: string }>(lines: StatementLine[], rows: R[]) {
  const used = new Set<string>();
  const counted = (r: R) => r.action !== "ignorar";
  const pairs: { line: StatementLine; row: R | null }[] = lines.map((line) => ({ line, row: null }));
  for (const maxDays of [0, 3]) {
    for (const p of pairs) {
      if (p.row) continue;
      const cands = rows.filter((r) => !used.has(r.id) && Math.abs(r.amount - p.line.amount) < 0.005 && days(r.date, p.line.date) <= maxDays);
      if (!cands.length) continue;
      const want = norm(p.line.description);
      cands.sort((a, b) => Number(counted(b)) - Number(counted(a)) || days(a.date, p.line.date) - days(b.date, p.line.date)
        || Number(norm(b.description) === want) - Number(norm(a.description) === want));
      p.row = cands[0];
      used.add(cands[0].id);
    }
  }
  return pairs;
}
