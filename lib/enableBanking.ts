// Cliente mínimo de la API de Enable Banking (PSD2). Solo se usa en el servidor.
import { createSign } from "crypto";
import type { Movement } from "./bankParse";

const API = "https://api.enablebanking.com";

export function enableBankingConfigured() {
  return !!process.env.ENABLE_BANKING_APP_ID && !!process.env.ENABLE_BANKING_PRIVATE_KEY;
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

/** JWT RS256 firmado con la clave privada de la aplicación (kid = id de la aplicación) */
function token() {
  const appId = process.env.ENABLE_BANKING_APP_ID!;
  // La clave se puede pegar en Vercel con saltos de línea reales o como \n
  const key = process.env.ENABLE_BANKING_PRIVATE_KEY!.replace(/\\n/g, "\n");
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ typ: "JWT", alg: "RS256", kid: appId }));
  const payload = b64url(JSON.stringify({ iss: "enablebanking.com", aud: "api.enablebanking.com", iat: now, exp: now + 3600 }));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  return `${header}.${payload}.${b64url(signer.sign(key))}`;
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text;
    try {
      const j = JSON.parse(text);
      msg = j.message ?? j.detail ?? j.error ?? text;
    } catch {}
    throw new Error(`Enable Banking ${res.status}: ${String(msg).slice(0, 300)}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

export interface Aspsp { name: string; country: string; logo?: string; psu_types?: string[] }

export async function listAspsps(country = "ES") {
  const r = await call<{ aspsps: Aspsp[] }>("GET", `/aspsps?country=${country}&psu_type=personal`);
  return r.aspsps ?? [];
}

/** Paso 1 del permiso: devuelve la URL del banco a la que hay que ir */
export async function startAuth(aspsp: { name: string; country: string }, redirectUrl: string, state: string) {
  const ask = (seconds: number) => call<{ url: string; authorization_id: string }>("POST", "/auth", {
    access: { valid_until: new Date(Date.now() + seconds * 1000).toISOString() },
    aspsp,
    state,
    redirect_url: redirectUrl,
    psu_type: "personal",
  });
  try {
    return await ask(180 * 86400); // se pide el máximo habitual (180 días)
  } catch (e) {
    // Algunos bancos (p. ej. Trade Republic) solo aceptan menos: el error dice el máximo en segundos
    const max = /consent validity more than (\d+) seconds/i.exec(e instanceof Error ? e.message : "");
    if (!max) throw e;
    return ask(Number(max[1]) - 3600);
  }
}

export interface EbAccount {
  uid: string;
  account_id?: { iban?: string };
  name?: string;
  details?: string;
  product?: string;
  currency?: string;
}

/** Cuenta guardada en bank_connections.accounts. sync sin definir = aún no elegida */
export interface StoredAccount {
  uid: string;
  iban: string | null;
  name: string | null;
  product?: string | null;
  currency: string | null;
  sync?: boolean;
  label?: string | null;
  synced?: boolean; // ya se descargó su histórico inicial
}

/** Saldo actual de una cuenta (para reconocerla al elegir cuáles sincronizar) */
export async function fetchBalance(accountUid: string): Promise<number | null> {
  try {
    const r = await call<{ balances?: { balance_amount: { amount: string | number }; balance_type?: string }[] }>("GET", `/accounts/${accountUid}/balances`);
    const bs = r.balances ?? [];
    const b = bs.find((x) => /CLBD|ITBD|ITAV|CLAV|XPCD/.test(x.balance_type ?? "")) ?? bs[0];
    return b ? Number(b.balance_amount.amount) : null;
  } catch {
    return null;
  }
}

/** Paso 2: con el código de vuelta se crea la sesión con las cuentas autorizadas */
export async function createSession(code: string) {
  return call<{ session_id: string; accounts: EbAccount[]; access?: { valid_until?: string }; aspsp?: { name: string; country: string } }>(
    "POST", "/sessions", { code },
  );
}

export async function deleteSession(sessionId: string) {
  try { await call("DELETE", `/sessions/${sessionId}`); } catch { /* ya caducada */ }
}

interface EbTransaction {
  entry_reference?: string | null;
  transaction_id?: string | null;
  transaction_amount: { amount: string | number; currency: string };
  credit_debit_indicator?: "CRDT" | "DBIT";
  status?: string;
  booking_date?: string | null;
  value_date?: string | null;
  transaction_date?: string | null;
  creditor?: { name?: string | null } | null;
  debtor?: { name?: string | null } | null;
  remittance_information?: string[] | null;
  bank_transaction_code?: { description?: string | null } | null;
  note?: string | null;
}

/** Movimientos de una cuenta desde una fecha (sigue la paginación) */
export async function fetchTransactions(accountUid: string, dateFrom: string, bank: string): Promise<(Movement & { externalId: string | null })[]> {
  const out: (Movement & { externalId: string | null })[] = [];
  let key: string | null = null;
  const seen = new Set<string>();
  for (let page = 0; page < 50; page++) {
    const qs = new URLSearchParams({ date_from: dateFrom });
    if (key) qs.set("continuation_key", key);
    const r: { transactions?: EbTransaction[]; continuation_key?: string | null } = await call("GET", `/accounts/${accountUid}/transactions?${qs}`);
    for (const t of r.transactions ?? []) {
      if (t.status && t.status !== "BOOK") continue; // solo movimientos contabilizados
      const date = (t.booking_date ?? t.value_date ?? t.transaction_date ?? "").slice(0, 10);
      const raw = Math.abs(Number(t.transaction_amount?.amount ?? 0));
      if (!date || !raw) continue;
      const amount = t.credit_debit_indicator === "CRDT" ? raw : -raw;
      const counterpart = (amount < 0 ? t.creditor?.name : t.debtor?.name)?.trim();
      const remit = (t.remittance_information ?? []).map((x) => x.trim()).filter(Boolean).join(" · ");
      out.push({
        bank,
        date,
        description: counterpart || remit || t.bank_transaction_code?.description || "Movimiento",
        detail: counterpart && remit ? remit : null,
        type: t.bank_transaction_code?.description ?? null,
        amount: Math.round(amount * 100) / 100,
        externalId: t.entry_reference || t.transaction_id || null,
      });
    }
    key = r.continuation_key ?? null;
    if (!key || seen.has(key)) break;
    seen.add(key);
  }
  return out;
}
