"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getUser, loadYear } from "@/lib/data";
import { EXTRA_MONTHS, extraValue, normalValue } from "@/lib/plan";
import { createClient } from "@/lib/supabase/server";
import { refreshNetWorth } from "./importActions";

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
  await refreshNetWorth();
  done();
}

export async function deleteExpense(form: FormData) {
  const { supabase } = await getUser();
  const id = String(form.get("id"));
  // Si venía del banco, el movimiento queda como «no contar» (así no vuelve a aparecer como gasto)
  await supabase.from("bank_movements").update({ action: "ignorar", category_id: null }).eq("expense_id", id);
  await check(supabase.from("expenses").delete().eq("id", id));
  await refreshNetWorth();
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
  await refreshNetWorth();
  done();
}

export async function deleteOneOffIncome(form: FormData) {
  const { supabase } = await getUser();
  await check(supabase.from("one_off_incomes").delete().eq("id", String(form.get("id"))));
  await refreshNetWorth();
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
  await refreshNetWorth();
  done();
}

export async function deletePlan(form: FormData) {
  const { supabase } = await getUser();
  await check(supabase.from("savings_plans").delete().eq("id", String(form.get("id"))));
  await refreshNetWorth();
  done();
}

export async function setPlanExtra(planId: string, year: number, month: number, value: string) {
  const { supabase } = await getUser();
  const parsed = numOrNull(value);
  if (parsed == null) await check(supabase.from("savings_extras").delete().eq("plan_id", planId).eq("year", year).eq("month", month));
  else await check(supabase.from("savings_extras").upsert({ plan_id: planId, year, month, amount: parsed }, { onConflict: "plan_id,year,month" }));
  await refreshNetWorth();
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
  await refreshNetWorth();
  done();
}

export async function deleteInvestment(form: FormData) {
  const { supabase } = await getUser();
  await check(supabase.from("investments").delete().eq("id", String(form.get("id"))));
  await refreshNetWorth();
  done();
}

export async function setAssetPrice(asset: string, value: string) {
  const { supabase, user } = await getUser();
  const parsed = numOrNull(value);
  if (parsed == null) await check(supabase.from("asset_prices").delete().eq("asset", asset));
  else await check(supabase.from("asset_prices").upsert({ user_id: user.id, asset, price: parsed, updated_at: new Date().toISOString() }, { onConflict: "user_id,asset" }));
  await refreshNetWorth();
  done();
}

// ---------------- Patrimonio ----------------
export async function saveBank(form: FormData) {
  const { supabase } = await getUser();
  const id = str(form, "id");
  const row = { name: str(form, "name") ?? "Cuenta", balance: numOrNull(form.get("balance")) ?? 0 };
  if (id) await check(supabase.from("bank_accounts").update(row).eq("id", id));
  else await check(supabase.from("bank_accounts").insert({ ...row, sort_order: Date.now() % 100000 }));
  await refreshNetWorth();
  done();
}

