"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/data";
import { parseWorkbook } from "@/lib/importExcel";
import { createClient } from "@/lib/supabase/server";

const str = (f: FormData, k: string) => {
  const v = f.get(k);
  return v == null || String(v).trim() === "" ? null : String(v).trim();
};
const numOrNull = (v: FormDataEntryValue | string | null) => {
  if (v == null || String(v).trim() === "") return null;
  const parsed = Number(String(v).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
};

function done(path = "/") {
  revalidatePath("/", "layout");
  return path;
}

async function check<T extends { error: { message: string } | null }>(p: PromiseLike<T>) {
  const r = await p;
  if (r.error) throw new Error(r.error.message);
  return r;
}

// ---------------- Auth ----------------
export async function signIn(_: unknown, form: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(form.get("email")),
    password: String(form.get("password")),
  });
  if (error) return { error: "Email o contraseña incorrectos." };
  redirect("/");
}

export async function signUp(_: unknown, form: FormData) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: String(form.get("email")),
    password: String(form.get("password")),
  });
  if (error) return { error: error.message };
  if (!data.session) return { info: "Te hemos enviado un email para confirmar la cuenta. Después vuelve aquí e inicia sesión." };
  redirect("/ajustes");
}

export async function signInWithGoogle() {
  const supabase = await createClient();
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${proto}://${host}/auth/callback` },
  });
  if (error || !data.url) redirect("/login?error=google");
  redirect(data.url);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// ---------------- Gastos variables ----------------
export async function saveExpense(form: FormData) {
  const { supabase } = await getUser();
  const id = str(form, "id");
  const row = {
    date: str(form, "date")!,
    category_id: str(form, "category_id"),
    description: str(form, "description"),
    amount: numOrNull(form.get("amount")) ?? 0,
    payment_method: str(form, "payment_method"),
    notes: str(form, "notes"),
  };
  if (id) await check(supabase.from("expenses").update(row).eq("id", id));
  else await check(supabase.from("expenses").insert(row));
  done();
}

export async function deleteExpense(form: FormData) {
  const { supabase } = await getUser();
  await check(supabase.from("expenses").delete().eq("id", String(form.get("id"))));
  done();
}

// ---------------- Presupuesto (Fijos / Ajustes) ----------------
export async function setBudgetCell(lineId: string, year: number, month: number, field: "planned" | "adjusted", value: string) {
  const { supabase } = await getUser();
  const { data: existing } = await supabase
    .from("budget_values").select("*").eq("line_id", lineId).eq("year", year).eq("month", month).maybeSingle();
  const parsed = numOrNull(value);
  const row = {
    line_id: lineId, year, month,
    planned: existing?.planned ?? 0,
    adjusted: existing?.adjusted ?? null,
    [field]: field === "planned" ? parsed ?? 0 : parsed,
  };
  await check(supabase.from("budget_values").upsert(row, { onConflict: "line_id,year,month" }));
  done();
}

/** Copia un importe fijo a los 12 meses del año */
export async function fillPlannedYear(lineId: string, year: number, value: string) {
  const { supabase } = await getUser();
  const parsed = numOrNull(value) ?? 0;
  const { data: existing } = await supabase.from("budget_values").select("*").eq("line_id", lineId).eq("year", year);
  const rows = Array.from({ length: 12 }, (_, i) => ({
    line_id: lineId, year, month: i + 1, planned: parsed,
    adjusted: existing?.find((e) => e.month === i + 1)?.adjusted ?? null,
  }));
  await check(supabase.from("budget_values").upsert(rows, { onConflict: "line_id,year,month" }));
  done();
}

