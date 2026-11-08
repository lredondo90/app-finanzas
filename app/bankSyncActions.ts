"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { type ImportRule, suggest } from "@/lib/bankSuggest";
import { getUser } from "@/lib/data";
import { firstSyncDate } from "@/lib/accounting";
import { RATE_LIMIT, type StoredAccount, deleteSession, enableBankingConfigured, fetchBalance, fetchTransactions, isAccountKind, startAuth } from "@/lib/enableBanking";
import { jointAccounts, matchContribution } from "@/lib/house";
import { refreshFundPrices, saveNetWorthSnapshot } from "@/lib/wealth";
import { type ConfirmRow, confirmBankImport } from "./importActions";

const STATE_COOKIE = "eb_state";

async function origin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

/** Conectar un banco: te manda a la web del banco para dar permiso */
export async function connectBank(form: FormData) {
  await getUser();
  if (!enableBankingConfigured()) redirect("/importar?error=config");
  const name = String(form.get("aspsp") ?? "").trim();
  if (!name) redirect("/importar?error=banco");
  const state = randomUUID();
  const jar = await cookies();
  jar.set(STATE_COOKIE, JSON.stringify({ state, name }), { httpOnly: true, secure: true, sameSite: "lax", maxAge: 900, path: "/" });
  let url: string;
  try {
    ({ url } = await startAuth({ name, country: "ES" }, `${await origin()}/auth/banco`, state));
  } catch (e) {
    redirect(`/importar?error=${encodeURIComponent(e instanceof Error ? e.message : "No se pudo conectar")}`);
  }
  redirect(url);
}

export async function disconnectBank(form: FormData) {
  const { supabase } = await getUser();
  const id = String(form.get("id"));
  const { data } = await supabase.from("bank_connections").select("session_id").eq("id", id).maybeSingle();
  if (data?.session_id && enableBankingConfigured()) await deleteSession(data.session_id);
  await supabase.from("bank_connections").delete().eq("id", id);
  revalidatePath("/importar");
}

/**
 * Descarga los movimientos nuevos de todos los bancos conectados.
 * Lo que ya está aprendido (o es inversión/traspaso) se guarda solo; el resto queda «por revisar».
 */
