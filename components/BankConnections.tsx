import { connectBank, disconnectBank, saveAccountSelection } from "@/app/bankSyncActions";
import SyncButton from "./SyncButton";
import { ACCOUNT_KINDS, type StoredAccount, enableBankingConfigured, listAspsps } from "@/lib/enableBanking";
import type { BudgetLine } from "@/lib/types";

interface Conn {
  id: string; aspsp_name: string; accounts: StoredAccount[];
  valid_until: string | null; last_sync_at: string | null; last_error: string | null;
}

const fmtWhen = (iso: string) =>
  new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

const eur = (v: number) => v.toLocaleString("es-ES", { style: "currency", currency: "EUR" });
const ibanShort = (iban: string | null) => (iban ? `${iban.slice(0, 4)} ···· ${iban.slice(-4)}` : null);
const accountName = (a: StoredAccount) => {
  const n = a.label || ibanShort(a.iban) || a.name || "Cuenta";
  const kind: Record<string, string> = { ahorro: "ahorro", anuales: "anuales", conjunta: "conjunta" };
  return a.kind && kind[a.kind] ? `${n} (${kind[a.kind]})` : n;
};

export default async function BankConnections({ connections, openId, lines = [] }: { connections: Conn[]; openId?: string; lines?: BudgetLine[] }) {
  const configured = enableBankingConfigured();
  const isOpen = (c: Conn) => c.id === openId || !c.accounts.some((a) => a.sync !== undefined);
  let banks: string[] = [];
  let listError: string | null = null;
  if (configured) {
    try {
      banks = (await listAspsps("ES")).map((a) => a.name).sort((a, b) => a.localeCompare(b));
    } catch (e) {
      listError = e instanceof Error ? e.message : "No se pudo cargar la lista de bancos";
    }
  }

  return (
    <div className="card">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <div className="label">Bancos conectados</div>
        {connections.length > 0 && (
          <SyncButton />
        )}
      </div>
      <p className="mb-3 text-sm text-ink2">
        Con el banco conectado, los movimientos se descargan solos cada vez que abres la app. Lo que ya he aprendido se guarda directamente
        y lo nuevo te lo dejo aquí para revisar.
      </p>

      {connections.length > 0 && (
        <ul className="mb-4 divide-y divide-line">
          {connections.map((c) => {
            const selected = c.accounts.filter((a) => a.sync === true);
            const unchosen = !c.accounts.some((a) => a.sync !== undefined);
            const daysLeft = c.valid_until ? Math.ceil((new Date(c.valid_until).getTime() - Date.now()) / 86400000) : null;
            return (
              <li key={c.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{c.aspsp_name}</div>
                  <div className="text-xs text-muted">
                    {selected.length ? selected.map(accountName).join(", ") : "Ninguna cuenta elegida"}
                    {` · ${selected.length} de ${c.accounts.length} cuentas`}
                    {c.last_sync_at && ` · última sincronización ${fmtWhen(c.last_sync_at)}`}
                  </div>
                  {c.last_error && <div className="text-xs text-bad">⚠ {c.last_error}</div>}
                </div>
                {daysLeft != null && (
                  <span className={`rounded-full px-2 py-0.5 text-xs ${daysLeft <= 10 ? "bg-bad/15 text-bad" : "bg-line/60 text-ink2"}`}>
                    {daysLeft > 0 ? `Permiso: ${daysLeft} días` : "Permiso caducado"}
                  </span>
                )}
                <form action={disconnectBank}><input type="hidden" name="id" value={c.id} /><button className="text-xs text-muted hover:text-bad">Desconectar</button></form>

                <details className="w-full" open={isOpen(c)}>
                  <summary className="cursor-pointer text-xs font-medium text-accent">
                    {unchosen ? "Elige qué cuentas quieres sincronizar" : "Cambiar cuentas a sincronizar"}
                  </summary>
                  <form action={saveAccountSelection} className="mt-2 space-y-2 rounded-lg border border-line p-3">
                    <input type="hidden" name="id" value={c.id} />
                    {unchosen && (
                      <p className="text-xs text-ink2">
                        El banco ha dado acceso a {c.accounts.length} cuentas, incluidas aquellas en las que eres autorizado.
                        Marca solo las tuyas. Hasta que guardes no se descarga ningún movimiento.
                      </p>
                    )}
                    <ul className="divide-y divide-line">
                      {c.accounts.map((a) => {
                        const bal = a.balance;
                        return (
                          <li key={a.uid} className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1 py-2 sm:grid-cols-[auto_1fr_auto_14rem]">
                            <input type="checkbox" name={`sync:${a.uid}`} defaultChecked={a.sync === true} aria-label="Sincronizar"
                              className="h-4 w-4 accent-[rgb(var(--accent))]" />
                            <div className="min-w-0">
                              <div className="tnum truncate font-medium">{ibanShort(a.iban) ?? a.name ?? "Cuenta"}</div>
                              <div className="truncate text-xs text-muted">{[a.product, a.name].filter(Boolean).join(" · ")}</div>
                            </div>
                            <div className="tnum col-start-2 text-xs text-ink2 sm:col-start-auto sm:text-right sm:text-sm">
                              {bal != null ? eur(bal) : ""}
                            </div>
                            <input className="input col-start-2 sm:col-start-auto" name={`label:${a.uid}`} defaultValue={a.label ?? ""}
                              placeholder="Nombre (p. ej. Nómina)" aria-label="Nombre de la cuenta" />
                            <fieldset className="[grid-column:2/-1]">
                              <legend className="mb-1 text-xs text-muted">¿Qué es esta cuenta?</legend>
                              <div className="flex flex-wrap gap-1.5">
                                {ACCOUNT_KINDS.map((k) => (
                                  <label key={k.value} className="cursor-pointer">
                                    <input type="radio" className="peer sr-only" name={`kind:${a.uid}`} value={k.value} defaultChecked={(a.kind ?? "gastos") === k.value} />
                                    <span className="inline-block rounded-full border border-line px-3 py-1.5 text-xs peer-checked:border-accent peer-checked:bg-accent peer-checked:text-white">{k.label}</span>
                                  </label>
                                ))}
                              </div>
                            </fieldset>
                            <div className="joint-only [grid-column:2/-1] gap-2 rounded-lg bg-line/30 p-2 sm:grid-cols-2">
                              <label className="text-xs text-ink2">Tu transferencia a esta cuenta cuenta en tu presupuesto como
                                <select className="input mt-1" name={`line:${a.uid}`} defaultValue={a.contribution_line_id ?? ""}>
                                  <option value="">— No contar mi aportación —</option>
                                  {lines.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                                </select>
                              </label>
                              <label className="text-xs text-ink2">Presupuesto de gastos de casa al mes (opcional)
                                <input className="input tnum mt-1" name={`budget:${a.uid}`} inputMode="decimal" defaultValue={a.house_budget ?? ""} placeholder="p. ej. 600" />
                              </label>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                    <p className="text-xs text-muted">
                      De gastos: cada movimiento se apunta o te lo dejo para revisar. De ahorro y de gastos anuales: sus movimientos se guardan
                      como «no contar», para que ni el dinero que apartas ni los recibos anuales (que ya cuentan en Anuales) salgan como gasto del mes.
                      Conjunta: lo que pasa en ella va a la pantalla Casa y nunca a tus gastos; lo que tú le transfieres cuenta en el concepto que elijas.
                    </p>
                    <button className="btn">Guardar selección</button>
                  </form>
                </details>
              </li>
            );
          })}
        </ul>
      )}

      {!configured ? (
        <p className="rounded-lg bg-warn/15 p-3 text-sm text-ink">
          Falta configurar Enable Banking en Vercel (variables <code>ENABLE_BANKING_APP_ID</code> y <code>ENABLE_BANKING_PRIVATE_KEY</code>).
        </p>
      ) : (
        <form action={connectBank} className="flex flex-wrap gap-2">
          <input className="input max-w-xs" name="aspsp" list="aspsps" placeholder="Banco (p. ej. BBVA)" defaultValue={connections.length ? "" : "BBVA"} required aria-label="Banco" />
          <datalist id="aspsps">{banks.map((b) => <option key={b} value={b} />)}</datalist>
          <button className="btn">Conectar banco</button>
          {listError && <p className="w-full text-xs text-bad">{listError}</p>}
          <p className="w-full text-xs text-muted">Te llevará a la web de tu banco para dar permiso de solo lectura. El permiso dura unos meses; cuando caduque, vuelve a conectarlo aquí.</p>
        </form>
      )}
    </div>
  );
}