/** Marca un concepto del mes como recibido (ingreso) o pagado (gasto fijo) */
export async function setLineDone(lineId: string, year: number, month: number, value: boolean, planned: number) {
  const { supabase } = await getUser();
  const { data: existing } = await supabase
    .from("budget_values").select("line_id").eq("line_id", lineId).eq("year", year).eq("month", month).maybeSingle();
  if (existing) {
    await check(supabase.from("budget_values").update({ done: value, done_date: value ? new Date().toISOString().slice(0, 10) : null })
      .eq("line_id", lineId).eq("year", year).eq("month", month));
  } else {
    await check(supabase.from("budget_values").insert({ line_id: lineId, year, month, planned, done: value, done_date: value ? new Date().toISOString().slice(0, 10) : null }));
  }
  done();
}

/** Restablece el importe del mes al plan fijo (borra el ajuste) */
export async function clearAdjustment(lineId: string, year: number, month: number) {
  const { supabase } = await getUser();
  await check(supabase.from("budget_values").update({ adjusted: null }).eq("line_id", lineId).eq("year", year).eq("month", month));
  done();
}

export async function saveOneOffIncome(form: FormData) {
  const { supabase } = await getUser();
  await check(supabase.from("one_off_incomes").insert({
    date: str(form, "date")!,
    concept: str(form, "concept") ?? "Ingreso",
    amount: numOrNull(form.get("amount")) ?? 0,
    notes: str(form, "notes"),
  }));
  done();
}

export async function deleteOneOffIncome(form: FormData) {
  const { supabase } = await getUser();
  await check(supabase.from("one_off_incomes").delete().eq("id", String(form.get("id"))));
  done();
}

export async function addBudgetLine(form: FormData) {
  const { supabase } = await getUser();
  const section = String(form.get("section"));
  const name = str(form, "name");
  if (!name) return;
  const { count } = await supabase.from("budget_lines").select("*", { count: "exact", head: true });
  await check(supabase.from("budget_lines").insert({ section, name, sort_order: (count ?? 0) + 1 }));
  done();
}

export async function deleteBudgetLine(form: FormData) {
  const { supabase } = await getUser();
  await check(supabase.from("budget_lines").delete().eq("id", String(form.get("id"))));
  done();
}

export async function toggleMonthClosed(year: number, month: number, closed: boolean) {
  const { supabase, user } = await getUser();
  await check(supabase.from("months").upsert({ user_id: user.id, year, month, closed }, { onConflict: "user_id,year,month" }));
  done();
}

// ---------------- Anuales ----------------
export async function saveAnnual(form: FormData) {
  const { supabase } = await getUser();
  const id = str(form, "id");
  const row = { name: str(form, "name") ?? "Sin nombre", amount: numOrNull(form.get("amount")) ?? 0, pay_month: numOrNull(form.get("pay_month")) };
  if (id) await check(supabase.from("annual_expenses").update(row).eq("id", id));
  else await check(supabase.from("annual_expenses").insert({ ...row, sort_order: Date.now() % 100000 }));
  done();
}

export async function deleteAnnual(form: FormData) {
  const { supabase } = await getUser();
  await check(supabase.from("annual_expenses").delete().eq("id", String(form.get("id"))));
  done();
}

// ---------------- Planes de ahorro e inversiones ----------------
export async function savePlan(form: FormData) {
  const { supabase } = await getUser();
  const id = str(form, "id");
  const pct = numOrNull(form.get("return_pct"));
  const row = {
    name: str(form, "name") ?? "Fondo",
    monthly_amount: numOrNull(form.get("monthly_amount")),
    from_month: numOrNull(form.get("from_month")),
    to_month: numOrNull(form.get("to_month")),
    current_value: numOrNull(form.get("current_value")),
    return_pct: pct == null ? null : pct / 100,
    notes: str(form, "notes"),
  };
  if (id) await check(supabase.from("savings_plans").update(row).eq("id", id));
  else await check(supabase.from("savings_plans").insert({ ...row, sort_order: Date.now() % 100000 }));
  done();
}

export async function deletePlan(form: FormData) {
  const { supabase } = await getUser();
  await check(supabase.from("savings_plans").delete().eq("id", String(form.get("id"))));
  done();
}