export async function deleteBank(form: FormData) {
  const { supabase } = await getUser();
  await check(supabase.from("bank_accounts").delete().eq("id", String(form.get("id"))));
  await refreshNetWorth();
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
      cutoff_day: Math.min(28, Math.max(1, numOrNull(form.get("cutoff_day")) ?? 25)),
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

// ---------------- Año nuevo ----------------
/** Cambia el año que se ve en la app */
export async function setActiveYear(form: FormData) {
  const { supabase, user } = await getUser();
  const year = numOrNull(form.get("year"));
  if (!year) return;
  await check(supabase.from("settings").upsert({ user_id: user.id, year, updated_at: new Date().toISOString() }));
  done();
}

/** Crea el año siguiente copiando lo previsto de cada concepto mes a mes (sin ajustes ni estados) y pasa a verlo */
export async function createNextYear() {
  const { supabase, user } = await getUser();
  const { data: settings } = await supabase.from("settings").select("year").maybeSingle();
  const from = settings?.year ?? new Date().getFullYear();
  const to = from + 1;
  const { count } = await supabase.from("budget_values").select("*", { count: "exact", head: true }).eq("year", to);
  if (!count) {
    // Cada concepto pasa con su mes normal; los ingresos con paga extra la llevan en enero y julio
    const prev = await loadYear(from);
    const rows = prev.lines.flatMap((l) => {
      const normal = normalValue(prev, l);
      const extra = l.section === "ingreso" ? extraValue(prev, l) : 0;
      return Array.from({ length: 12 }, (_, i) => ({ line_id: l.id, year: to, month: i + 1, planned: normal + (EXTRA_MONTHS.includes(i + 1) ? extra : 0) }));
    });
    for (let i = 0; i < rows.length; i += 500) await check(supabase.from("budget_values").insert(rows.slice(i, i + 500)));
  }
  await check(supabase.from("settings").upsert({ user_id: user.id, year: to, updated_at: new Date().toISOString() }));
  done();
  redirect("/plan?nuevo=" + to);
}

// ---------------- Mes contable ----------------
/** Marca un concepto (nómina, recibo de fin de mes) para que cuente en el mes siguiente si llega tras el día de corte */
export async function setLineNextMonth(lineId: string, value: boolean) {
  const { supabase } = await getUser();
  await check(supabase.from("budget_lines").update({ next_month: value }).eq("id", lineId));
  done();
}

// ---------------- Patrimonio: cuentas a mano y fondos ----------------
export async function setBankCounted(form: FormData) {
  const { supabase } = await getUser();
  await check(supabase.from("bank_accounts").update({ counted: form.get("counted") === "1" }).eq("id", String(form.get("id"))));
  await refreshNetWorth();
  done();
}

export async function saveHolding(form: FormData) {
  const { supabase } = await getUser();
  const isin = (str(form, "isin") ?? "").toUpperCase();
  if (!isin) return;
  const price = numOrNull(form.get("price"));
  const row: Record<string, unknown> = {
    isin,
    name: str(form, "name") ?? isin,
    initial_units: numOrNull(form.get("initial_units")) ?? 0,
    initial_value: numOrNull(form.get("initial_value")),
    initial_cost: numOrNull(form.get("initial_cost")),
    initial_date: str(form, "initial_date"),
    match_text: str(form, "match_text"),
    updated_at: new Date().toISOString(),
  };
  // Un precio escrito a mano se queda fijo hasta que lo borres (para fondos sin cotización pública)
  if (form.has("price")) {
    row.price = price;
    row.price_manual = price != null;
    row.price_date = price != null ? new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" }) : null;
  }
  await check(supabase.from("fund_holdings").upsert(row, { onConflict: "user_id,isin" }));
  await refreshNetWorth();
  done();
}

export async function deleteHolding(form: FormData) {
  const { supabase } = await getUser();
  await check(supabase.from("fund_holdings").delete().eq("isin", String(form.get("isin"))));
  await refreshNetWorth();
  done();
}

// ---------------- Mi plan: mes normal + paga extra ----------------
/**
 * Guarda el importe de un mes normal o la paga extra (enero y julio) de un concepto.
 * Los meses que eran un cambio puntual (no seguían el patrón anterior) se respetan.
 */
export async function setPlanLine(lineId: string, year: number, field: "normal" | "extra", value: string, oldNormal: number, oldExtra: number) {
  const { supabase } = await getUser();
  const parsed = numOrNull(value) ?? 0;
  const normal = field === "normal" ? parsed : oldNormal;
  const extra = field === "extra" ? parsed : oldExtra;
  const extraMonths = [1, 7];
  const { data: existing } = await check(supabase.from("budget_values").select("*").eq("line_id", lineId).eq("year", year));
  const rows = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    const cur = existing?.find((e) => e.month === month);
    const oldPattern = oldNormal + (extraMonths.includes(month) ? oldExtra : 0);
    const keep = cur && Math.abs(Number(cur.planned ?? 0) - oldPattern) > 0.005;
    const planned = keep ? Number(cur.planned) : normal + (extraMonths.includes(month) ? extra : 0);
    return { line_id: lineId, year, month, planned, adjusted: cur?.adjusted ?? null };
  });
  await check(supabase.from("budget_values").upsert(rows, { onConflict: "line_id,year,month" }));
  done();
}

/** Cambio puntual: lo previsto de un concepto en un mes concreto */
export async function savePlanException(form: FormData) {
  const lineId = String(form.get("line_id") ?? "");
  const month = Number(form.get("month"));
  if (!lineId || !(month >= 1 && month <= 12)) return;
  await setBudgetCell(lineId, Number(form.get("year")), month, "planned", String(form.get("value") ?? ""));
}

// ---------------- Inquilino ----------------
/** Apunta a mano un gasto que te debe el inquilino o un pago que te hace (kind = "pago" resta) */
export async function saveTenantEntry(form: FormData) {
  const { supabase } = await getUser();
  const amount = Math.abs(numOrNull(form.get("amount")) ?? 0);
  if (!amount) return;
  const pago = form.get("kind") === "pago";
  await check(supabase.from("tenant_entries").insert({
    date: str(form, "date") ?? new Date().toISOString().slice(0, 10),
    concept: str(form, "concept") ?? (pago ? "Pago del inquilino" : "Gasto"),
    amount: pago ? -amount : amount,
  }));
  done();
}

/** Carga un listado pegado: una línea por gasto, «fecha; concepto; importe» (fecha dd/mm/aaaa) */
export async function importTenantList(form: FormData) {
  const { supabase } = await getUser();
  const rows: { date: string; concept: string; amount: number }[] = [];
  for (const line of String(form.get("list") ?? "").split("\n")) {
    const parts = line.split(/[;\t]/).map((x) => x.trim()).filter(Boolean);
    if (parts.length < 3) continue;
    const dm = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/.exec(parts[0]);
    const iso = /^\d{4}-\d{2}-\d{2}$/.test(parts[0]) ? parts[0]
      : dm ? `${dm[3].length === 2 ? `20${dm[3]}` : dm[3]}-${dm[2].padStart(2, "0")}-${dm[1].padStart(2, "0")}` : null;
    const amount = Number(parts[parts.length - 1].replace(/[€\s]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
    if (!iso || !Number.isFinite(amount) || !amount) continue;
    rows.push({ date: iso, concept: parts.slice(1, -1).join(" · "), amount });
  }
  if (rows.length) await check(supabase.from("tenant_entries").insert(rows));
  done();
}

export async function deleteTenantEntry(form: FormData) {
  const { supabase } = await getUser();
  const id = String(form.get("id"));
  await check(supabase.from("tenant_entries").delete().eq("id", id));
  done();
}
