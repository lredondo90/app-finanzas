"use server";

import { revalidatePath } from "next/cache";
import { parseStatement } from "@/lib/bankParse";
import { type ImportAction, type ImportRule, type SuggestedRow, paymentMethodOf, suggest } from "@/lib/bankSuggest";
import { getUser } from "@/lib/data";

export interface ParseResult {
  error?: string;
  bank?: string;
  fileName?: string;
  rows?: SuggestedRow[];
}

/** Paso 1: leer el extracto y sugerir qué hacer con cada movimiento (no guarda nada) */
export async function parseBankFile(_: unknown, form: FormData): Promise<ParseResult> {
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Elige el extracto del banco." };
  if (file.size > 8 * 1024 * 1024) return { error: "El archivo es demasiado grande (máx. 8 MB)." };
  const { supabase } = await getUser();
  try {
    const { bank, movements } = await parseStatement(file);
    if (!movements.length) return { error: "No he encontrado movimientos en el archivo." };
    const dates = movements.map((m) => m.date).sort();
    const [categories, lines, rules, existing, expenses] = await Promise.all([
      supabase.from("categories").select("*").order("sort_order"),
      supabase.from("budget_lines").select("*").order("sort_order"),
      supabase.from("import_rules").select("pattern, action, category_id, line_id"),
      supabase.from("bank_movements").select("import_key").gte("date", dates[0]).lte("date", dates[dates.length - 1]),
      supabase.from("expenses").select("*").order("date", { ascending: false }).limit(3000),
    ]);
    const rows = suggest(movements, {
      categories: categories.data ?? [],
      lines: lines.data ?? [],
      rules: (rules.data ?? []) as ImportRule[],
      existingKeys: new Set((existing.data ?? []).map((r) => r.import_key)),
      expenses: expenses.data ?? [],
    });
    return { bank, fileName: file.name, rows };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No he podido leer el archivo." };
  }
}

export interface ConfirmRow {
  key: string;
  pattern: string;
  bank: string;
  date: string;
  description: string;
  detail: string | null;
  type: string | null;
  amount: number;
  action: ImportAction;
  category_id: string | null;
  line_id: string | null;
  remember: boolean;
}

/** Paso 2: guardar lo revisado */
export async function confirmBankImport(rows: ConfirmRow[], useRealAmounts: boolean): Promise<{ error?: string; ok?: string; months?: string[] }> {
  const { supabase } = await getUser();
  try {
    let gastos = 0, fijos = 0, ingresos = 0, puntuales = 0, otros = 0;
    const touched = new Set<string>(); // line|year|month

    for (const r of rows) {
      const { data: inserted, error } = await supabase
        .from("bank_movements")
        .insert({
          bank: r.bank, import_key: r.key, date: r.date, description: r.description, detail: r.detail,
          amount: r.amount, action: r.action,
          category_id: r.action === "variable" ? r.category_id : null,
          line_id: r.action === "fijo" || r.action === "ingreso" ? r.line_id : null,
        })
        .select("id")
        .single();
      if (error) {
        if (error.code === "23505") continue; // ya importado
        throw new Error(error.message);
      }

      if (r.action === "variable") {
        const { data: exp, error: e2 } = await supabase.from("expenses").insert({
          date: r.date,
          category_id: r.category_id,
          description: r.detail && /^(bizum|transferencia)/i.test(r.description) ? `${r.description} · ${r.detail}` : r.description,
          amount: -r.amount, // una devolución (positivo en el banco) resta gasto
          payment_method: paymentMethodOf(r),
          notes: `Importado de ${r.bank}`,
        }).select("id").single();
        if (e2) throw new Error(e2.message);
        await supabase.from("bank_movements").update({ expense_id: exp.id }).eq("id", inserted.id);
        gastos++;
      } else if (r.action === "puntual") {
        const { data: inc, error: e3 } = await supabase.from("one_off_incomes").insert({
          date: r.date, concept: r.detail ? `${r.description} · ${r.detail}` : r.description, amount: r.amount, notes: `Importado de ${r.bank}`,
        }).select("id").single();
        if (e3) throw new Error(e3.message);
        await supabase.from("bank_movements").update({ one_off_income_id: inc.id }).eq("id", inserted.id);
        puntuales++;
      } else if ((r.action === "fijo" || r.action === "ingreso") && r.line_id) {
        touched.add(`${r.line_id}|${r.date.slice(0, 4)}|${Number(r.date.slice(5, 7))}`);
        if (r.action === "fijo") fijos++; else ingresos++;
      } else otros++;

      if (r.remember && r.pattern) {
        await supabase.from("import_rules").upsert(
          {
            pattern: r.pattern, action: r.action,
            category_id: r.action === "variable" ? r.category_id : null,
            line_id: r.action === "fijo" || r.action === "ingreso" ? r.line_id : null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,pattern" },
        );
      }
    }

    // Marca como recibido/pagado y, si se pide, usa el importe real del banco (suma de todos sus movimientos del mes)
    for (const t of touched) {
      const [lineId, y, m] = t.split("|");
      const year = Number(y), month = Number(m);
      const from = `${year}-${String(month).padStart(2, "0")}-01`;
      const to = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
      const { data: movs } = await supabase.from("bank_movements").select("amount").eq("line_id", lineId).gte("date", from).lt("date", to);
      const real = Math.round(Math.abs((movs ?? []).reduce((s, x) => s + Number(x.amount), 0)) * 100) / 100;
      const { data: existing } = await supabase.from("budget_values").select("planned").eq("line_id", lineId).eq("year", year).eq("month", month).maybeSingle();
      const patch: Record<string, unknown> = { done: true, done_date: new Date().toISOString().slice(0, 10) };
      if (useRealAmounts) patch.adjusted = real;
      if (existing) {
        const { error } = await supabase.from("budget_values").update(patch).eq("line_id", lineId).eq("year", year).eq("month", month);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from("budget_values").insert({ line_id: lineId, year, month, planned: 0, ...patch });
        if (error) throw new Error(error.message);
      }
    }

    revalidatePath("/", "layout");
    const parts = [
      gastos && `${gastos} gastos variables`,
      ingresos && `${ingresos} ingresos fijos marcados como recibidos`,
      fijos && `${fijos} gastos fijos marcados como pagados`,
      puntuales && `${puntuales} ingresos puntuales`,
      otros && `${otros} ignorados (traspasos, inversión…)`,
    ].filter(Boolean);
    const months = Array.from(new Set(rows.map((r) => r.date.slice(0, 7)))).sort();
    return { ok: parts.length ? `Guardado: ${parts.join(", ")}.` : "No había nada nuevo que guardar.", months };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error guardando la importación" };
  }
}

/** Olvida una regla aprendida */
export async function deleteImportRule(form: FormData) {
  const { supabase } = await getUser();
  await supabase.from("import_rules").delete().eq("pattern", String(form.get("pattern")));
  revalidatePath("/importar");
}
