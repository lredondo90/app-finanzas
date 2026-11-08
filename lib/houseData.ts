// Datos de Casa que se leen en el servidor (pantalla Casa y resumen en Inicio)
import type { StoredAccount } from "./enableBanking";
import { type HouseMovement, type JointAccount, internalTransfers, jointAccounts } from "./house";
import type { createClient } from "./supabase/server";

type Supa = Awaited<ReturnType<typeof createClient>>;

const pad = (n: number) => String(n).padStart(2, "0");
const shiftDays = (date: string, days: number) => new Date(new Date(`${date}T00:00:00Z`).getTime() + days * 86400000).toISOString().slice(0, 10);

export interface HouseMonth {
  joint: JointAccount[];
  from: string;
  to: string;
  /** Movimientos del mes en las cuentas conjuntas (más 3 días a cada lado para emparejar traspasos) */
  movs: HouseMovement[];
  internal: Set<string>;
  missingColumn: boolean;
  /** Presupuesto de casa por cuenta: lo gastado en el mes frente a lo previsto */
  budgets: { account: JointAccount; budget: number; spent: number }[];
}

export async function loadHouseMonth(supabase: Supa, year: number, month: number): Promise<HouseMonth> {
  const { data: conns } = await supabase.from("bank_connections").select("aspsp_name, accounts").order("created_at");
  const joint = jointAccounts((conns ?? []) as { aspsp_name: string; accounts: StoredAccount[] }[]);
  const from = `${year}-${pad(month)}-01`;
  const to = month === 12 ? `${year + 1}-01-01` : `${year}-${pad(month + 1)}-01`;
  let movs: HouseMovement[] = [];
  let missingColumn = false;
  if (joint.length) {
    const { data, error } = await supabase.from("bank_movements")
      .select("id, account_uid, date, description, detail, amount, category_id")
      .in("account_uid", joint.map((j) => j.uid)).gte("date", shiftDays(from, -3)).lt("date", shiftDays(to, 3))
      .order("date", { ascending: false });
    if (error) missingColumn = /account_uid/.test(error.message);
    movs = (data ?? []).map((m) => ({ ...m, amount: Number(m.amount) }));
  }
  const internal = internalTransfers(movs);
  const spentIn = (uid: string) => -movs
    .filter((m) => m.account_uid === uid && m.amount < 0 && m.date >= from && m.date < to && !internal.has(m.id))
    .reduce((s, m) => s + m.amount, 0);
  const budgets = joint.filter((j) => j.budget).map((j) => ({ account: j, budget: j.budget!, spent: spentIn(j.uid) }));
  return { joint, from, to, movs, internal, missingColumn, budgets };
}
