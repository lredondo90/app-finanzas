import { connectBank, disconnectBank, syncNow } from "@/app/bankSyncActions";
import { enableBankingConfigured, listAspsps } from "@/lib/enableBanking";

interface Conn {
  id: string; aspsp_name: string; accounts: { iban: string | null; name: string | null }[];
  valid_until: string | null; last_sync_at: string | null; last_error: string | null;
}

const fmtWhen = (iso: string) =>
  new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export default async function BankConnections({ connections }: { connections: Conn[] }) {
  const configured = enableBankingConfigured();
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
          <form action={syncNow}><button className="btn-ghost py-1.5">↻ Sincronizar ahora</button></form>
        )}
      </div>
      <p className="mb-3 text-sm text-ink2">
        Con el banco conectado, los movimientos se descargan solos cada vez que abres la app. Lo que ya he aprendido se guarda directamente
        y lo nuevo te lo dejo aquí para revisar.
      </p>

      {connections.length > 0 && (
        <ul className="mb-4 divide-y divide-line">
          {connections.map((c) => {
            const daysLeft = c.valid_until ? Math.ceil((new Date(c.valid_until).getTime() - Date.now()) / 86400000) : null;
            return (
              <li key={c.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{c.aspsp_name}</div>
                  <div className="text-xs text-muted">
                    {c.accounts.map((a) => a.iban ? `···${a.iban.slice(-4)}` : a.name).filter(Boolean).join(", ") || "Cuentas autorizadas"}
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