export async function setPlanExtra(planId: string, year: number, month: number, value: string) {
  const { supabase } = await getUser();
  const parsed = numOrNull(value);
  if (parsed == null) await check(supabase.from("savings_extras").delete().eq("plan_id", planId).eq("year", year).eq("month", month));
  else await check(supabase.from("savings_extras").upsert({ plan_id: planId, year, month, amount: parsed }, { onConflict: "plan_id,year,month" }));
  done();
}

export async function saveInvestment(form: FormData) {
  const { supabase } = await getUser();
  await check(
    supabase.from("investments").insert({
      date: str(form, "date")!,
      type: str(form, "type") === "Venta" ? "Venta" : "Compra",
      asset: str(form, "asset")!,
      asset_class: str(form, "asset_class"),
      quantity: numOrNull(form.get("quantity")) ?? 0,
      unit_price: numOrNull(form.get("unit_price")) ?? 0,
      fees: numOrNull(form.get("fees")) ?? 0,
      notes: str(form, "notes"),
    }),
  );
  done();
}

export async function deleteInvestment(form: FormData) {
  const { supabase } = await getUser();
  await check(supabase.from("investments").delete().eq("id", String(form.get("id"))));
  done();
}

export async function setAssetPrice(asset: string, value: string) {
  const { supabase, user } = await getUser();
  const parsed = numOrNull(value);
  if (parsed == null) await check(supabase.from("asset_prices").delete().eq("asset", asset));
  else await check(supabase.from("asset_prices").upsert({ user_id: user.id, asset, price: parsed, updated_at: new Date().toISOString() }, { onConflict: "user_id,asset" }));
  done();
}

// ---------------- Patrimonio ----------------
export async function saveBank(form: FormData) {
  const { supabase } = await getUser();
  const id = str(form, "id");
  const row = { name: str(form, "name") ?? "Cuenta", balance: numOrNull(form.get("balance")) ?? 0 };
  if (id) await check(supabase.from("bank_accounts").update(row).eq("id", id));
  else await check(supabase.from("bank_accounts").insert({ ...row, sort_order: Date.now() % 100000 }));
  done();
}

export async function deleteBank(form: FormData) {
  const { supabase } = await getUser();
  await check(supabase.from("bank_accounts").delete().eq("id", String(form.get("id"))));
  done();
}

export async function addSnapshot(form: FormData) {
  const { supabase } = await getUser();
  await check(
    supabase.from("net_worth_history").insert({
      date: str(form, "date") ?? new Date().toISOString().slice(0, 10),
      cash: numOrNull(form.get("cash")) ?? 0,
      investments: numOrNull(form.get("investments")) ?? 0,
    }),
  );
  done();
}

export async function deleteSnapshot(form: FormData) {
  const { supabase } = await getUser();
  await check(supabase.from("net_worth_history").delete().eq("id", String(form.get("id"))));
  done();
}

// ---------------- Ajustes / listas ----------------
export async function saveSettings(form: FormData) {
  const { supabase, user } = await getUser();
  await check(
    supabase.from("settings").upsert({
      user_id: user.id,
      year: numOrNull(form.get("year")) ?? new Date().getFullYear(),
      annual_fund_initial: numOrNull(form.get("annual_fund_initial")) ?? 0,
      updated_at: new Date().toISOString(),
    }),
  );
  done();
}

export async function addCategory(form: FormData) {
  const { supabase } = await getUser();
  const name = str(form, "name");
  if (!name) return;
  await check(supabase.from("categories").insert({ name, sort_order: Date.now() % 100000 }));
  done();
}

export async function deleteCategory(form: FormData) {
  const { supabase } = await getUser();
  await check(supabase.from("categories").delete().eq("id", String(form.get("id"))));
  done();
}

