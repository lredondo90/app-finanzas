import Link from "next/link";
import Hero from "@/components/Hero";
import YearSwitcher from "@/components/YearSwitcher";
import { MONTHS, MONTHS_SHORT, annualFund, firstMonth, fmt0 } from "@/lib/finance";
import { getUser, loadYear } from "@/lib/data";
import { yearPlan } from "@/lib/plan";

export const dynamic = "force-dynamic";

const signed = (v: number) => (Math.abs(v) < 0.5 ? "0 €" : `${v > 0 ? "+" : "−"}${fmt0(Math.abs(v))}`);

export default async function AnoPage() {
  const d = await loadYear();
  const { supabase } = await getUser();
  const { data: yearRows } = await supabase.from("budget_values").select("year").order("year").limit(5000);
  const years = Array.from(new Set((yearRows ?? []).map((r) => r.year as number)));
  const first = firstMonth(d);
  const y = yearPlan(d, first);
  const max = Math.max(1, ...y.months.flatMap((m) => [m.plan.ahorro, m.ahorroPrevisto]));
  const h = (v: number) => `${Math.max(2, (Math.max(0, v) / max) * 100)}%`;
  const pasados = y.months.filter((m) => m.s.periodo === "pasado");
  const enCurso = y.months.find((m) => m.s.periodo === "actual");
  const futuros = y.months.filter((m) => m.s.periodo === "futuro");
  const futPlan = futuros.reduce((a, m) => a + m.plan.ahorro, 0);
  const fund = annualFund(d);
  const now = enCurso?.s.month ?? (pasados.length ? 12 : first);
  const nextPays = d.annuals.filter((a) => a.pay_month && a.pay_month >= now).sort((a, b) => (a.pay_month ?? 0) - (b.pay_month ?? 0));
  const shortFund = fund.find((f) => f.month >= first && f.saldo < 0);

  return (
    <div className="space-y-4">
      <Hero top={<YearSwitcher year={d.year} years={years} dark />}
        kicker="Ahorro previsto a 31 de diciembre"
        value={fmt0(y.previsto)}
        sub={<>
          <span className={y.desviacion >= 0 ? "text-emerald-300" : "text-rose-300"}>{signed(y.desviacion)} frente a tu plan</span> · plan {fmt0(y.plan)}.
          {" "}Meses pasados con lo real, el mes en curso a tu ritmo y el resto con tu plan.
        </>} />

      <section className="card">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="section-title">Ahorro de cada mes</h2>
          <span className="text-xs text-muted">plan detrás · real delante</span>
        </div>
        <div className="grid h-40 items-end gap-1" style={{ gridTemplateColumns: `repeat(${y.months.length}, minmax(0, 1fr))` }}>
          {y.months.map((m) => (
            <Link key={m.s.month} href={`/presupuesto?m=${m.s.month}`} className="relative flex h-full flex-col justify-end" title={`${MONTHS[m.s.month - 1]}: ${fmt0(m.ahorroPrevisto)} (plan ${fmt0(m.plan.ahorro)})`}>
              <div className="absolute inset-x-0 bottom-0 rounded-md bg-accent/15" style={{ height: h(m.plan.ahorro) }} />
              {m.s.periodo !== "futuro" && (
                <div className={`absolute inset-x-1 bottom-0 rounded ${m.s.periodo === "actual" ? "bg-accent/50" : "bg-accent"}`} style={{ height: h(m.ahorroPrevisto) }} />
              )}
            </Link>
          ))}
        </div>
        <div className="mt-1.5 grid gap-1 text-center text-[10px] text-muted" style={{ gridTemplateColumns: `repeat(${y.months.length}, minmax(0, 1fr))` }}>
          {y.months.map((m) => <span key={m.s.month} className={m.s.periodo === "actual" ? "font-bold text-accent" : ""}>{MONTHS_SHORT[m.s.month - 1][0]}</span>)}
        </div>
        <p className="mt-3 text-xs text-muted">Enero y julio suben por la paga extra (llega el 25 de diciembre y el 25 de junio).</p>
      </section>

      <section className="card">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-muted">
              <th className="pb-1 text-left font-normal">Mes</th>
              <th className="pb-1 text-left font-normal"></th>
              <th className="pb-1 text-right font-normal">Ahorro</th>
              <th className="pb-1 text-right font-normal">vs plan</th>
            </tr>
          </thead>
          <tbody>
            {[...pasados, ...(enCurso ? [enCurso] : [])].map((m) => (
              <tr key={m.s.month} className="border-t border-line/60">
                <td className="py-2"><Link href={`/presupuesto?m=${m.s.month}`} className={m.s.periodo === "actual" ? "font-semibold text-accent" : ""}>{MONTHS_SHORT[m.s.month - 1]}</Link></td>
                <td className="py-2 text-xs text-muted">{m.s.periodo === "actual" ? "en curso" : "real"}</td>
                <td className="tnum py-2 text-right">{fmt0(m.ahorroPrevisto)}</td>
                <td className={`tnum py-2 text-right font-semibold ${m.desviacion >= 0.5 ? "text-good" : m.desviacion <= -0.5 ? "text-bad" : "text-muted"}`}>{signed(m.desviacion)}</td>
              </tr>
            ))}
            {futuros.length > 0 && (
              <tr className="border-t border-line/60">
                <td className="py-2">{futuros.length === 1 ? MONTHS_SHORT[futuros[0].s.month - 1] : `${MONTHS_SHORT[futuros[0].s.month - 1]}–${MONTHS_SHORT[futuros[futuros.length - 1].s.month - 1]}`}</td>
                <td className="py-2 text-xs text-muted">plan</td>
                <td className="tnum py-2 text-right">{fmt0(futPlan)}</td>
                <td className="py-2 text-right text-muted">—</td>
              </tr>
            )}
            <tr className="border-t border-line font-semibold">
              <td className="py-2">Año</td><td></td>
              <td className="tnum py-2 text-right">{fmt0(y.previsto)}</td>
              <td className={`tnum py-2 text-right ${y.desviacion >= 0 ? "text-good" : "text-bad"}`}>{signed(y.desviacion)}</td>
            </tr>
          </tbody>
        </table>
        <p className="mt-2 text-xs text-muted">Toca un mes para ver en qué se fue la diferencia: gasto libre o un ingreso o recibo distinto.</p>
      </section>

      <section className="card space-y-2">
        <h2 className="section-title">Hucha de gastos anuales</h2>
        <div className="flex justify-between text-sm"><span className="text-ink2">Saldo a fin de {MONTHS[now - 1].toLowerCase()}</span><span className={`tnum font-semibold ${fund[now - 1].saldo < 0 ? "text-bad" : ""}`}>{fmt0(fund[now - 1].saldo)}</span></div>
        {nextPays.slice(0, 3).map((a) => (
          <div key={a.id} className="flex justify-between text-sm"><span className="text-ink2">{a.name} · {MONTHS[(a.pay_month ?? 1) - 1].toLowerCase()}</span><span className="tnum">{fmt0(Number(a.amount))}</span></div>
        ))}
        {shortFund
          ? <p className="text-sm text-bad">En {MONTHS[shortFund.month - 1].toLowerCase()} la hucha se queda en {fmt0(shortFund.saldo)}: no llega para los recibos.</p>
          : <p className="text-xs text-muted">La hucha llega para todos los recibos del año.</p>}
        <Link href="/plan#anuales" className="block pt-1 text-sm font-semibold text-accent">Recibos anuales ›</Link>
      </section>
    </div>
  );
}
