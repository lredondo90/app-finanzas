"use server";

import { revalidatePath } from "next/cache";
import { getUser } from "@/lib/data";
import { patternOf, suggest, type ImportRule, type SuggestedRow } from "@/lib/bankSuggest";
import { isFundPurchase, matchStatement, parseTrStatement, readPdfItems, type StatementLine } from "@/lib/trStatement";
import { confirmBankImport, reclassifyMovement } from "@/app/importActions";

const DEFAULT_BANK = "Trade Republic";
const shift = (d: string, n: number) => new Date(new Date(d).getTime() + n * 86400000).toISOString().slice(0, 10);

export interface MissingLine {
  line: StatementLine;
  suggestion: { action: SuggestedRow["action"]; category_id: string | null; line_id: string | null; label: string };
}

export interface ReconcileResult {
  error?: string;
  from?: string | null;
  to?: string | null;
  balanced?: boolean;
  warnings?: string[];
  total?: number; // movimientos en el extracto
  matched?: number; // emparejados con lo que llegó del banco
  named?: number; // a los que se ha puesto nombre ahora
  recategorized?: { date: string; description: string; amount: number; category: string }[];
  toInvestment?: { date: string; description: string; amount: number }[];
  extras?: { id: string; date: string; description: string; amount: number; category: string | null }[]; // cuentan en la app y no están en el extracto
  missing?: MissingLine[]; // están en el extracto y no llegaron del banco
}

interface Row {
  id: string; date: string; description: string; detail: string | null; amount: number; action: string;
  category_id: string | null; line_id: string | null; expense_id: string | null; import_key: string;
}