export async function addPaymentMethod(form: FormData) {
  const { supabase } = await getUser();
  const name = str(form, "name");
  if (!name) return;
  await check(supabase.from("payment_methods").insert({ name, sort_order: Date.now() % 100000 }));
  done();
}

export async function deletePaymentMethod(form: FormData) {
  const { supabase } = await getUser();
  await check(supabase.from("payment_methods").delete().eq("id", String(form.get("id"))));
  done();
}

// ---------------- Importar Excel ----------------
export async function importExcel(_: unknown, form: FormData): Promise<{ error?: string; ok?: string }> {
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Elige el archivo .xlsx" };
  const { supabase, user } = await getUser();
  try {
    const p = await parseWorkbook(await file.arrayBuffer());
    const uid = user.id;

    // Borra los datos actuales del usuario (la importación los sustituye)
    for (const t of ["expenses", "budget_values", "budget_lines", "months", "categories", "payment_methods", "annual_expenses", "savings_extras", "savings_plans", "investments", "asset_prices", "bank_accounts", "net_worth_history"]) {
      await check(supabase.from(t).delete().eq("user_id", uid));
    }

    await check(supabase.from("settings").upsert({ user_id: uid, year: p.year, annual_fund_initial: p.annualFundInitial }));

    const { data: lines } = await check(
      supabase.from("budget_lines").insert(p.lines.map((l) => ({ section: l.section, name: l.name, sort_order: l.sort_order, is_annual_fund: l.is_annual_fund }))).select(),
    );
    const values = p.lines.flatMap((l) => {
      const id = lines!.find((x) => x.section === l.section && x.name === l.name)!.id;
      return l.planned.map((planned, i) => ({ line_id: id, year: p.year, month: i + 1, planned, adjusted: l.adjusted[i] }));
    });
    if (values.length) await check(supabase.from("budget_values").insert(values));

    if (p.closedMonths.length) await check(supabase.from("months").insert(p.closedMonths.map((month) => ({ year: p.year, month, closed: true }))));

    const { data: cats } = await check(supabase.from("categories").insert(p.categories.map((name, i) => ({ name, sort_order: i }))).select());
    if (p.paymentMethods.length) await check(supabase.from("payment_methods").insert(p.paymentMethods.map((name, i) => ({ name, sort_order: i }))));

    if (p.expenses.length) {
      await check(
        supabase.from("expenses").insert(
          p.expenses.map((e) => ({
            date: e.date,
            category_id: cats!.find((c) => c.name === e.category)?.id ?? null,
            description: e.description, amount: e.amount, payment_method: e.payment_method, notes: e.notes,
          })),
        ),
      );
    }

    if (p.annuals.length) await check(supabase.from("annual_expenses").insert(p.annuals.map((a, i) => ({ ...a, sort_order: i }))));

    if (p.plans.length) {
      const { data: plans } = await check(
        supabase.from("savings_plans").insert(p.plans.map(({ extras: _e, ...pl }, i) => ({ ...pl, sort_order: i }))).select(),
      );
      const extras = p.plans.flatMap((pl, idx) =>
        pl.extras.flatMap((amount, m) => (amount ? [{ plan_id: plans![idx].id, year: p.year, month: m + 1, amount }] : [])),
      );
      if (extras.length) await check(supabase.from("savings_extras").insert(extras));
    }

    if (p.investments.length) await check(supabase.from("investments").insert(p.investments));
    if (p.prices.length) await check(supabase.from("asset_prices").insert(p.prices));
    if (p.banks.length) await check(supabase.from("bank_accounts").insert(p.banks.map((b, i) => ({ ...b, sort_order: i }))));
    if (p.history.length) await check(supabase.from("net_worth_history").insert(p.history));

    revalidatePath("/", "layout");
    return {
      ok: `Importado: ${p.lines.length} conceptos, ${p.expenses.length} gastos, ${p.annuals.length} recibos anuales, ${p.plans.length} planes, ${p.banks.length} cuentas.`,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error importando el Excel" };
  }
}
