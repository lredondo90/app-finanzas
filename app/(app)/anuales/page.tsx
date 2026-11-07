import Hero from "@/components/Hero";
import { deleteAnnual, saveAnnual, saveSettings } from "@/app/actions";
import { MONTHS, MONTHS_SHORT, annualFund, annualMonthlyQuota, fmt, fmt0 } from "@/lib/finance";
import { loadYear } from "@/lib/data";

export const dynamic = "force-dynamic";

function MonthSelect({ name, value }: { name: string; value: number | null }) {
  return (
    <select className="input" name={name} defaultValue={value ?? ""} aria-label="Mes en que se paga">
      <option value="">Sin mes</option>
      {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
    </select>
  );
}

export default async function AnualesPage() {
  const d = await loadYear();
  const quota = annualMonthlyQuota(d);
  const fund = annualFund(d);
  const total = d.annuals.reduce((s, a) => s + Number(a.amount), 0);

  return (
    <div className="space-y-4">
      <Hero kicker="Gastos anuales" value={fmt0(total)} sub="Apunta cada recibo anual y el mes en que llega. Se reparte entre 12 y esa cuota alimenta «Seguros / anuales» del presupuesto." />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <div className="card"><div className="label">Total anual</div><div className="mt-1 text-2xl font-semibold">{fmt0(total)}</div></div>
        <div className="card"><div className="label">Cuota mensual a ahorrar</div><div className="mt-1 text-2xl font-semibold">{fmt(quota)}</div></div>
        <form action={saveSettings} className="card col-span-2 lg:col-span-1">
          <input type="hidden" name="year" value={d.year} />
          <label className="label" htmlFor="initial">Saldo inicial del fondo (1 de enero)</label>
          <div className="mt-1 flex gap-2">
            <input id="initial" className="input tnum" name="annual_fund_initial" inputMode="decimal" defaultValue={d.settings?.annual_fund_initial ?? 0} />
            <button className="btn-ghost">Guardar</button>
          </div>
        </form>
      </section>

      <div className="card">
        <div className="label mb-3">Recibos anuales</div>
        <div className="space-y-2">
          {d.annuals.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
              <form action={saveAnnual} className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-[2fr_1fr_1fr_auto_auto]">
                <input type="hidden" name="id" value={a.id} />
                <input className="input col-span-2 sm:col-span-1" name="name" defaultValue={a.name} aria-label="Concepto" />
                <input className="input tnum" name="amount" inputMode="decimal" defaultValue={a.amount} aria-label="Importe anual" />
                <MonthSelect name="pay_month" value={a.pay_month} />
                <span className="tnum self-center text-right text-sm text-muted">{fmt(Number(a.amount) / 12)}/mes</span>
                <button className="btn-ghost">Guardar</button>
              </form>
              <form action={deleteAnnual}>
                <input type="hidden" name="id" value={a.id} />
                <button className="px-2 text-muted hover:text-bad" aria-label={`Eliminar ${a.name}`}>×</button>
              </form>
            </div>
          ))}
          <form action={saveAnnual} className="grid grid-cols-2 gap-2 border-t border-line pt-3 sm:grid-cols-[2fr_1fr_1fr_auto]">
            <input className="input col-span-2 sm:col-span-1" name="name" placeholder="Nuevo recibo (p. ej. Seguro hogar)" required />
            <input className="input tnum" name="amount" inputMode="decimal" placeholder="Importe anual €" required />
            <MonthSelect name="pay_month" value={null} />
            <button className="btn">Añadir</button>
          </form>
        </div>
        {d.annuals.some((a) => !a.pay_month) && (
          <p className="mt-3 text-xs text-muted">Consejo: indica el mes de pago de cada recibo para ver cuándo baja el fondo.</p>
        )}
      </div>

      <div className="card overflow-x-auto">
        <div className="label mb-3">Fondo de anuales mes a mes</div>
        <table className="data min-w-[900px]">
          <thead><tr><th>Concepto</th>{MONTHS_SHORT.map((m) => <th key={m} className="text-right">{m}</th>)}</tr></thead>
          <tbody>
            <tr><td>Aportación del mes</td>{fund.map((f) => <td key={f.month} className="tnum text-right">{fmt0(f.aportacion)}</td>)}</tr>
            <tr><td>Recibos pagados</td>{fund.map((f) => <td key={f.month} className="tnum text-right">{f.pagados ? fmt0(f.pagados) : "—"}</td>)}</tr>
            <tr className="font-semibold"><td>Saldo a fin de mes</td>{fund.map((f) => <td key={f.month} className={`tnum text-right ${f.saldo < 0 ? "text-bad" : ""}`}>{fmt0(f.saldo)}</td>)}</tr>
          </tbody>
        </table>
        <p className="mt-2 text-xs text-muted">Si el saldo sale en rojo, ese recibo llega antes de haber ahorrado lo suficiente.</p>
      </div>
    </div>
  );
}