export async function syncBanks(opts: { onlyIfStaleHours?: number } = {}): Promise<{ synced: number; saved: number; pending: number; errors: string[]; skipped: string[] }> {
  const { supabase } = await getUser();
  const result = { synced: 0, saved: 0, pending: 0, errors: [] as string[], skipped: [] as string[] };
  if (!enableBankingConfigured()) return result;
  const { data: conns } = await supabase.from("bank_connections").select("*");
  if (!conns?.length) return result;

  const now = Date.now();
  const chosen = (c: { accounts: StoredAccount[] }) => c.accounts.filter((a) => a.sync === true);
  // Solo las conexiones en las que ya elegiste cuentas (si no, no se descarga nada)
  // Si hoy ya se llegó al límite del banco, no se vuelve a intentar hasta mañana (cada intento gasta consultas)
  const day = (d: Date | number) => new Date(d).toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" });
  const blockedToday = (c: { last_error: string | null; last_sync_at: string | null }) =>
    c.last_error === RATE_LIMIT && !!c.last_sync_at && day(new Date(c.last_sync_at)) === day(now);
  // Los que hoy ya llegaron al límite del banco no se consultan (se dice cuáles)
  result.skipped = conns.filter((c) => chosen(c).length > 0 && blockedToday(c)).map((c) => c.aspsp_name);
  const due = conns.filter((c) => chosen(c).length > 0 && !blockedToday(c)).filter((c) => !opts.onlyIfStaleHours || !c.last_sync_at || now - new Date(c.last_sync_at).getTime() > opts.onlyIfStaleHours * 3600000);
  if (!due.length) { await refreshWealth(supabase); return result; }

  const [categories, lines, rules, expenses, settingsRes] = await Promise.all([
    supabase.from("categories").select("*").order("sort_order"),
    supabase.from("budget_lines").select("*").order("sort_order"),
    supabase.from("import_rules").select("pattern, action, category_id, line_id"),
    supabase.from("expenses").select("*").order("date", { ascending: false }).limit(3000),
    supabase.from("settings").select("start_date, cutoff_day").maybeSingle(),
  ]);
  // La app empieza en start_date: solo se descarga desde el día siguiente al corte del mes anterior (la nómina de finales de mes)
  const startDate: string | null = settingsRes.data?.start_date ?? null;
  const minFrom = firstSyncDate(startDate, settingsRes.data?.cutoff_day ?? 25);
  const clamp = (d: string) => (minFrom && d < minFrom ? minFrom : d);
  const today = day(now);

  // Cuentas conjuntas (de todas las conexiones): sus movimientos van a Casa y tus transferencias a ellas son tu aportación
  const joint = jointAccounts(conns);
  const jointUids = new Set(joint.map((j) => j.uid));
  // Entradas recientes en cuentas conjuntas ya guardadas, para reconocer tu transferencia aunque llegue en otra sincronización
  const jointIn: { accountUid: string; date: string; amount: number }[] = [];
  if (joint.length) {
    const { data, error } = await supabase.from("bank_movements").select("account_uid, date, amount")
      .in("account_uid", [...jointUids]).gt("amount", 0).gte("date", new Date(now - 75 * 86400000).toISOString().slice(0, 10));
    if (!error) for (const r of data ?? []) jointIn.push({ accountUid: r.account_uid, date: r.date, amount: Number(r.amount) });
  }

  // Primero los bancos con cuentas conjuntas, para que lo que entra en ellas ya se conozca al revisar tus cuentas
  const hasJoint = (c: { accounts: StoredAccount[] }) => c.accounts.some((a) => a.sync === true && a.kind === "conjunta");
  due.sort((a, b) => Number(hasJoint(b)) - Number(hasJoint(a)));

  for (const c of due) {
    try {
      if (c.valid_until && new Date(c.valid_until).getTime() < now) throw new Error("El permiso del banco ha caducado: vuelve a conectarlo.");
      const { data: last } = await supabase.from("bank_movements").select("date").eq("bank", c.aspsp_name).order("date", { ascending: false }).limit(1).maybeSingle();
      const from: string = clamp(last?.date
        ? new Date(new Date(last.date).getTime() - 7 * 86400000).toISOString().slice(0, 10) // 7 días de margen
        : new Date(now - 60 * 86400000).toISOString().slice(0, 10)); // primera vez: 2 meses
      // Una cuenta que se sincroniza por primera vez trae sus 2 últimos meses (nunca antes del inicio de la app)
      const firstFrom = clamp(new Date(now - 60 * 86400000).toISOString().slice(0, 10));
      const perAccount = await Promise.all(chosen(c).map(async (a) => {
        const ms = await fetchTransactions(a.uid, a.synced ? from : firstFrom, c.aspsp_name, a.label || (a.iban ? `···${a.iban.slice(-4)}` : null));
        return ms.map((m) => ({ m, kind: a.kind ?? "gastos", uid: a.uid }));
      }));
      const tagged = perAccount.flat();
      const movements = tagged.map((t) => t.m);
      // Lo que entra en las cuentas conjuntas en esta descarga también sirve para emparejar tus transferencias
      const incoming = jointIn;
      incoming.push(...tagged.filter((t) => t.kind === "conjunta" && t.m.amount > 0).map((t) => ({ accountUid: t.uid, date: t.m.date, amount: t.m.amount })));

      const keysNeeded = movements.filter((m) => m.externalId).map((m) => `${m.bank}|id|${m.externalId}`);
      const existingKeys = new Set<string>();
      for (let i = 0; i < keysNeeded.length; i += 200) {
        const { data } = await supabase.from("bank_movements").select("import_key").in("import_key", keysNeeded.slice(i, i + 200));
        (data ?? []).forEach((r) => existingKeys.add(r.import_key));
      }
      const { data: prevMovs } = await supabase.from("bank_movements").select("bank, date, amount, import_key").eq("bank", c.aspsp_name).gte("date", chosen(c).some((a) => !a.synced) && firstFrom < from ? firstFrom : from);
      const fromFiles = (prevMovs ?? []).filter((p) => !p.import_key.includes("|id|")).map((p) => ({ ...p, amount: Number(p.amount) }));
      const rows = suggest(movements, {
        categories: categories.data ?? [], lines: lines.data ?? [], rules: (rules.data ?? []) as ImportRule[],
        existingKeys, expenses: expenses.data ?? [], existingMovs: fromFiles,
      }).map((r, i) => {
        // Cuentas de ahorro y de gastos anuales: sus movimientos no son gasto ni ingreso del mes
        const kind = tagged[i].kind;
        if (!r.include) return r;
        // Cuenta conjunta: nunca es gasto tuyo; se guarda con su categoría para la pantalla Casa
        if (kind === "conjunta") {
          return { ...r, action: "ignorar" as const, house: true, category_id: r.action === "variable" ? r.category_id : null, line_id: null, learned: false,
            reason: "Cuenta conjunta: cuenta en Casa, no en tus gastos" };
        }
        if (kind === "gastos") {
          // Tu transferencia a una cuenta conjunta: cuenta como el concepto fijo elegido (p. ej. CASA N)
          const j = jointUids.size && !jointUids.has(tagged[i].uid) ? matchContribution(r, joint, incoming) : null;
          if (j?.contributionLineId) {
            return { ...r, action: "fijo" as const, line_id: j.contributionLineId, category_id: null, learned: false,
              reason: `Tu aportación a ${j.label}` };
          }
          return r;
        }
        return { ...r, action: "ignorar" as const, category_id: null, line_id: null, learned: false,
          reason: kind === "ahorro" ? "Cuenta de ahorro: no cuenta como gasto del mes" : "Cuenta de gastos anuales: ya cuenta en Anuales" };
      }).filter((r) => !existingKeys.has(r.key))
        // Desde el día siguiente al corte del mes anterior al inicio: así se pueden revisar la nómina y los préstamos de finales de mes
        .filter((r) => !minFrom || r.date >= minFrom);

      const auto = rows.filter((r) =>
        r.reason === "Ya importado desde un extracto" || // se registra como «no contar» para que no vuelva a salir
        (r.include && (r.learned || r.action === "inversion" || (r.action === "ignorar" && /entre tus cuentas|^Cuenta (de|conjunta)/.test(r.reason)) || r.reason.startsWith("Tu aportación a "))));
      const review = rows.filter((r) => !auto.includes(r));

      if (auto.length) {
        const res = await confirmBankImport(auto.map((r): ConfirmRow => ({ ...r, remember: false })), true);
        if (res.error) throw new Error(res.error);
        result.saved += auto.length;
      }
      // Al volver a descargar el histórico de una cuenta, lo que quedaba por revisar de ese banco sin descripción se sustituye
      if (chosen(c).some((a) => !a.synced)) {
        await supabase.from("bank_pending").delete().eq("row->>bank", c.aspsp_name).eq("row->>description", "Movimiento");
      }
      if (review.length) {
        await supabase.from("bank_pending").upsert(review.map((r) => ({ import_key: r.key, row: r })), { onConflict: "user_id,import_key" });
        result.pending += review.length;
      }
      // Saldo: el que trae el último movimiento si lo trae; si no, una consulta al día (el banco limita las consultas)
      const accounts: StoredAccount[] = [];
      for (const a of c.accounts as StoredAccount[]) {
        if (!a.sync) { accounts.push(a); continue; }
        const next: StoredAccount = { ...a, synced: true };
        const fromTx = latestBalance(tagged.filter((t) => t.uid === a.uid).map((t) => t.m.raw));
        if (fromTx != null) { next.balance = fromTx; next.balance_at = new Date().toISOString(); }
        else if (!a.balance_at || day(new Date(a.balance_at)) !== today) {
          const b = await fetchBalance(a.uid);
          if (b != null) { next.balance = b; next.balance_at = new Date().toISOString(); }
        }
        accounts.push(next);
      }
      await supabase.from("bank_connections").update({ accounts, last_sync_at: new Date().toISOString(), last_error: null }).eq("id", c.id);
      result.synced++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error al sincronizar";
      result.errors.push(`${c.aspsp_name}: ${msg}`);
      await supabase.from("bank_connections").update({ last_error: msg, last_sync_at: new Date().toISOString() }).eq("id", c.id);
    }
  }
  await refreshWealth(supabase);
  revalidatePath("/", "layout");
  return result;
}