/** Sube el extracto mensual de Trade Republic: pone nombre a los movimientos y dice lo que no cuadra */
export async function reconcileTrStatement(form: FormData): Promise<ReconcileResult> {
  try {
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) return { error: "Elige el PDF del extracto." };
    if (file.size > 10 * 1024 * 1024) return { error: "El PDF es demasiado grande (máximo 10 MB)." };
    // El PDF se lee en memoria y no se guarda en ningún sitio
    let st;
    try {
      st = parseTrStatement(await readPdfItems(new Uint8Array(await file.arrayBuffer())));
    } catch (e) {
      return { error: e instanceof Error && /Trade Republic/.test(e.message) ? e.message : "No he podido leer el PDF. ¿Es el extracto de cuenta de Trade Republic?" };
    }
    if (!st.lines.length) return { error: "No he encontrado movimientos en el PDF. Puede que Trade Republic haya cambiado el formato del extracto.", warnings: st.warnings };

    const { supabase } = await getUser();
    const from = st.from ?? st.lines[0].date;
    const to = st.to ?? st.lines[st.lines.length - 1].date;
    const { data: banks } = await supabase.from("bank_connections").select("aspsp_name");
    const bank = (banks ?? []).map((b) => b.aspsp_name as string).find((n) => /trade republic/i.test(n)) ?? DEFAULT_BANK;

    const [movs, categories, lines, rules, expenses] = await Promise.all([
      supabase.from("bank_movements").select("id, date, description, detail, amount, action, category_id, line_id, expense_id, import_key")
        .eq("bank", bank).gte("date", shift(from, -3)).lte("date", shift(to, 4)).order("date"),
      supabase.from("categories").select("*").order("sort_order"),
      supabase.from("budget_lines").select("*").order("sort_order"),
      supabase.from("import_rules").select("*"),
      supabase.from("expenses").select("*").gte("date", shift(from, -365)),
    ]);
    if (movs.error) throw new Error(movs.error.message);
    const cats = categories.data ?? [];
    const otros = cats.find((c) => /^otros?$/i.test(c.name.trim()))?.id ?? null;
    const catName = (id: string | null) => (id ? cats.find((c) => c.id === id)?.name ?? null : null);

    // Los pendientes cambian en cada sincronización: no se tocan
    const rows: Row[] = (movs.data ?? []).filter((r) => !r.import_key.includes("|pend|")).map((r) => ({ ...r, amount: Number(r.amount) }));
    const counted = (r: Row) => r.action !== "ignorar";
    const pairs = matchStatement(st.lines, rows);
    const used = new Set(pairs.map((p) => p.row?.id).filter(Boolean));

    const ctx = { categories: cats, lines: lines.data ?? [], rules: (rules.data ?? []) as ImportRule[], existingKeys: new Set<string>(), expenses: expenses.data ?? [] };
    const suggestFor = (l: StatementLine) => suggest([{ bank, date: l.date, description: l.description || l.type, detail: l.type || null, type: l.type || null, amount: l.amount }], ctx)[0];

    const result: Required<Omit<ReconcileResult, "error">> = {
      from, to, balanced: st.balanced, warnings: st.warnings, total: st.lines.length, matched: 0, named: 0,
      recategorized: [], toInvestment: [], extras: [], missing: [],
    };

    const renames: (() => Promise<void>)[] = [];
    const changes: [string, string][] = []; // [movimiento, a qué pasa]: después de poner los nombres
    for (const { line, row } of pairs) {
      const description = line.description || line.type;
      if (!row) {
        const s = suggestFor(line);
        const label = s.action === "variable" ? `Gasto · ${catName(s.category_id) ?? "Otros"}`
          : s.action === "inversion" ? "Inversión" : s.action === "puntual" ? "Ingreso puntual"
          : s.action === "ignorar" ? "No contar" : s.action === "fijo" ? "Gasto fijo" : "Ingreso fijo";
        result.missing.push({ line, suggestion: { action: s.action, category_id: s.category_id, line_id: s.line_id, label } });
        continue;
      }
      result.matched++;
      // 1) Nombre y tipo del extracto
      if (row.description !== description || (row.detail ?? "") !== line.type) {
        renames.push(async () => {
          await supabase.from("bank_movements").update({ description, detail: line.type || null }).eq("id", row.id);
          if (row.expense_id) await supabase.from("expenses").update({ description }).eq("id", row.expense_id);
        });
        result.named++;
      }
      // 2) Compra del plan de inversión que estaba como gasto o sin contar
      if (isFundPurchase(line) && row.action !== "inversion" && (row.action === "variable" || row.action === "ignorar")) {
        changes.push([row.id, "inversion"]);
        result.toInvestment.push({ date: line.date, description, amount: line.amount });
        continue;
      }
      // 3) Gasto que estaba en «Otros» sin saber qué era: la categoría que toca por el comercio
      if (row.action === "variable" && (!row.category_id || row.category_id === otros)) {
        const s = suggestFor(line);
        if (s.action === "variable" && s.category_id && s.category_id !== otros) {
          changes.push([row.id, `cat:${s.category_id}`]);
          result.recategorized.push({ date: line.date, description, amount: line.amount, category: catName(s.category_id) ?? "" });
        }
      }
    }

    // Los nombres se guardan de 10 en 10 (no cambian ninguna cifra)
    for (let i = 0; i < renames.length; i += 10) await Promise.all(renames.slice(i, i + 10).map((f) => f()));
    for (const [id, to] of changes) await reclassify(id, to);

    // Cuentan en la app y no están en el extracto (en las fechas del extracto): normalmente, duplicados
    for (const r of rows) {
      if (used.has(r.id) || !counted(r) || r.date < from || r.date > to) continue;
      result.extras.push({ id: r.id, date: r.date, description: r.description, amount: r.amount, category: catName(r.category_id) });
    }

    revalidatePath("/", "layout");
    return result;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error al cuadrar el extracto" };
  }
}

async function reclassify(id: string, to: string) {
  const f = new FormData();
  f.set("id", id);
  f.set("to", to);
  await reclassifyMovement(f);
}

/** Quita de la cuenta un movimiento que no está en el extracto (p. ej. un duplicado) */
export async function dropExtraMovement(id: string): Promise<{ ok: boolean }> {
  await reclassify(id, "ignorar");
  return { ok: true };
}

/** Añade un movimiento del extracto que no llegó por la conexión del banco */
export async function addMissingLine(m: MissingLine): Promise<{ error?: string; ok?: string }> {
  const { supabase } = await getUser();
  const { data: banks } = await supabase.from("bank_connections").select("aspsp_name");
  const bank = (banks ?? []).map((b) => b.aspsp_name as string).find((n) => /trade republic/i.test(n)) ?? DEFAULT_BANK;
  const l = m.line;
  const description = l.description || l.type;
  const pattern = patternOf({ description, detail: l.type || null });
  const res = await confirmBankImport([{
    key: `${bank}|pdf|${l.date}|${l.amount.toFixed(2)}|${pattern}|${l.balance ?? ""}`,
    pattern, bank, date: l.date, description, detail: l.type || null, type: l.type || null, amount: l.amount,
    action: m.suggestion.action, category_id: m.suggestion.category_id, line_id: m.suggestion.line_id, remember: false,
  }], true);
  return res.error ? { error: res.error } : { ok: "Añadido" };
}
