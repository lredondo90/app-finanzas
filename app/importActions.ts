"use server";

import { revalidatePath } from "next/cache";
import { type ImportAction, isGenericPattern, paymentMethodOf } from "@/lib/bankSuggest";
import { accountingMonth, accountingWindow } from "@/lib/accounting";
import { getUser } from "@/lib/data";

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
  accountUid?: string | null; // cuenta de la que viene (conexión directa)
  house?: boolean; // de una cuenta conjunta: se guarda con su categoría para Casa
}

/** Paso 2: guardar lo revisado */
export async function confirmBankImport(rows: ConfirmRow[], useRealAmounts: boolean): Promise<{ error?: string; ok?: string; months?: string[] }> {
  const { supabase } = await getUser();
  try {
    let gastos = 0, fijos = 0, ingresos = 0, puntuales = 0, otros = 0;
    const touched = new Set<string>(); // line|year|month
    const [{ data: settings }, { data: lineFlags }] = await Promise.all([
      supabase.from("settings").select("cutoff_day").maybeSingle(),
      supabase.from("budget_lines").select("id, next_month"),
    ]);
    const cutoff: number = settings?.cutoff_day ?? 25;
    const shifts = (lineId: string) => !!(lineFlags ?? []).find((l) => l.id === lineId)?.next_month;

    let withAccount = true; // si la base de datos aún no tiene la columna account_uid, se guarda sin ella
    for (const r of rows) {
      const base = {
        bank: r.bank, import_key: r.key, date: r.date, description: r.description, detail: r.detail,
        amount: r.amount, action: r.action,
        category_id: r.action === "variable" || r.house ? r.category_id : null,
        line_id: r.action === "fijo" || r.action === "ingreso" ? r.line_id : null,
      };
      const insert = (withId: boolean) => supabase.from("bank_movements")
        .insert((withId && r.accountUid ? { ...base, account_uid: r.accountUid } : base) as Record<string, unknown>).select("id").single();
      let { data: inserted, error } = await insert(withAccount);
      if (error && withAccount && /account_uid/.test(error.message)) {
        withAccount = false;
        ({ data: inserted, error } = await insert(false));
      }
      if (error) {
        if (error.code === "23505") continue; // ya importado
        throw new Error(error.message);
      }
      if (!inserted) continue;

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
        // La nómina y los recibos marcados que llegan tras el día de corte cuentan para el mes siguiente
        const am = accountingMonth(r.date, shifts(r.line_id), cutoff);
        touched.add(`${r.line_id}|${am.year}|${am.month}`);
        if (r.action === "fijo") fijos++; else ingresos++;
      } else otros++;

      if (r.remember && r.pattern && !isGenericPattern(r.pattern)) {
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
      const { from, to } = accountingWindow(year, month, shifts(lineId), cutoff);
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

    // Lo revisado deja de estar pendiente
    const keys = rows.map((r) => r.key);
    for (let i = 0; i < keys.length; i += 200) await supabase.from("bank_pending").delete().in("import_key", keys.slice(i, i + 200));

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

/** Cambia qué es un movimiento ya guardado de una cuenta «sin revisar»: otra categoría, inversión o no contar */
export async function reclassifyMovement(form: FormData) {
  const { supabase } = await getUser();
  const id = String(form.get("id"));
  const to = String(form.get("to") ?? "");
  const { data: m } = await supabase.from("bank_movements").select("*").eq("id", id).maybeSingle();
  if (!m) return;
  if (to.startsWith("cat:")) {
    const category_id = to.slice(4);
    if (m.expense_id) await supabase.from("expenses").update({ category_id }).eq("id", m.expense_id);
    else {
      const { data: exp } = await supabase.from("expenses").insert({
        date: m.date, category_id, description: m.description, amount: -Number(m.amount), notes: `Importado de ${m.bank}`,
      }).select("id").single();
      await supabase.from("bank_movements").update({ expense_id: exp?.id ?? null }).eq("id", id);
    }
    await supabase.from("bank_movements").update({ action: "variable", category_id }).eq("id", id);
  } else if (to === "inversion" || to === "ignorar") {
    if (m.expense_id) await supabase.from("expenses").delete().eq("id", m.expense_id);
    await supabase.from("bank_movements").update({ action: to, category_id: null, expense_id: null }).eq("id", id);
  }
  revalidatePath("/", "layout");
}