/** Precios de los fondos (una vez al día) y foto del patrimonio del mes; nunca impide la sincronización */
async function refreshWealth(supabase: Awaited<ReturnType<typeof getUser>>["supabase"]) {
  try {
    await refreshFundPrices(supabase);
    await saveNetWorthSnapshot(supabase);
  } catch { /* sin precio hoy */ }
}

/** Saldo tras el movimiento más reciente, si el banco lo manda (balance_after_transaction) */
function latestBalance(raws: unknown[]): number | null {
  let best: { date: string; amount: number } | null = null;
  for (const r of raws as { booking_date?: string; value_date?: string; balance_after_transaction?: { amount?: string | number } | null }[]) {
    const amt = r?.balance_after_transaction?.amount;
    const date = r?.booking_date ?? r?.value_date ?? "";
    if (amt == null || !date) continue;
    if (!best || date > best.date) best = { date, amount: Number(amt) };
  }
  return best ? best.amount : null;
}

/** Guarda qué cuentas de una conexión se sincronizan y el nombre que les pones */
export async function saveAccountSelection(form: FormData) {
  const { supabase } = await getUser();
  const id = String(form.get("id"));
  const { data } = await supabase.from("bank_connections").select("accounts").eq("id", id).maybeSingle();
  if (!data) redirect("/importar");
  const accounts = (data.accounts as StoredAccount[]).map((a) => ({
    ...a,
    sync: form.get(`sync:${a.uid}`) === "on",
    label: String(form.get(`label:${a.uid}`) ?? "").trim() || null,
    kind: isAccountKind(String(form.get(`kind:${a.uid}`))) ? (String(form.get(`kind:${a.uid}`)) as StoredAccount["kind"]) : "gastos",
  })).map((a) => {
    // Solo las conjuntas llevan concepto de aportación y presupuesto de casa
    const budget = Number(String(form.get(`budget:${a.uid}`) ?? "").replace(",", "."));
    return a.kind === "conjunta"
      ? { ...a, contribution_line_id: String(form.get(`line:${a.uid}`) ?? "") || null, house_budget: budget > 0 ? Math.round(budget * 100) / 100 : null }
      : { ...a, contribution_line_id: null, house_budget: null };
  });
  await supabase.from("bank_connections").update({ accounts }).eq("id", id);
  revalidatePath("/", "layout");
  redirect(`/importar?cuentas_ok=${accounts.filter((a) => a.sync).length}`);
}

export async function syncNow() {
  const r = await syncBanks();
  const q = new URLSearchParams({ sync: `${r.saved}|${r.pending}`, ...(r.errors.length ? { error: r.errors.join(" · ") } : {}) });
  redirect(`/importar?${q}`);
}
