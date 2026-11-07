// Sugiere qué hacer con cada movimiento del banco (gasto variable, ingreso/gasto fijo, ignorar…)
import type { Movement } from "./movement";
import { mccLabel } from "./mcc";
import type { BudgetLine, Category, Expense } from "./types";

export type ImportAction = "variable" | "fijo" | "ingreso" | "puntual" | "inversion" | "ignorar";

export interface ImportRule {
  pattern: string;
  action: ImportAction;
  category_id: string | null;
  line_id: string | null;
}

export interface SuggestedRow extends Movement {
  key: string; // clave única para no importar dos veces
  pattern: string; // texto normalizado del comercio/concepto (para aprender)
  action: ImportAction;
  category_id: string | null;
  line_id: string | null;
  include: boolean;
  reason: string; // por qué se sugiere
  learned: boolean; // viene de una regla aprendida
}

export const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

const STOP = new Set(["tarjeta", "mensual", "anual", "anuales", "seguros", "extra", "gasto", "gastos", "casa", "comida", "coche", "otros", "prev"]);
const GENERIC = /^(transferencia|bizum|traspaso|ingreso|recibo|abono|cargo)/;

/** Texto estable del comercio: sin números, referencias ni signos */
export function patternOf(m: Pick<Movement, "description" | "detail">) {
  const base = norm(m.description);
  const withDetail = GENERIC.test(base) && m.detail ? `${base} ${norm(m.detail.split(" · ")[0])}` : base;
  return withDetail
    .replace(/savings plan execution\s+\S+/, "savings plan")
    .replace(/quantity:.*$/, "")
    .replace(/[0-9]+/g, " ")
    .replace(/[^a-z ]+/g, " ")
    .replace(/\b(s l|sl|s a|sa|sau|slu)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

const CATEGORY_HINTS: [RegExp, string][] = [
  [/mercadona|consum|carrefour|lidl|aldi|\bdia\b|hiper|supermerc|alcampo|eroski|fruteria|panaderia|horno/, "comida"],
  [/restaur|cafeter|\bbar\b|tasca|chiringuito|pizz|burger|mejillon|gastronom|tulotero|loteria|cine|bodega|cerveceria|taberna|grupo bunbo|kebab|sushi|just eat|glovo|uber eats/, "restaurantes"],
  [/tesla|parking|aparcam|gasolin|repsol|cepsa|galp|plenergy|\bitv\b|sitval|autopista|peaje|elparking|taller|neumatic/, "coche"],
  [/farmacia|promofarma|clinica|dentist|optica|hospital|medic/, "salud"],
  [/amazon|zara|primark|decathlon|aliexpress|corte ingles|shein|mango|pull ?bear|bershka|mediamarkt|fnac/, "ropa"],
  [/hotel|booking|airbnb|renfe|vueling|ryanair|iberia|central de reservas|viaje|tibidabo/, "viajes"],
  [/ikea|leroy|bricomart|bricolaje|ferreteria|hogar/, "casa"],
  [/regalo|floristeria/, "regalos"],
];
const ANNUAL_HINT = /seguro|mutua|mapfre|allianz|axa|linea directa|\bibi\b|impuesto|hacienda|aeat|\brenta\b|suma tributos/;
const SUPPLY_HINT = /iberdrola|endesa|naturgy|sunflower|holaluz|totalenergies|octopus/; // → línea LUZ

/** Textos que no identifican al comercio: no se aprenden (si no, todos acabarían en la misma categoría) */
export const isGenericPattern = (p: string) => !p || /^(movimiento|pago sin descripcion|ingreso sin descripcion|pago|cargo|abono|compra|card transaction|transaction)$/.test(p);

const MCC_CATEGORY: [RegExp, string][] = [
  [/Supermercado|Alimentación/, "comida"], [/Restaurante/, "restaurantes"], [/Gasolinera|Parking|Taller|Peaje/, "coche"],
  [/Farmacia|Salud/, "salud"], [/Ropa|Grandes almacenes|Venta online/, "ropa"], [/Hotel|Aerolínea|Agencia|Transporte|Taxi/, "viajes"],
  [/Bricolaje|Hogar/, "casa"], [/Floristería|Juguetería/, "regalos"], [/Cine|Ocio/, "restaurantes"],
];

export function suggest(
  movements: (Movement & { externalId?: string | null })[],
  ctx: {
    categories: Category[];
    lines: BudgetLine[];
    rules: ImportRule[];
    existingKeys: Set<string>;
    expenses: Expense[]; // para aprender de lo que ya tienes apuntado y detectar duplicados
    existingMovs?: { bank: string; date: string; amount: number }[]; // movimientos ya importados por otra vía (p. ej. el Excel)
  },
): SuggestedRow[] {
  const catByHint = (hint: string) => ctx.categories.find((c) => norm(c.name).includes(hint))?.id ?? null;
  const otros = ctx.categories.find((c) => norm(c.name) === "otros")?.id ?? ctx.categories[0]?.id ?? null;
  const incomeLines = ctx.lines.filter((l) => l.section === "ingreso");
  const fixedLines = ctx.lines.filter((l) => l.section === "fijo" && !l.is_annual_fund);

  // Lo que ya tienes apuntado: comercio → categoría más usada
  const learnedCat = new Map<string, Map<string, number>>();
  for (const e of ctx.expenses) {
    if (!e.description || !e.category_id) continue;
    const p = patternOf({ description: e.description, detail: null });
    const m = learnedCat.get(p) ?? new Map<string, number>();
    m.set(e.category_id, (m.get(e.category_id) ?? 0) + 1);
    learnedCat.set(p, m);
  }

  const seenInFile = new Map<string, number>();
  return movements.map((m) => {
    const pattern = patternOf(m);
    const baseKey = `${m.bank}|${m.date}|${m.amount.toFixed(2)}|${pattern}`;
    const n = (seenInFile.get(baseKey) ?? 0) + 1;
    seenInFile.set(baseKey, n);
    // Si el banco da un identificador propio (conexión directa), es la clave más fiable
    const key = m.externalId ? `${m.bank}|id|${m.externalId}` : `${baseKey}|${n}`;
    const text = norm(`${m.description} ${m.detail ?? ""} ${m.type ?? ""}`);
    const own = norm(`${m.description} ${m.detail ?? ""}`); // sin el tipo de operación (evita «tarjeta», «mensual»…)
    const tokens = (name: string) => norm(name).split(/[^a-z]+/).filter((w) => w.length >= 4 && !STOP.has(w));
    const matchLine = (ls: BudgetLine[]) => ls.find((l) => tokens(l.name).some((w) => new RegExp(`\\b${w}\\b`).test(own)));

    const { externalId: _ext, ...mov } = m;
    const row = (action: ImportAction, reason: string, extra: Partial<SuggestedRow> = {}): SuggestedRow => ({
      ...mov, key, pattern, action, reason, include: true, learned: false,
      category_id: null, line_id: null, ...extra,
    });

    if (ctx.existingKeys.has(key)) return row("ignorar", "Ya importado antes", { include: false });
    // Mismo importe y fecha (o hasta 3 días de diferencia: el extracto y el banco a veces usan fechas distintas)
    const sameMov = (e: { bank: string; date: string; amount: number }, days: number) =>
      norm(e.bank) === norm(m.bank) && Math.abs(Number(e.amount) - m.amount) < 0.005 &&
      Math.abs(new Date(e.date).getTime() - new Date(m.date).getTime()) <= days * 86400000;
    let sameIdx = ctx.existingMovs?.findIndex((e) => sameMov(e, 0)) ?? -1;
    if (sameIdx < 0 && m.externalId !== undefined) sameIdx = ctx.existingMovs?.findIndex((e) => sameMov(e, 3)) ?? -1;
    if (sameIdx >= 0) {
      ctx.existingMovs!.splice(sameIdx, 1); // cada movimiento previo solo «tapa» uno nuevo
      return row("ignorar", "Ya importado desde un extracto", { include: false });
    }

    const rule = isGenericPattern(pattern) ? undefined : ctx.rules.find((r) => r.pattern === pattern);
    if (rule) return row(rule.action, "Aprendido de otras veces", { category_id: rule.category_id, line_id: rule.line_id, learned: true });

    if (/savings plan|fondos de inversion|suscripcion periodica|\boperar\b/.test(text))
      return row("inversion", "Aportación a planes: ya cuenta en Inversión");
    if (/traspaso|transferencia realizada|cuenta metas|saveback/.test(text))
      return row("ignorar", "Movimiento entre tus cuentas");

    if (m.amount > 0) {
      const line = matchLine(incomeLines);
      if (line) return row("ingreso", `Coincide con ${line.name}`, { line_id: line.id });
      return row("puntual", "Entrada de dinero sin concepto fijo");
    }

    if (ANNUAL_HINT.test(text)) return row("ignorar", "Parece un recibo anual: ya cuenta en Anuales");
    if (SUPPLY_HINT.test(text)) {
      const luz = fixedLines.find((l) => /luz|electric|suministro/.test(norm(l.name)));
      if (luz) return row("fijo", `Recibo de ${luz.name}`, { line_id: luz.id });
    }
    const fixed = matchLine(fixedLines);
    if (fixed) return row("fijo", `Coincide con ${fixed.name}`, { line_id: fixed.id });

    // Gasto variable: categoría aprendida, por palabra clave u «Otros»
    const dup = ctx.expenses.find((e) => e.date === m.date && Math.abs(Number(e.amount) - Math.abs(m.amount)) < 0.005);
    const learned = isGenericPattern(pattern) ? undefined : learnedCat.get(pattern);
    const learnedId = learned ? [...learned.entries()].sort((a, b) => b[1] - a[1])[0][0] : null;
    const hint = CATEGORY_HINTS.find(([re]) => re.test(text));
    const mccHint = MCC_CATEGORY.find(([re]) => re.test(mccLabel(m.mcc) ?? ""));
    const category_id = learnedId ?? (hint ? catByHint(hint[1]) : null) ?? (mccHint ? catByHint(mccHint[1]) : null) ?? otros;
    if (dup) return row("variable", "Posible duplicado: ya tienes un gasto igual ese día", { category_id, include: false });
    const reason = learnedId ? "Categoría según tus gastos anteriores" : hint ? "Categoría por el comercio" : mccHint ? `Categoría por el tipo de comercio (${mccLabel(m.mcc)})`
      : isGenericPattern(pattern) ? "El banco no dice el comercio: elige la categoría"
      : /adeudo|recibo/.test(text) ? "Recibo domiciliado: si es un gasto fijo, elige cuál" : "Revisa la categoría";
    return row("variable", reason, { category_id });
  });
}

export function paymentMethodOf(m: Movement) {
  const t = norm(`${m.type ?? ""} ${m.description}`);
  if (/tarjeta/.test(t) && !/adeudo mensual/.test(t)) return "Tarjeta";
  if (/bizum/.test(t)) return "Bizum";
  if (/adeudo|recibo|domicil/.test(t)) return "Domiciliación";
  if (/transfer/.test(t)) return "Transferencia";
  return null;
}
