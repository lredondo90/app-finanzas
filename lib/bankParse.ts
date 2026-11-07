// Lectura de extractos bancarios: BBVA (Excel «Últimos movimientos»), Trade Republic (PDF)
// y Excel/CSV genéricos con columnas Fecha / Concepto / Importe.
import ExcelJS from "exceljs";

export interface Movement {
  bank: string;
  date: string; // YYYY-MM-DD
  description: string; // texto principal (comercio o concepto)
  detail: string | null; // texto secundario (observaciones, tipo…)
  type: string | null; // tipo de operación según el banco (tarjeta, adeudo, transferencia…)
  amount: number; // con signo: negativo = salida
  account?: string | null; // cuenta de la que viene (conexión directa)
  mcc?: string | null; // código de comercio de la tarjeta (conexión directa)
  raw?: unknown; // datos originales del banco (solo para revisar)
}

const MESES: Record<string, number> = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, sept: 9, oct: 10, nov: 11, dic: 12 };
const pad = (n: number) => String(n).padStart(2, "0");

export function parseEuro(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v;
  let s = String(v).replace(/[€\s]/g, "").replace(/−/g, "-");
  if (!s) return null;
  // 1.234,56 → 1234.56 ; 1,234.56 → 1234.56
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  if (typeof v === "number") {
    const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) return `${m[3].length === 2 ? "20" + m[3] : m[3]}-${pad(+m[2])}-${pad(+m[1])}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.toLowerCase().match(/^(\d{1,2})\s+([a-z]{3,4})\.?\s+(\d{4})/);
  if (m && MESES[m[2]]) return `${m[3]}-${pad(MESES[m[2]])}-${pad(+m[1])}`;
  return null;
}

function cellValue(c: ExcelJS.Cell): unknown {
  const v = c.value as unknown;
  if (v && typeof v === "object" && !(v instanceof Date)) {
    const o = v as Record<string, unknown>;
    if ("result" in o) return o.result;
    if ("richText" in o) return (o.richText as { text: string }[]).map((t) => t.text).join("");
    if ("text" in o) return o.text;
  }
  return v;
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Quita del detalle los números de adeudo/referencia y lo que repite el concepto */
function tidyDetail(concept: string, parts: string[]): string | null {
  const seen = new Set<string>();
  const out: string[] = [];
  for (let p of parts) {
    p = p.replace(/\s+/g, " ").trim();
    if (!p) continue;
    if (/^(adeudo\s+n|n\s*\d{6,}|nrc\.?\s|\d{8,}$)/i.test(p)) continue;
    const k = norm(p);
    if (seen.has(k) || k === norm(concept)) continue;
    seen.add(k);
    out.push(p);
  }
  return out.join(" · ") || null;
}

/** Busca la fila de cabecera y mapea columnas por nombre */
function tableToMovements(rows: unknown[][], bankHint: string): Movement[] {
  const headerIdx = rows.findIndex((r) => {
    const t = r.map((c) => norm(String(c ?? "")));
    return t.some((x) => x === "fecha" || x.includes("fecha") || x.includes("date")) &&
      t.some((x) => x.includes("importe") || x === "amount" || x.includes("cargo") || x.includes("abono"));
  });
  if (headerIdx < 0) throw new Error("No encuentro las columnas Fecha e Importe en el archivo.");
  const header = rows[headerIdx].map((c) => norm(String(c ?? "")));
  const find = (...names: string[]) => {
    for (const n of names) {
      const i = header.findIndex((h) => h === n);
      if (i >= 0) return i;
    }
    for (const n of names) {
      const i = header.findIndex((h) => h.includes(n));
      if (i >= 0) return i;
    }
    return -1;
  };
  const iDate = find("fecha", "fecha operacion", "started date", "completed date", "date", "f.valor");
  const iConcept = find("concepto", "description", "descripcion", "comercio");
  const iDetail = find("movimiento", "detalle", "type");
  const iObs = find("observaciones", "notas", "referencia");
  const iAmount = find("importe", "amount", "cantidad");
  const iCargo = find("cargo", "debe");
  const iAbono = find("abono", "haber");

  const out: Movement[] = [];
  for (const r of rows.slice(headerIdx + 1)) {
    const date = parseDate(r[iDate]);
    let amount = iAmount >= 0 ? parseEuro(r[iAmount]) : null;
    if (amount == null && (iCargo >= 0 || iAbono >= 0)) {
      const cargo = parseEuro(r[iCargo]) ?? 0;
      const abono = parseEuro(r[iAbono]) ?? 0;
      amount = abono - Math.abs(cargo);
    }
    if (!date || amount == null || amount === 0) continue;
    const concept = String(r[iConcept] ?? "").trim();
    const detail = iDetail >= 0 ? String(r[iDetail] ?? "").trim() : "";
    const obs = iObs >= 0 ? String(r[iObs] ?? "").trim() : "";
    out.push({
      bank: bankHint,
      date,
      description: concept || detail || obs || "Movimiento",
      detail: tidyDetail(concept, [detail, obs]),
      type: concept || null,
      amount: Math.round(amount * 100) / 100,
    });
  }
  return out;
}

async function parseXlsx(buffer: ArrayBuffer): Promise<{ bank: string; movements: Movement[] }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  const rows: unknown[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const r: unknown[] = [];
    for (let c = 1; c <= Math.max(ws.columnCount, 12); c++) r.push(cellValue(row.getCell(c)));
    rows.push(r);
  });
  const allText = norm(rows.slice(0, 6).flat().map((x) => String(x ?? "")).join(" ") + " " + ws.name);
  const bank = allText.includes("bbva") ? "BBVA" : "Excel";
  return { bank, movements: tableToMovements(rows, bank) };
}

function parseCsv(text: string): { bank: string; movements: Movement[] } {
  const first = text.split(/\r?\n/).find((l) => l.trim()) ?? "";
  const sep = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ";" : first.includes("\t") ? "\t" : ",";
  const rows = text.split(/\r?\n/).filter((l) => l.trim()).map((line) => {
    const cells: string[] = [];
    let cur = "", q = false;
    for (const ch of line) {
      if (ch === '"') q = !q;
      else if (ch === sep && !q) { cells.push(cur); cur = ""; }
      else cur += ch;
    }
    cells.push(cur);
    return cells.map((c) => c.trim());
  });
  const head = norm(rows[0]?.join(" ") ?? "");
  const bank = head.includes("started date") ? "Revolut" : "CSV";
  return { bank, movements: tableToMovements(rows, bank) };
}

/** Trade Republic: el PDF trae columnas FECHA · TIPO · DESCRIPCIÓN · ENTRADA · SALIDA · BALANCE */
async function parsePdf(buffer: ArrayBuffer): Promise<{ bank: string; movements: Movement[] }> {
  const { getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  type Item = { x: number; y: number; s: string };
  const movements: Movement[] = [];
  let isTR = false;

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    const items: Item[] = (tc.items as { str?: string; transform?: number[] }[])
      .filter((i) => i.str && i.str.trim() && i.transform)
      .map((i) => ({ x: i.transform![4], y: i.transform![5], s: i.str!.trim() }));
    if (items.some((i) => /trade republic/i.test(i.s))) isTR = true;

    // Cabecera de la tabla de transacciones
    const tipo = items.find((i) => i.s === "TIPO");
    const desc = items.find((i) => i.s.startsWith("DESCRIPCI") && tipo && Math.abs(i.y - tipo.y) < 3);
    if (!tipo || !desc) continue;
    const headerY = tipo.y;
    const near = (label: string) => items.find((i) => i.s.startsWith(label) && Math.abs(i.y - headerY) < 6 && i.x > desc.x);
    const xIn = near("ENTRADA")?.x;
    const xOut = near("SALIDA")?.x;
    const xBal = near("BALANCE")?.x;
    if (xIn == null || xOut == null || xBal == null) continue;

    const body = items.filter((i) => i.y < headerY - 8);
    const footerY = Math.max(...body.filter((i) => /^Trade Republic Bank GmbH|^RESUMEN DEL BALANCE|^Creado en/.test(i.s)).map((i) => i.y), 0);
    const rows = body.filter((i) => i.y > footerY + 2);

    // Cada movimiento empieza con el día (dos cifras) en la columna FECHA
    const days = rows.filter((i) => i.x < tipo.x - 5 && /^\d{1,2}$/.test(i.s)).sort((a, b) => b.y - a.y);
    days.forEach((day, k) => {
      const top = day.y + 4;
      const bottom = k + 1 < days.length ? days[k + 1].y + 4 : -Infinity;
      const block = rows.filter((i) => i.y <= top && i.y > bottom);
      const dateCol = block.filter((i) => i.x < tipo.x - 5).sort((a, b) => b.y - a.y).map((i) => i.s);
      const date = parseDate(dateCol.slice(0, 3).join(" "));
      const typeTxt = block.filter((i) => i.x >= tipo.x - 5 && i.x < desc.x - 3).sort((a, b) => b.y - a.y).map((i) => i.s).join(" ");
      const descTxt = block.filter((i) => i.x >= desc.x - 3 && i.x < xIn - 15).sort((a, b) => b.y - a.y || a.x - b.x).map((i) => i.s).join(" ");
      const money = block.filter((i) => i.x >= xIn - 15 && /€/.test(i.s));
      const col = (x: number) => {
        const d = [xIn, xOut, xBal].map((c) => Math.abs(c - x));
        return d.indexOf(Math.min(...d));
      };
      let amount: number | null = null;
      for (const m of money) {
        const c = col(m.x);
        const v = parseEuro(m.s);
        if (v == null) continue;
        if (c === 0) amount = Math.abs(v);
        if (c === 1) amount = -Math.abs(v);
      }
      if (!date || amount == null) return;
      movements.push({ bank: "Trade Republic", date, description: descTxt || typeTxt, detail: typeTxt || null, type: typeTxt || null, amount });
    });
  }
  if (!movements.length) throw new Error(isTR ? "No he encontrado movimientos en el PDF de Trade Republic." : "No reconozco este PDF. De momento leo los extractos PDF de Trade Republic; para otros bancos sube el Excel o CSV.");
  return { bank: isTR ? "Trade Republic" : "PDF", movements };
}

export async function parseStatement(file: File): Promise<{ bank: string; movements: Movement[] }> {
  const name = file.name.toLowerCase();
  const buf = await file.arrayBuffer();
  const head = new Uint8Array(buf.slice(0, 5));
  const isPdf = String.fromCharCode(...head) === "%PDF-";
  const isZip = head[0] === 0x50 && head[1] === 0x4b; // xlsx
  if (isPdf || name.endsWith(".pdf")) return parsePdf(buf);
  if (isZip || name.endsWith(".xlsx")) return parseXlsx(buf);
  if (name.endsWith(".csv") || name.endsWith(".txt")) return parseCsv(new TextDecoder("utf-8").decode(buf));
  throw new Error("Formato no soportado. Sube el extracto en Excel (.xlsx), CSV o PDF.");
}
