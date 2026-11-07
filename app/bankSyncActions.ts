"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { type ImportRule, suggest } from "@/lib/bankSuggest";
import { getUser } from "@/lib/data";
import { type AccountKind, RATE_LIMIT, type StoredAccount, deleteSession, enableBankingConfigured, fetchTransactions, startAuth } from "@/lib/enableBanking";
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
export async function syncBanks(opts: { onlyIfStaleHours?: number } = {}): Promise<{ synced: number; saved: number; pending: number; errors: string[] }> {
  const { supabase } = await getUser();
  const result = { synced: 0, saved: 0, pending: 0, errors: [] as string[] };
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
  const due = conns.filter((c) => chosen(c).length > 0 && !blockedToday(c)).filter((c) => !opts.onlyIfStaleHours || !c.last_sync_at || now - new Date(c.last_sync_at).getTime() > opts.onlyIfStaleHours * 3600000);
  if (!due.length) return result;

  const [categories, lines, rules, expenses] = await Promise.all([
    supabase.from("categories").select("*").order("sort_order"),
    supabase.from("budget_lines").select("*").order("sort_order"),
    supabase.from("import_rules").select("pattern, action, category_id, line_id"),
    supabase.from("expenses").select("*").order("date", { ascending: false }).limit(3000),
  ]);

  for (const c of due) {
    try {
      if (c.valid_until && new Date(c.valid_until).getTime() < now) throw new Error("El permiso del banco ha caducado: vuelve a conectarlo.");
      const { data: last } = await supabase.from("bank_movements").select("date").eq("bank", c.aspsp_name).order("date", { ascending: false }).limit(1).maybeSingle();
      const from: string = last?.date
        ? new Date(new Date(last.date).getTime() - 7 * 86400000).toISOString().slice(0, 10) // 7 días de margen
        : new Date(now - 60 * 86400000).toISOString().slice(0, 10); // primera vez: 2 meses
      // Una cuenta que se sincroniza por primera vez trae sus 2 últimos meses
      const firstFrom = new Date(now - 60 * 86400000).toISOString().slice(0, 10);
      const perAccount = await Promise.all(chosen(c).map(async (a) => {
        const ms = await fetchTransactions(a.uid, a.synced ? from : firstFrom, c.aspsp_name);
        return ms.map((m) => ({ m, kind: a.kind ?? "gastos" }));
      }));
      const tagged = perAccount.flat();
      const movements = tagged.map((t) => t.m);

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
        if (kind === "gastos" || !r.include) return r;
        return { ...r, action: "ignorar" as const, category_id: null, line_id: null, learned: false,
          reason: kind === "ahorro" ? "Cuenta de ahorro: no cuenta como gasto del mes" : "Cuenta de gastos anuales: ya cuenta en Anuales" };
      }).filter((r) => !existingKeys.has(r.key));

      const auto = rows.filter((r) =>
        r.reason === "Ya importado desde un extracto" || // se registra como «no contar» para que no vuelva a salir
        (r.include && (r.learned || r.action === "inversion" || (r.action === "ignorar" && /entre tus cuentas|^Cuenta de /.test(r.reason)))));
      const review = rows.filter((r) => !auto.includes(r));

      if (auto.length) {
        const res = await confirmBankImport(auto.map((r): ConfirmRow => ({ ...r, remember: false })), true);
        if (res.error) throw new Error(res.error);
        result.saved += auto.length;
      }
      if (review.length) {
        await supabase.from("bank_pending").upsert(review.map((r) => ({ import_key: r.key, row: r })), { onConflict: "user_id,import_key", ignoreDuplicates: true });
        result.pending += review.length;
      }
      const accounts = (c.accounts as StoredAccount[]).map((a) => (a.sync ? { ...a, synced: true } : a));
      await supabase.from("bank_connections").update({ accounts, last_sync_at: new Date().toISOString(), last_error: null }).eq("id", c.id);
      result.synced++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error al sincronizar";
      result.errors.push(`${c.aspsp_name}: ${msg}`);
      await supabase.from("bank_connections").update({ last_error: msg, last_sync_at: new Date().toISOString() }).eq("id", c.id);
    }
  }
  revalidatePath("/", "layout");
  return result;
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
    kind: (["gastos", "ahorro", "anuales"].includes(String(form.get(`kind:${a.uid}`))) ? String(form.get(`kind:${a.uid}`)) : "gastos") as AccountKind,
  }));
  await supabase.from("bank_connections").update({ accounts }).eq("id", id);
  revalidatePath("/", "layout");
  redirect(`/importar?cuentas_ok=${accounts.filter((a) => a.sync).length}`);
}

export async function syncNow() {
  const r = await syncBanks();
  const q = new URLSearchParams({ sync: `${r.saved}|${r.pending}`, ...(r.errors.length ? { error: r.errors.join(" · ") } : {}) });
  redirect(`/importar?${q}`);
}
