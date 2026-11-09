import Link from "next/link";
import Hero from "@/components/Hero";
import Meter from "@/components/Meter";
import MonthPicker, { currentMonth } from "@/components/MonthPicker";
import { windowLabel } from "@/lib/accounting";
import { firstMonth, fmt0, isDone, lineValue, plannedValue } from "@/lib/finance";
import { getUser, loadYear } from "@/lib/data";
import { loadHouseMonth } from "@/lib/houseData";
import { libreByAccount, monthPlan } from "@/lib/plan";
import type { BudgetLine, YearData } from "@/lib/types";

export const dynamic = "force-dynamic";

const signed = (v: number) => (Math.abs(v) < 0.5 ? "0" : `${v > 0 ? "+" : "−"}${fmt0(Math.abs(v)).replace(/\s?€/, "")}`);
const num = (v: number) => fmt0(v).replace(/\s?€/, "");

function Rows({ d, month, lines, income }: { d: YearData; month: number; lines: BudgetLine[]; income: boolean }) {
  const rows = lines.map((l) => {
    const plan = plannedValue(d, l, month);
    const done = l.is_annual_fund || isDone(d, l, month);
    const real = done ? lineValue(d, l, month) : null;
    return { l, plan, done, real };
  }).filter((r) => Math.abs(r.plan) > 0.005 || (r.real != null && Math.abs(r.real) > 0.005));
  const totPlan = rows.reduce((a, r) => a + r.plan, 0);
  const totReal = rows.reduce((a, r) => a + (r.real ?? 0), 0);
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-[11px] text-muted">
          <th className="pb-1 text-left font-normal"></th>
          <th className="w-16 pb-1 text-right font-normal">Plan</th>
          <th className="w-16 pb-1 text-right font-normal">Real</th>
          <th className="w-16 pb-1 text-right font-normal">Desv.</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ l, plan, done, real }) => {
          // Desviación a favor: ingreso que llega de más o recibo que sale por menos
          const dev = real == null ? null : income ? real - plan : plan - real;
          return (
            <tr key={l.id} className="border-t border-line/60">
              <td className="py-2 pr-2">
                <span className="font-medium">{l.name}</span>{" "}
                {l.is_annual_fund ? <span className="text-xs text-muted">hucha</span>
                  : done ? <span className="text-xs font-semibold text-good">✓</span>
                  : <span className="text-xs font-semibold text-warn">pendiente</span>}
              </td>
              <td className="tnum py-2 text-right">{num(plan)}</td>
              <td className={`tnum py-2 text-right ${real == null ? "text-muted" : ""}`}>{real == null ? "—" : num(real)}</td>
              <td className={`tnum py-2 text-right ${dev == null ? "" : dev < -0.5 ? "text-bad" : dev > 0.5 ? "text-good" : "text-muted"}`}>{dev == null ? "" : signed(dev)}</td>
            </tr>
          );
        })}
        <tr className="border-t border-line font-semibold">
          <td className="py-2">Total</td>
          <td className="tnum py-2 text-right">{num(totPlan)}</td>
          <td className="tnum py-2 text-right">{num(totReal)}</td>
          <td></td>
        </tr>
      </tbody>
    </table>
  );
}

