import Hero from "@/components/Hero";
import { deleteAnnual, saveAnnual, saveSettings } from "@/app/actions";
import { MONTHS, MONTHS_SHORT, annualFund, annualMonthlyQuota, fmt, fmt0 } from "@/lib/finance";
import { getUser, loadYear } from "@/lib/data";

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
  // Recibos ya pagados este año: los movimientos del banco marcados como ese recibo anual
  const { supabase } = await getUser();
  const { data: paid } = await supabase.from("bank_movements").select("annual_id, date, amount, bank")
    .not("annual_id", "is", null).gte("date", `${d.year}-01-01`).lt("date", `${d.year + 1}-01-01`).order("date");
  const paidOf = (id: string) => (paid ?? []).filter((p) => p.annual_id === id);
  const nPaid = d.annuals.filter((a) => paidOf(a.id).length).length;
  const pending = d.annuals.filter((a) => !paidOf(a.id).length).reduce((s, a) => s + Number(a.amount), 0);

  return (
    <div className="space-y-4">
      <Hero kicker={`Recibos anuales de ${d.year}`} value={`Pagados ${nPaid} de ${d.annuals.length}`} sub={`Quedan por pagar ${fmt0(pending)} · total del año ${fmt0(total)}`} />

      <div className="card">
        <h2 className="section-title mb-1">Este año</h2>
        <ul className="divide-y divide-line/70">
          {d.annuals.map((a) => {
            const ps = paidOf(a.id);
            return (
              <li key={a.id} className="flex min-h-[3.25rem] items-center gap-3 py-2">
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${ps.length ? "bg-good text-white" : "border-2 border-dashed border-warn text-transparent"}`} aria-hidden>✓</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{a.name}</div>
                  <div className="truncate text-xs text-muted">
                    {ps.length ? `Pagado el ${Number(ps[0].date.slice(8, 10))} de ${MONTHS[Number(ps[0].date.slice(5, 7)) - 1].toLowerCase()} · ${ps[0].bank}`
                      : a.pay_month ? `Pendiente · toca en ${MONTHS[a.pay_month - 1].toLowerCase()}` : "Pendiente"}
                  </div>
                </div>
                <div className="tnum shrink-0 font-semibold">{fmt0(ps.length ? Math.abs(ps.reduce((s, p) => s + Number(p.amount), 0)) : Number(a.amount))}</div>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-xs text-muted">Para marcar uno como pagado, toca el cargo en Movimientos y en «Qué es» elige el recibo anual. Si no está en la lista, elige «Nuevo recibo anual…» y queda grabado para el año que viene.</p>
      </div>

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
