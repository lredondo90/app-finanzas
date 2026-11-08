import HistoryChart from "@/components/HistoryChart";
import Hero from "@/components/Hero";
import { addSnapshot, deleteBank, deleteHolding, deleteSnapshot, saveBank, saveHolding, setBankCounted } from "@/app/actions";
import { fmt, fmt0, fmtPct, netWorth } from "@/lib/finance";
import { loadYear } from "@/lib/data";

export const dynamic = "force-dynamic";

const fmtUnits = (v: number) => v.toLocaleString("es-ES", { maximumFractionDigits: 4 });
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short" }) : null);
const KIND: Record<string, string> = { gastos: "Día a día", ahorro: "Ahorro", anuales: "Gastos anuales", conjunta: "Conjunta (casa)" };

export default async function PatrimonioPage() {
  const d = await loadYear();
  const nw = netWorth(d);
  const share = (v: number) => (nw.total === 0 ? 0 : v / nw.total);
  const history = d.history.map((h) => ({ ...h, total: Number(h.cash) + Number(h.investments) }));
  const prev = history.length >= 2 ? history[history.length - 2].total : null;
  const funds = nw.funds;
  const banks = Array.from(new Set(d.syncedAccounts.map((a) => a.bank)));

  return (
    <div className="space-y-4">
      <Hero kicker="Patrimonio" value={fmt0(nw.total)}
        sub={prev != null ? <>{nw.total >= prev ? "▲" : "▼"} {fmt0(Math.abs(nw.total - prev))} desde el mes pasado</> : "Se actualiza solo con los saldos del banco y el precio de los fondos"}>
        <div className="h-2 overflow-hidden rounded-full bg-white/15" aria-hidden>
          <div className="h-2 bg-[rgb(var(--accent2))]" style={{ width: `${share(nw.cash) * 100}%` }} />
        </div>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <span><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[rgb(var(--accent2))]" />Cuentas <b className="tnum">{fmt0(nw.cash)}</b></span>
          <span><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-white/40" />Fondos <b className="tnum">{fmt0(nw.fondos + nw.cartera)}</b></span>
          {nw.mesesReserva != null && <span className="text-white/70">Reserva: {nw.mesesReserva.toLocaleString("es-ES", { maximumFractionDigits: 1 })} meses de gastos fijos</span>}
        </div>
      </Hero>

      <section className="grid gap-4 lg:grid-cols-2">
        {/* Cuentas */}
        <div className="card">
          <h2 className="section-title mb-1">Cuentas</h2>
          {banks.map((bank) => (
            <div key={bank} className="mt-3">
              <div className="label mb-1">{bank}</div>
              <ul className="divide-y divide-line/70">
                {d.syncedAccounts.filter((a) => a.bank === bank).map((a) => (
                  <li key={a.uid} className="flex items-center gap-3 py-2.5">
                    <span className="icon-tile bg-accent/10 text-sm font-bold text-accent">{bank.slice(0, 2).toUpperCase()}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{a.label}</div>
                      <div className="truncate text-xs text-muted">{KIND[a.kind] ?? a.kind}{a.iban ? ` · ···${a.iban.slice(-4)}` : ""}{a.balanceAt ? ` · ${fmtDate(a.balanceAt)}` : ""}</div>
                    </div>
                    <span className="tnum font-semibold">{a.balance == null ? <span className="text-xs font-normal text-muted">en la próxima sincronización</span> : fmt(a.balance)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {!banks.length && <p className="mt-2 text-sm text-muted">Conecta tus bancos en Más › Bancos y sus saldos aparecerán aquí.</p>}

          <details className="mt-4 border-t border-line pt-3" open={d.banks.some((b) => b.counted !== false)}>
            <summary className="cursor-pointer text-sm text-accent">Cuentas a mano ({d.banks.length})</summary>
            <p className="mt-2 text-xs text-muted">Solo para cuentas que no estén conectadas. Desactiva las que ya llegan del banco para no contarlas dos veces.</p>
            <ul className="mt-2 space-y-2">
              {d.banks.map((b) => (
                <li key={b.id} className={`flex items-center gap-2 ${b.counted === false ? "opacity-50" : ""}`}>
                  <form action={setBankCounted}>
                    <input type="hidden" name="id" value={b.id} /><input type="hidden" name="counted" value={b.counted === false ? "1" : "0"} />
                    <button className={`h-5 w-9 rounded-full p-0.5 ${b.counted === false ? "bg-line" : "bg-accent"}`} aria-label={b.counted === false ? `Contar ${b.name}` : `No contar ${b.name}`}>
                      <span className={`block h-4 w-4 rounded-full bg-white transition ${b.counted === false ? "" : "translate-x-4"}`} />
                    </button>
                  </form>
                  <form action={saveBank} className="flex flex-1 gap-2">
                    <input type="hidden" name="id" value={b.id} />
                    <input className="input py-1.5" name="name" defaultValue={b.name} aria-label="Cuenta" />
                    <input className="input tnum w-28 py-1.5" name="balance" inputMode="decimal" defaultValue={b.balance} aria-label="Saldo" />
                    <button className="btn-ghost px-3 py-1">✓</button>
                  </form>
                  <form action={deleteBank}><input type="hidden" name="id" value={b.id} /><button className="px-1 text-muted hover:text-bad" aria-label={`Eliminar ${b.name}`}>×</button></form>
                </li>
              ))}
            </ul>
            <form action={saveBank} className="mt-2 flex gap-2">
              <input className="input py-1.5" name="name" placeholder="Nueva cuenta" required />
              <input className="input tnum w-28 py-1.5" name="balance" inputMode="decimal" placeholder="Saldo €" />
              <button className="btn-ghost px-3 py-1">Añadir</button>
            </form>
          </details>
        </div>

        {/* Fondos */}
        <div id="fondos" className="card">
          <div className="flex items-baseline justify-between">
            <h2 className="section-title">Fondos y ETF</h2>
            <span className="tnum font-semibold">{fmt(funds.total)}</span>
          </div>
          {funds.gain != null && funds.cost > 0 && (
            <p className={`text-sm ${funds.gain >= 0 ? "text-good" : "text-bad"}`}>{funds.gain >= 0 ? "▲" : "▼"} {fmt(Math.abs(funds.gain))} ({fmtPct(funds.gainPct)}) sobre {fmt0(funds.cost)} aportados</p>
          )}
          <ul className="mt-3 divide-y divide-line/70">
            {funds.rows.map((f) => (
              <li key={f.isin} className="py-2.5">
                <details>
                  <summary className="flex cursor-pointer list-none items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{f.name}</div>
                      <div className="truncate text-xs text-muted">
                        {f.units ? `${fmtUnits(f.units)} part.` : "—"}{f.price != null ? ` · ${fmt(f.price)}${f.priceManual ? " (a mano)" : ""}` : " · sin precio aún"}{f.trades ? ` · ${f.trades} compras nuevas` : ""}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="tnum font-semibold">{f.value == null ? "—" : fmt(f.value)}</div>
                      {f.gain != null && <div className={`tnum text-xs ${f.gain >= 0 ? "text-good" : "text-bad"}`}>{f.gain >= 0 ? "+" : ""}{fmt(f.gain)}</div>}
                    </div>
                  </summary>
                  <HoldingForm h={d.holdings.find((h) => h.isin === f.isin)} isin={f.isin} name={f.name} />
                </details>
              </li>
            ))}
          </ul>
          {!funds.rows.length && <p className="mt-2 text-sm text-muted">Aún no hay fondos. Las compras de Trade Republic aparecerán solas; añade abajo lo que ya tenías.</p>}
          <details className="mt-3 border-t border-line pt-3">
            <summary className="cursor-pointer text-sm text-accent">+ Añadir un fondo</summary>
            <HoldingForm />
          </details>
          <p className="mt-3 text-xs text-muted">Las compras del plan de Trade Republic suman participaciones solas. El precio se actualiza una vez al día; si un fondo no cotiza en bolsa (BBVA), escribe su valor liquidativo.</p>
        </div>
      </section>

      <div className="card">
        <h2 className="section-title mb-2">Evolución</h2>
        {history.length >= 2
          ? <HistoryChart data={history.map((h) => ({ fecha: h.date.split("-").reverse().join("/"), total: h.total }))} />
          : <p className="py-2 text-sm text-muted">Cada mes se guarda solo el patrimonio de fin de mes. Con dos meses verás la gráfica.</p>}
        <details className="mt-3">
          <summary className="cursor-pointer text-sm text-accent">Historial ({history.length})</summary>
          <table className="data mt-2">
            <thead><tr><th>Fecha</th><th className="text-right">Cuentas</th><th className="text-right">Fondos</th><th className="text-right">Total</th><th></th></tr></thead>
            <tbody>
              {[...history].reverse().map((h) => (
                <tr key={h.id}>
                  <td className="tnum">{h.date.split("-").reverse().join("/")}</td>
                  <td className="tnum text-right">{fmt0(h.cash)}</td>
                  <td className="tnum text-right">{fmt0(h.investments)}</td>
                  <td className="tnum text-right font-medium">{fmt0(h.total)}</td>
                  <td><form action={deleteSnapshot}><input type="hidden" name="id" value={h.id} /><button className="text-muted hover:text-bad" aria-label="Eliminar">×</button></form></td>
                </tr>
              ))}
            </tbody>
          </table>
          <form action={addSnapshot} className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <input className="input" type="date" name="date" defaultValue={new Date().toISOString().slice(0, 10)} aria-label="Fecha" />
            <input className="input tnum" name="cash" inputMode="decimal" defaultValue={nw.cash.toFixed(2)} aria-label="Saldo en cuentas" />
            <input className="input tnum" name="investments" inputMode="decimal" defaultValue={(nw.fondos + nw.cartera).toFixed(2)} aria-label="Fondos" />
            <button className="btn">Guardar foto</button>
          </form>
        </details>
      </div>
    </div>
  );
}

function HoldingForm({ h, isin, name }: { h?: import("@/lib/types").FundHolding; isin?: string; name?: string }) {
  return (
    <div className="mt-3 rounded-2xl bg-page p-3">
      <form action={saveHolding} className="grid grid-cols-2 gap-2 text-sm">
        <label className="col-span-2">Nombre<input className="input mt-1" name="name" defaultValue={h?.name ?? name ?? ""} required /></label>
        <label>ISIN o código<input className="input mt-1 uppercase" name="isin" defaultValue={h?.isin ?? isin ?? ""} required readOnly={!!(h || isin)} /></label>
        <label>Fecha de partida<input className="input mt-1" type="date" name="initial_date" defaultValue={h?.initial_date ?? ""} /></label>
        <label>Participaciones de partida<input className="input tnum mt-1" name="initial_units" inputMode="decimal" defaultValue={h?.initial_units || ""} /></label>
        <label>o valor ese día (€)<input className="input tnum mt-1" name="initial_value" inputMode="decimal" defaultValue={h?.initial_value ?? ""} /></label>
        <label>Aportado hasta entonces (€)<input className="input tnum mt-1" name="initial_cost" inputMode="decimal" defaultValue={h?.initial_cost ?? ""} /></label>
        <label>Precio a mano (€)<input className="input tnum mt-1" name="price" inputMode="decimal" defaultValue={h?.price_manual ? h.price ?? "" : ""} placeholder="automático" /></label>
        <label className="col-span-2">Texto de sus aportaciones en el banco (si no traen ISIN)<input className="input mt-1" name="match_text" defaultValue={h?.match_text ?? ""} placeholder="p. ej. QUALITY MEJORES IDEA" /></label>
        <button className="btn col-span-2">Guardar</button>
      </form>
      {h && <form action={deleteHolding} className="mt-2 text-right"><input type="hidden" name="isin" value={h.isin} /><button className="text-xs text-bad">Quitar fondo</button></form>}
    </div>
  );
}