export default async function PresupuestoPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const sp = await searchParams;
  const d = await loadYear();
  const first = firstMonth(d);
  const month = currentMonth(sp.m, d.year, first);
  const { supabase } = await getUser();
  const house = await loadHouseMonth(supabase, d.year, month);
  const mp = monthPlan(d, month);
  const { s, libre } = mp;
  const cutoff = d.settings?.cutoff_day ?? 25;
  const mark = s.ritmo ? s.ritmo.dia / s.ritmo.dias : null;
  const porCuenta = libreByAccount(d, month);
  const puntuales = d.oneOffIncomes.filter((i) => i.date.startsWith(`${d.year}-`) && Number(i.date.slice(5, 7)) === month);

  return (
    <div className="space-y-4">
      <Hero
        top={<MonthPicker month={month} year={d.year} base="/presupuesto" min={first} />}
        kicker={s.periodo === "pasado" ? "Ahorro del mes" : "Ahorro previsto del mes"}
        value={fmt0(mp.ahorroPrevisto)}
        sub={<>
          <span className={mp.desviacion >= 0 ? "text-emerald-300" : "text-rose-300"}>{mp.desviacion >= 0 ? "+" : "−"}{fmt0(Math.abs(mp.desviacion))} {mp.desviacion >= 0 ? "sobre" : "por debajo del"} plan</span>
          {" · "}plan {fmt0(mp.plan.ahorro)} · nómina del {windowLabel(d.year, month, cutoff)}
        </>} />

      <section className="card">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="section-title">Ingresos</h2>
          <Link href={`/ingresos?m=${month}`} className="text-sm text-accent">Marcar cobrados ›</Link>
        </div>
        <Rows d={d} month={month} lines={d.lines.filter((l) => l.section === "ingreso")} income />
        {puntuales.length > 0 && <p className="mt-2 text-xs text-muted">Más {fmt0(puntuales.reduce((a, i) => a + Number(i.amount), 0))} de ingresos puntuales.</p>}
      </section>

      <section className="card">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="section-title">Gastos fijos</h2>
          <Link href={`/ingresos?m=${month}`} className="text-sm text-accent">Marcar pagados ›</Link>
        </div>
        <Rows d={d} month={month} lines={d.lines.filter((l) => l.section === "fijo")} income={false} />
        <p className="mt-2 text-xs text-muted">Lo pendiente se cuenta con el importe del plan hasta que llegue. La hucha de anuales se aparta cada mes.</p>
      </section>

      <section className="card space-y-2.5">
        <div className="flex items-baseline justify-between">
          <h2 className="section-title">Gasto libre</h2>
          <span className="tnum text-sm"><b>{fmt0(libre.gastado)}</b> de {fmt0(libre.presupuesto)}</span>
        </div>
        <Meter value={libre.presupuesto ? libre.gastado / libre.presupuesto : 0} mark={mark} tone={libre.gastado > libre.presupuesto ? "bad" : "accent"} />
        <div className="flex justify-between text-sm">
          <span className="text-ink2">{s.periodo === "pasado" ? "Gastado al final" : "Previsión a fin de mes"}</span>
          <span className={`tnum font-semibold ${libre.previsto > libre.presupuesto ? "text-bad" : ""}`}>
            {fmt0(libre.previsto)} · {libre.previsto <= libre.presupuesto ? `sobran ${fmt0(libre.presupuesto - libre.previsto)}` : `${fmt0(libre.previsto - libre.presupuesto)} de más`}
          </span>
        </div>
        {porCuenta.length > 0 && (
          <div className="flex flex-wrap gap-1.5 text-xs text-ink2">
            {porCuenta.map((c) => (
              <span key={c.name} className="rounded-full bg-line/50 px-2.5 py-1">{c.name} {fmt0(c.total)}{libre.gastado > 0 ? ` (${Math.round((c.total / libre.gastado) * 100)} %)` : ""}</span>
            ))}
          </div>
        )}
        <p className="text-xs text-muted">Un solo bote para todo lo que no es fijo, de todas tus cuentas. <Link href={`/gastos?m=${month}`} className="text-accent">Ver movimientos ›</Link></p>
      </section>

      {house.budgets.map(({ account, budget, spent }) => {
        const prev = s.periodo === "actual" && s.ritmo ? (s.ritmo.dia < 7 ? spent + (budget * (s.ritmo.dias - s.ritmo.dia)) / s.ritmo.dias : (spent / s.ritmo.dia) * s.ritmo.dias) : s.periodo === "pasado" ? spent : budget;
        return (
          <section key={account.uid} className="card space-y-2.5">
            <div className="flex items-baseline justify-between">
              <h2 className="section-title">Casa · {account.label}</h2>
              <span className="tnum text-sm"><b>{fmt0(spent)}</b> de {fmt0(budget)}</span>
            </div>
            <Meter value={spent / budget} mark={mark} tone={prev > budget ? "warn" : "accent"} />
            <div className="flex justify-between text-sm">
              <span className="text-ink2">{s.periodo === "pasado" ? "Gastado al final" : "Previsión a fin de mes"}</span>
              <span className={`tnum font-semibold ${prev > budget ? "text-bad" : ""}`}>{fmt0(prev)} · {prev <= budget ? `sobran ${fmt0(budget - prev)}` : `${fmt0(prev - budget)} de más`}</span>
            </div>
            <p className="text-xs text-muted">Presupuesto entre los dos. Aparte del tuyo: en tu presupuesto cuenta tu aportación. <Link href={`/casa?m=${month}`} className="text-accent">Ver casa ›</Link></p>
          </section>
        );
      })}

      <div className="flex flex-wrap gap-2">
        <Link href="/plan" className="btn">Editar mi plan</Link>
        <Link href="/presupuesto/tabla" className="btn-ghost">Tabla de 12 meses</Link>
      </div>
    </div>
  );
}
