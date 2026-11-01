import HBars from "@/components/HBars";
import HistoryChart from "@/components/HistoryChart";
import Stat from "@/components/Stat";
import { addSnapshot, deleteBank, deleteSnapshot, saveBank } from "@/app/actions";
import { fmt, fmt0, fmtPct, netWorth } from "@/lib/finance";
import { loadYear } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function PatrimonioPage() {
  const d = await loadYear();
  const nw = netWorth(d);
  const share = (v: number) => (nw.total === 0 ? null : v / nw.total);
  const history = d.history.map((h) => ({ ...h, total: Number(h.cash) + Number(h.investments) }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Patrimonio</h1>
        <p className="text-sm text-ink2">Efectivo por banco + fondos de ahorro + cartera de operaciones puntuales.</p>
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Patrimonio total" value={fmt0(nw.total)} />
        <Stat label="Saldo en cuentas" value={fmt0(nw.cash)} sub={fmtPct(share(nw.cash))} />
        <Stat label="Fondos de ahorro" value={fmt0(nw.fondos)} sub={fmtPct(share(nw.fondos))} />
        <Stat label="Reserva de efectivo" value={nw.mesesReserva == null ? "—" : `${nw.mesesReserva.toLocaleString("es-ES", { maximumFractionDigits: 1 })} meses`}
          sub={`Gasto fijo medio ${fmt0(nw.gastoMedio)}/mes`} />
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <div className="card">
          <div className="label mb-3">Saldo por banco</div>
          <HBars format={fmt} rows={d.banks.map((b) => ({ label: b.name, value: Number(b.balance), hint: fmtPct(nw.cash ? Number(b.balance) / nw.cash : null) }))} />
          <details className="mt-4">
            <summary className="cursor-pointer text-sm text-accent">Editar cuentas</summary>
            <div className="mt-3 space-y-2">
              {d.banks.map((b) => (
                <div key={b.id} className="flex gap-2">
                  <form action={saveBank} className="flex flex-1 gap-2">
                    <input type="hidden" name="id" value={b.id} />
                    <input className="input" name="name" defaultValue={b.name} aria-label="Banco" />
                    <input className="input tnum w-32" name="balance" inputMode="decimal" defaultValue={b.balance} aria-label="Saldo" />
                    <button className="btn-ghost">Guardar</button>
                  </form>
                  <form action={deleteBank}><input type="hidden" name="id" value={b.id} /><button className="px-2 py-2 text-muted hover:text-bad" aria-label={`Eliminar ${b.name}`}>×</button></form>
                </div>
              ))}
              <form action={saveBank} className="flex gap-2 border-t border-line pt-2">
                <input className="input" name="name" placeholder="Nueva cuenta" required />
                <input className="input tnum w-32" name="balance" inputMode="decimal" placeholder="Saldo €" />
                <button className="btn">Añadir</button>
              </form>
            </div>
          </details>
        </div>

        <div className="card">
          <div className="label mb-3">Evolución del patrimonio</div>
          {history.length >= 2 ? (
            <HistoryChart data={history.map((h) => ({ fecha: h.date.split("-").reverse().join("/"), total: h.total }))} />
          ) : (
            <p className="py-4 text-sm text-muted">Guarda una foto al mes para ver la evolución (necesitas al menos 2).</p>
          )}
          <form action={addSnapshot} className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <input className="input" type="date" name="date" defaultValue={new Date().toISOString().slice(0, 10)} aria-label="Fecha" />
            <input className="input tnum" name="cash" inputMode="decimal" defaultValue={nw.cash.toFixed(2)} aria-label="Saldo en cuentas" />
            <input className="input tnum" name="investments" inputMode="decimal" defaultValue={(nw.fondos + nw.cartera).toFixed(2)} aria-label="Fondos y cartera" />
            <button className="btn">Guardar foto</button>
          </form>
          {history.length > 0 && (
            <table className="data mt-3">
              <thead><tr><th>Fecha</th><th className="text-right">Cuentas</th><th className="text-right">Fondos y cartera</th><th className="text-right">Total</th><th></th></tr></thead>
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
          )}
        </div>
      </section>
    </div>
  );
}
