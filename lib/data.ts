import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import type { YearData } from "./types";

export async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

/** Carga todo lo necesario para un año (el volumen de un presupuesto personal es pequeño). */
export async function loadYear(yearParam?: number): Promise<YearData> {
  const { supabase } = await getUser();

  const { data: settings } = await supabase.from("settings").select("*").maybeSingle();
  const year = yearParam ?? settings?.year ?? new Date().getFullYear();
  const from = `${year}-01-01`;
  const to = `${year + 1}-01-01`;

  const [lines, values, months, categories, paymentMethods, expenses, annuals, plans, extras, investments, prices, banks, history, oneOffIncomes, bankMovs, recentExpenses] =
    await Promise.all([
      supabase.from("budget_lines").select("*").order("sort_order"),
      supabase.from("budget_values").select("*").eq("year", year),
      supabase.from("months").select("*").eq("year", year),
      supabase.from("categories").select("*").order("sort_order"),
      supabase.from("payment_methods").select("*").order("sort_order"),
      supabase.from("expenses").select("*").gte("date", from).lt("date", to).order("date", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("annual_expenses").select("*").order("sort_order"),
      supabase.from("savings_plans").select("*").order("sort_order"),
      supabase.from("savings_extras").select("*").eq("year", year),
      supabase.from("investments").select("*").order("date", { ascending: false }),
      supabase.from("asset_prices").select("*"),
      supabase.from("bank_accounts").select("*").order("sort_order"),
      supabase.from("net_worth_history").select("*").order("date"),
      supabase.from("one_off_incomes").select("*").gte("date", from).lt("date", to).order("date"),
      supabase.from("bank_movements").select("bank, date, created_at").order("created_at", { ascending: false }).limit(500),
      supabase.from("expenses").select("created_at, notes").order("created_at", { ascending: false }).limit(50),
    ]);

  // Última carga por banco (fecha de la importación y último movimiento incluido) y último gasto apuntado a mano
  const loads: YearData["loads"] = [];
  for (const m of bankMovs.data ?? []) {
    const l = loads.find((x) => x.source === m.bank);
    if (!l) loads.push({ source: m.bank, loadedAt: m.created_at, lastMovement: m.date });
    else if (m.date > (l.lastMovement ?? "")) l.lastMovement = m.date;
  }
  const manual = (recentExpenses.data ?? []).find((e) => !String(e.notes ?? "").startsWith("Importado de"));
  if (manual) loads.push({ source: "A mano", loadedAt: manual.created_at, lastMovement: null });

  return {
    year,
    settings: settings ?? null,
    lines: lines.data ?? [],
    values: values.data ?? [],
    months: months.data ?? [],
    categories: categories.data ?? [],
    paymentMethods: paymentMethods.data ?? [],
    expenses: expenses.data ?? [],
    annuals: annuals.data ?? [],
    plans: plans.data ?? [],
    extras: extras.data ?? [],
    investments: investments.data ?? [],
    prices: prices.data ?? [],
    banks: banks.data ?? [],
    history: history.data ?? [],
    oneOffIncomes: oneOffIncomes.data ?? [],
    loads,
  };
}
