// Lee el Excel «Presupuesto» (misma estructura que Presupuesto_2026.xlsx) y lo convierte en filas para Supabase.
import ExcelJS from "exceljs";
import { MONTHS } from "./finance";

type Cell = ExcelJS.Cell;

function raw(cell: Cell): unknown {
  const v = cell.value as unknown;
  if (v == null) return null;
  if (typeof v === "object" && !(v instanceof Date)) {
    const o = v as Record<string, unknown>;
    if ("result" in o) return o.result ?? null;
    if ("richText" in o) return (o.richText as { text: string }[]).map((t) => t.text).join("");
    if ("text" in o) return o.text;
    if ("formula" in o || "sharedFormula" in o) return null;
  }
  return v;
}

const text = (c: Cell) => {
  const v = raw(c);
  return v == null ? "" : String(v).trim();
};
const num = (c: Cell): number | null => {
  const v = raw(c);
  if (v == null || v === "") return null;
  if (typeof v === "number") return v;
  const parsed = Number(String(v).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
};
const iso = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
const date = (c: Cell): string | null => {
  const v = raw(c);
  if (v == null || v === "") return null;
  if (v instanceof Date) return iso(v);
  if (typeof v === "number") return iso(new Date(Date.UTC(1899, 11, 30) + v * 86400000));
  const m = String(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const m2 = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m2 ? `${m2[1]}-${m2[2]}-${m2[3]}` : null;
};
const monthIdx = (c: Cell): number | null => {
  const t = text(c).toLowerCase();
  if (!t) return null;
  const i = MONTHS.findIndex((m) => m.toLowerCase() === t);
  if (i >= 0) return i + 1;
  const asNum = Number(t);
  return Number.isInteger(asNum) && asNum >= 1 && asNum <= 12 ? asNum : null;
};

export interface ParsedBudget {
  year: number;
  annualFundInitial: number;
  lines: {
    key: string;
    section: "ingreso" | "fijo" | "provision";
    name: string;
    sort_order: number;
    is_annual_fund: boolean;
    planned: number[]; // 12 meses
    adjusted: (number | null)[];
  }[];
  closedMonths: number[];
  categories: string[];
  paymentMethods: string[];
  expenses: { date: string; category: string; description: string | null; amount: number; payment_method: string | null; notes: string | null }[];
  annuals: { name: string; amount: number; pay_month: number | null }[];
  plans: {
    name: string;
    monthly_amount: number | null;
    from_month: number | null;
    to_month: number | null;
    current_value: number | null;
    return_pct: number | null;
    notes: string | null;
    extras: (number | null)[];
  }[];
  investments: { date: string; type: "Compra" | "Venta"; asset: string; asset_class: string | null; quantity: number; unit_price: number; fees: number; notes: string | null }[];
  prices: { asset: string; price: number }[];
  banks: { name: string; balance: number }[];
  history: { date: string; cash: number; investments: number }[];
}

export async function parseWorkbook(buffer: ArrayBuffer): Promise<ParsedBudget> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const sheet = (name: string) => {
    const ws = wb.getWorksheet(name);
    if (!ws) throw new Error(`No encuentro la hoja «${name}» en el Excel`);
    return ws;
  };

  const mensual = sheet("Mensual");
  const fijos = sheet("Fijos");
  const ajustes = sheet("Ajustes");
  const year = num(mensual.getCell("B2")) ?? new Date().getFullYear();

  // --- Fijos + Ajustes ---
  const lines: ParsedBudget["lines"] = [];
  let section: "ingreso" | "fijo" | "provision" | null = null;
  for (let r = 5; r <= fijos.rowCount; r++) {
    const name = text(fijos.getCell(r, 1));
    if (!name) continue;
    const up = name.toUpperCase();
    if (up === "INGRESOS") { section = "ingreso"; continue; }
    if (up === "GASTOS FIJOS") { section = "fijo"; continue; }
    if (up.startsWith("PROVISIÓN") || up.startsWith("PROVISION")) { section = "provision"; continue; }
    if (up.startsWith("TOTAL") || up.startsWith("RESULTADO") || !section) continue;
    const f = fijos.getCell(r, 2).value as { formula?: string } | null;
    const isAnnual = !!(f && typeof f === "object" && f.formula && /Anuales/i.test(f.formula));
    const planned = Array.from({ length: 12 }, (_, i) => num(fijos.getCell(r, i + 2)) ?? 0);
    // Ajustes: misma fila con el mismo nombre
    const adjRow = text(ajustes.getCell(r, 1)) === name ? r : findRow(ajustes, name);
    const adjusted = Array.from({ length: 12 }, (_, i) => (adjRow ? num(ajustes.getCell(adjRow, i + 2)) : null));
    lines.push({ key: `${section}:${name}`, section, name, sort_order: lines.length, is_annual_fund: isAnnual, planned, adjusted });
  }

  // --- Meses cerrados (Mensual fila «¿Mes cerrado?») ---
  const closedMonths: number[] = [];
  const closedRow = findRow(mensual, "¿Mes cerrado?", true);
  if (closedRow) for (let i = 0; i < 12; i++) if (/^s[ií]/i.test(text(mensual.getCell(closedRow, i + 2)))) closedMonths.push(i + 1);

  // --- Listas ---
  const listas = sheet("Listas");
  const categories: string[] = [];
  const paymentMethods: string[] = [];
  for (let r = 3; r <= 17; r++) {
    const c = text(listas.getCell(r, 1));
    if (c) categories.push(c);
    const p = text(listas.getCell(r, 2));
    if (p) paymentMethods.push(p);
  }

  // --- Variables ---
  const variables = sheet("Variables");
  const expenses: ParsedBudget["expenses"] = [];
  for (let r = 5; r <= variables.rowCount; r++) {
    const d = date(variables.getCell(r, 1));
    const amount = num(variables.getCell(r, 4));
    if (!d || amount == null) continue;
    const cat = text(variables.getCell(r, 2));
    if (cat && !categories.includes(cat)) categories.push(cat);
    expenses.push({
      date: d,
      category: cat,
      description: text(variables.getCell(r, 3)) || null,
      amount,
      payment_method: text(variables.getCell(r, 5)) || null,
      notes: text(variables.getCell(r, 6)) || null,
    });
  }

  // --- Anuales ---
  const anuales = sheet("Anuales");
  const annualFundInitial = num(anuales.getCell("B4")) ?? 0;
  const annuals: ParsedBudget["annuals"] = [];
  for (let r = 7; r <= 36; r++) {
    const name = text(anuales.getCell(r, 1));
    const amount = num(anuales.getCell(r, 2));
    if (!name || name.toUpperCase().startsWith("TOTAL")) continue;
    annuals.push({ name, amount: amount ?? 0, pay_month: monthIdx(anuales.getCell(r, 3)) });
  }

  // --- Planes ---
  const planes = sheet("Planes");
  const plans: ParsedBudget["plans"] = [];
  for (let r = 5; r <= 19; r++) {
    const name = text(planes.getCell(r, 1));
    if (!name) continue;
    const extras = Array.from({ length: 12 }, (_, i) => num(planes.getCell(r + 19, i + 5)));
    plans.push({
      name,
      monthly_amount: num(planes.getCell(r, 2)),
      from_month: monthIdx(planes.getCell(r, 3)),
      to_month: monthIdx(planes.getCell(r, 4)),
      current_value: num(planes.getCell(r, 18)),
      return_pct: num(planes.getCell(r, 19)),
      notes: text(planes.getCell(r, 22)) || null,
      extras,
    });
  }

  // --- Inversiones ---
  const inv = sheet("Inversiones");
  const investments: ParsedBudget["investments"] = [];
  for (let r = 5; r <= Math.min(inv.rowCount, 1004); r++) {
    const d = date(inv.getCell(r, 1));
    const type = text(inv.getCell(r, 2));
    const asset = text(inv.getCell(r, 3));
    const quantity = num(inv.getCell(r, 5));
    const price = num(inv.getCell(r, 6));
    if (!d || !asset || quantity == null || price == null || (type !== "Compra" && type !== "Venta")) continue;
    investments.push({
      date: d, type, asset,
      asset_class: text(inv.getCell(r, 4)) || null,
      quantity, unit_price: price,
      fees: num(inv.getCell(r, 8)) ?? 0,
      notes: text(inv.getCell(r, 10)) || null,
    });
  }

  // --- Cartera (precios actuales) ---
  const cartera = sheet("Cartera");
  const prices: ParsedBudget["prices"] = [];
  for (let r = 5; r <= 24; r++) {
    const asset = text(cartera.getCell(r, 1));
    const price = num(cartera.getCell(r, 9));
    if (asset && price != null) prices.push({ asset, price });
  }

  // --- Patrimonio ---
  const pat = sheet("Patrimonio");
  const banks: ParsedBudget["banks"] = [];
  const bankHeader = findRow(pat, "Banco") ?? 13;
  for (let r = bankHeader + 1; r <= bankHeader + 12; r++) {
    const name = text(pat.getCell(r, 1));
    if (!name || name.toUpperCase().startsWith("TOTAL")) break;
    banks.push({ name, balance: num(pat.getCell(r, 2)) ?? 0 });
  }
  const history: ParsedBudget["history"] = [];
  const histHeader = findRow(pat, "Fecha", false, bankHeader + 1);
  if (histHeader) {
    for (let r = histHeader + 1; r <= pat.rowCount; r++) {
      const d = date(pat.getCell(r, 1));
      if (!d) continue;
      history.push({ date: d, cash: num(pat.getCell(r, 2)) ?? 0, investments: num(pat.getCell(r, 3)) ?? 0 });
    }
  }

  return { year, annualFundInitial, lines, closedMonths, categories, paymentMethods, expenses, annuals, plans, investments, prices, banks, history };
}

function findRow(ws: ExcelJS.Worksheet, label: string, prefix = false, start = 1): number | null {
  for (let r = start; r <= ws.rowCount; r++) {
    const t = text(ws.getCell(r, 1));
    if (prefix ? t.startsWith(label) : t === label) return r;
  }
  return null;
}
