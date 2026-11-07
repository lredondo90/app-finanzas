import Hero from "@/components/Hero";
import CellInput from "@/components/CellInput";
import Stat from "@/components/Stat";
import { deleteInvestment, deletePlan, saveInvestment, savePlan, setAssetPrice, setPlanExtra } from "@/app/actions";
import { MONTHS, MONTHS_SHORT, fmt, fmt0, fmtPct, investmentNet, planMonth, plansSummary, portfolio } from "@/lib/finance";
import { loadYear } from "@/lib/data";
import type { SavingsPlan } from "@/lib/types";

export const dynamic = "force-dynamic";

function MonthSel({ name, value, empty }: { name: string; value: number | null; empty: string }) {
  return (
    <select className="input" name={name} defaultValue={value ?? ""} aria-label={empty}>
      <option value="">{empty}</option>
      {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
    </select>
  );
}

function PlanForm({ p }: { p?: SavingsPlan }) {
  return (
    <form action={savePlan} className="grid grid-cols-2 gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_auto]">
      {p && <input type="hidden" name="id" value={p.id} />}
      <input className="input col-span-2 sm:col-span-1" name="name" defaultValue={p?.name} placeholder="Nombre del fondo" required aria-label="Fondo" />
      <input className="input tnum" name="monthly_amount" inputMode="decimal" defaultValue={p?.monthly_amount ?? ""} placeholder="€/mes" aria-label="Aportación mensual" />
      <MonthSel name="from_month" value={p?.from_month ?? null} empty="Desde: enero" />
      <MonthSel name="to_month" value={p?.to_month ?? null} empty="Hasta: diciembre" />
      <input className="input tnum" name="current_value" inputMode="decimal" defaultValue={p?.current_value ?? ""} placeholder="Valor actual €" aria-label="Valor actual" />
      <input className="input tnum" name="return_pct" inputMode="decimal" defaultValue={p?.return_pct != null ? Math.round(p.return_pct * 10000) / 100 : ""} placeholder="Rentab. %" aria-label="Rentabilidad %" />
      <button className={p ? "btn-ghost" : "btn"}>{p ? "Guardar" : "Añadir"}</button>
      <input className="input col-span-2 sm:col-span-7" name="notes" defaultValue={p?.notes ?? ""} placeholder="Notas" aria-label="Notas" />
    </form>
  );
}

export default async function InversionPage() {
  const d = await loadYear();
  const ps = plansSummary(d);
  const pf = portfolio(d);
  const months = Array.from({ length: 12 }, (_, i) => i + 1);

  return (
    <div className="space-y-4">
      <Hero kicker="Planes e inversión" title="Lo que aportas cada mes" sub="Planes de ahorro periódico y operaciones puntuales. La aportación del mes se resta en el resultado de Inicio. El valor real de tus fondos está en Patrimonio." />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Valor fondos" value={fmt0(ps.valor)} />
        <Stat label="Aportado (calculado)" value={fmt0(ps.aportado)} />
        <Stat label="Ganancia" value={fmt0(ps.ganancia)} tone={ps.ganancia >= 0 ? "good" : "bad"} sub={`Rentabilidad ${fmtPct(ps.rentabilidad)}`} />
        <Stat label="Cartera puntual" value={fmt0(pf.total.valor)} sub={`Resultado neto ${fmt0(pf.total.neto)}`} />
      </section>

      <div className="card">
        <div className="label mb-3">Planes de ahorro periódico</div>
        <div className="space-y-4">
          {ps.rows.map(({ plan, anual, ganancia }) => (
            <div key={plan.id} className="space-y-1 border-b border-line pb-3">
              <PlanForm p={plan} />
              <div className="flex items-center gap-3 text-xs text-muted">
                <span>Aportado {d.year}: <span className="tnum text-ink2">{fmt(anual)}</span></span>
                <span>Ganancia: <span className={`tnum ${ganancia != null && ganancia < 0 ? "text-bad" : "text-ink2"}`}>{fmt(ganancia)}</span></span>
                <form action={deletePlan} className="ml-auto">
                  <input type="hidden" name="id" value={plan.id} />
                  <button className="text-muted hover:text-bad">Eliminar</button>
                </form>
              </div>
            </div>
          ))}
          <PlanForm />
        </div>
      </div>

      <div className="card overflow-x-auto">
        <div className="label mb-1">Aportaciones por mes</div>
        <p className="mb-3 text-xs text-muted">Fila de arriba: total del mes (fijo + extra). Debajo, escribe los importes variables o extra (redondeos, saveback, aportaciones puntuales).</p>
        <table className="data min-w-[1000px]">
          <thead><tr><th>Fondo</th>{MONTHS_SHORT.map((m) => <th key={m} className="text-right">{m}</th>)}</tr></thead>
          <tbody>
            {d.plans.map((p) => (
              <tr key={p.id}>
                <td className="min-w-[10rem]"><div className="font-medium">{p.name}</div></td>
                {months.map((m) => {
                  const extra = d.extras.find((e) => e.plan_id === p.id && e.month === m)?.amount ?? null;
                  return (
                    <td key={m} className="px-0.5 py-0.5 align-top">
                      <div className="tnum px-1.5 text-right text-sm">{fmt0(planMonth(d, p.id, m))}</div>
                      <CellInput ariaLabel={`Extra ${p.name} ${MONTHS_SHORT[m - 1]}`} value={extra} placeholder="+extra" highlight={extra != null}
                        className="text-xs" onSave={async (v: string) => { "use server"; await setPlanExtra(p.id, d.year, m, v); }} />
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="bg-line/30 font-semibold">
              <td>Total</td>
              {months.map((m) => <td key={m} className="tnum text-right">{fmt0(d.plans.reduce((s, p) => s + planMonth(d, p.id, m), 0))}</td>)}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="label mb-3">Operaciones puntuales</div>
        <form action={saveInvestment} className="grid grid-cols-2 gap-2 sm:grid-cols-8">
          <input className="input" type="date" name="date" required aria-label="Fecha" defaultValue={new Date().toISOString().slice(0, 10)} />
          <select className="input" name="type" aria-label="Tipo"><option>Compra</option><option>Venta</option></select>
          <input className="input sm:col-span-2" name="asset" placeholder="Activo (ticker/nombre)" required aria-label="Activo" list="assets" />
          <datalist id="assets">{pf.rows.map((r) => <option key={r.asset} value={r.asset} />)}</datalist>
          <input className="input" name="asset_class" placeholder="Clase (ETF, acción…)" aria-label="Clase de activo" />
          <input className="input tnum" name="quantity" inputMode="decimal" placeholder="Cantidad" required aria-label="Cantidad" />
          <input className="input tnum" name="unit_price" inputMode="decimal" placeholder="Precio €" required aria-label="Precio unitario" />
          <input className="input tnum" name="fees" inputMode="decimal" placeholder="Comisión €" aria-label="Comisiones" />
          <input className="input col-span-2 sm:col-span-7" name="notes" placeholder="Notas" aria-label="Notas" />
          <button className="btn">Añadir</button>
        </form>
        {d.investments.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="data min-w-[720px]">
              <thead><tr><th>Fecha</th><th>Tipo</th><th>Activo</th><th className="text-right">Cantidad</th><th className="text-right">Precio</th><th className="text-right">Comisión</th><th className="text-right">Neto</th><th></th></tr></thead>
              <tbody>
                {d.investments.map((i) => (
                  <tr key={i.id}>
                    <td className="tnum">{i.date.split("-").reverse().join("/")}</td>
                    <td className={i.type === "Compra" ? "text-accent" : "text-accent2"}>{i.type}</td>
                    <td>{i.asset}<div className="text-xs text-muted">{i.asset_class}</div></td>
                    <td className="tnum text-right">{Number(i.quantity).toLocaleString("es-ES")}</td>
                    <td className="tnum text-right">{fmt(i.unit_price)}</td>
                    <td className="tnum text-right">{fmt(i.fees)}</td>
                    <td className="tnum text-right">{fmt(investmentNet(i))}</td>
                    <td><form action={deleteInvestment}><input type="hidden" name="id" value={i.id} /><button className="text-muted hover:text-bad" aria-label="Eliminar">×</button></form></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pf.rows.length > 0 && (
        <div className="card overflow-x-auto">
          <div className="label mb-1">Cartera · posición por activo</div>
          <p className="mb-3 text-xs text-muted">Coste medio simple = total comprado / unidades compradas. Escribe el precio actual para ver el valor y la plusvalía latente.</p>
          <table className="data min-w-[900px]">
            <thead><tr><th>Activo</th><th className="text-right">Uds</th><th className="text-right">Coste medio</th><th className="text-right">Precio actual</th><th className="text-right">Valor</th><th className="text-right">P/L latente</th><th className="text-right">P/L realizado</th><th className="text-right">Resultado neto</th></tr></thead>
            <tbody>
              {pf.rows.map((r) => (
                <tr key={r.asset}>
                  <td className="font-medium">{r.asset}</td>
                  <td className="tnum text-right">{r.uds.toLocaleString("es-ES")}</td>
                  <td className="tnum text-right">{fmt(r.costeMedio)}</td>
                  <td className="w-28"><CellInput ariaLabel={`Precio ${r.asset}`} value={r.precio} placeholder="precio"
                    onSave={async (v: string) => { "use server"; await setAssetPrice(r.asset, v); }} /></td>
                  <td className="tnum text-right">{fmt(r.valor)}</td>
                  <td className={`tnum text-right ${(r.latente ?? 0) < 0 ? "text-bad" : "text-good"}`}>{fmt(r.latente)} <span className="text-xs">{fmtPct(r.latentePct)}</span></td>
                  <td className="tnum text-right">{fmt(r.realizado)}</td>
                  <td className={`tnum text-right font-medium ${r.neto < 0 ? "text-bad" : "text-good"}`}>{fmt(r.neto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
