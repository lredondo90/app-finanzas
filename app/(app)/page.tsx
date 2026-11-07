import Link from "next/link";
import ExpenseForm from "@/components/ExpenseForm";
import HBars from "@/components/HBars";
import Hero from "@/components/Hero";
import MonthPicker, { currentMonth } from "@/components/MonthPicker";
import MovementList from "@/components/MovementList";
import SyncOnOpen from "@/components/SyncOnOpen";
import YearChart from "@/components/YearChart";
import { windowLabel } from "@/lib/accounting";
import { MONTHS, MONTHS_SHORT, firstMonth, fmt, fmt0, monthOf, monthSummary, netWorth } from "@/lib/finance";
import { getUser, loadYear } from "@/lib/data";

export const dynamic = "force-dynamic";

function Meter({ value, tone = "accent" }: { value: number; tone?: "accent" | "bad" | "good" }) {
  const bg = tone === "bad" ? "bg-bad" : tone === "good" ? "bg-good" : "bg-accent";
  return (
    <div className="h-2 rounded-full bg-line/70">
      <div className={`h-2 rounded-full ${bg}`} style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }} />
    </div>
  );
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const sp = await searchParams;
  const d = await loadYear();
  const first = firstMonth(d);
  const month = currentMonth(sp.m, d.year, first);

  if (d.lines.length === 0) {
    return (
      <div className="space-y-4">
        <Hero kicker="Mis Finanzas" title="Bienvenido" sub="Aún no hay presupuesto. Crea tus conceptos en Presupuesto y conecta tu banco." />
        <Link href="/importar" className="btn">Conectar banco</Link>
      </div>
    );
  }

  const { supabase } = await getUser();
  const [{ count: pendingCount = 0 }, { count: connCount = 0 }] = await Promise.all([
    supabase.from("bank_pending").select("*", { count: "exact", head: true }),
    supabase.from("bank_connections").select("*", { count: "exact", head: true }),
  ]);
  const s = monthSummary(d, month);
  const year = Array.from({ length: 12 }, (_, i) => monthSummary(d, i + 1));
  const chart = year.slice(first - 1).map((m) => ({ mes: MONTHS_SHORT[m.month - 1], month: m.month, ingresos: m.ingresos, gastos: m.totalGastos, resultado: m.resultado }));
  const acumulado = year.slice(first - 1, month).reduce((a, m) => a + m.resultadoTrasInversion, 0);
  const nw = netWorth(d);
  const cutoff = d.settings?.cutoff_day ?? 25;
  const shifted = d.lines.filter((l) => l.next_month && l.section === "ingreso").map((l) => l.name.toLowerCase());

  const usado = s.prevision > 0 ? s.variableReal / s.prevision : 0;
  const cats = s.porCategoria.filter((c) => c.total > 0).sort((a, b) => b.total - a.total);
  const recientes = d.expenses.filter((e) => monthOf(e.date) === month).slice(0, 8);
  const today = new Date();
  const defaultDate = today.getFullYear() === d.year && today.getMonth() + 1 === month
    ? today.toISOString().slice(0, 10)
    : `${d.year}-${String(month).padStart(2, "0")}-01`;
  const pendientes = s.lineas.filter((l) => (l.line.section === "ingreso" || l.line.section === "fijo") && !l.line.is_annual_fund && l.value !== 0 && !l.done);

  return (
    <div className="space-y-4">
      <Hero
        top={<MonthPicker month={month} year={d.year} min={first} />}
        right={(connCount ?? 0) > 0 ? <div className="text-white/70"><SyncOnOpen /></div> : null}
        value={fmt0(s.resultado)}
        sub={<>Te queda este mes{shifted.length ? <> · {shifted.join(", ")} del {windowLabel(d.year, month, cutoff)}</> : null}</>}>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <Link href={`/ingresos?m=${month}`} className="rounded-2xl bg-white/10 px-2 py-2.5 hover:bg-white/15">
            <div className="text-[11px] text-white/60">Ingresos</div>
            <div className="tnum text-base font-semibold">{fmt0(s.ingresos)}</div>
          </Link>
          <Link href={`/gastos?m=${month}`} className="rounded-2xl bg-white/10 px-2 py-2.5 hover:bg-white/15">
            <div className="text-[11px] text-white/60">Gastos</div>
            <div className="tnum text-base font-semibold">{fmt0(s.totalGastos)}</div>
          </Link>
          <Link href="/inversion" className="rounded-2xl bg-white/10 px-2 py-2.5 hover:bg-white/15">
            <div className="text-[11px] text-white/60">Invertido</div>
            <div className="tnum text-base font-semibold">{fmt0(s.inversion)}</div>
          </Link>
        </div>
      </Hero>

      {(pendingCount ?? 0) > 0 && (
        <Link href="/importar" className="card flex items-center gap-3 py-3 sm:py-3">
          <span className="icon-tile bg-accent text-sm font-bold text-white">{pendingCount}</span>
          <span className="flex-1 text-sm"><b>Movimientos nuevos del banco</b><span className="block text-xs text-muted">Dime qué son y los aprenderé</span></span>
          <span className="text-accent">Revisar ›</span>
        </Link>
      )}

      {/* Cuentas, como en la app del banco */}
      <section>
        <div className="mb-2 flex items-baseline justify-between px-1">
          <h2 className="section-title">Mis cuentas</h2>
          <Link href="/patrimonio" className="text-sm text-accent">Patrimonio {fmt0(nw.total)} ›</Link>
        </div>
        <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
          {d.syncedAccounts.map((a) => (
            <Link key={a.uid} href="/patrimonio" className="card min-w-[11.5rem] snap-start py-3.5 sm:py-3.5">
              <div className="truncate text-xs text-muted">{a.bank}</div>
              <div className="truncate text-sm font-medium">{a.label}</div>
              <div className="tnum mt-2 text-lg font-semibold">{a.balance == null ? "—" : fmt(a.balance)}</div>
            </Link>
          ))}
          {nw.fondos > 0 && (
            <Link href="/patrimonio#fondos" className="card min-w-[11.5rem] snap-start py-3.5 sm:py-3.5">
              <div className="text-xs text-muted">Inversión</div>
              <div className="text-sm font-medium">Fondos y ETF</div>
              <div className="tnum mt-2 text-lg font-semibold">{fmt(nw.fondos)}</div>
            </Link>
          )}
          {!d.syncedAccounts.length && (
            <Link href="/importar" className="card min-w-[11.5rem] text-sm text-accent">+ Conectar un banco</Link>
          )}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {/* Gasto variable del mes */}
        <div className="card">
          <div className="flex items-center justify-between">
            <h2 className="section-title">{s.periodo === "actual" ? "Cómo vas" : "Gasto variable"}</h2>
            <span className="rounded-full bg-line/60 px-2.5 py-0.5 text-[11px] text-ink2">
              {s.periodo === "pasado" ? "Mes terminado" : s.periodo === "actual" ? `Día ${s.ritmo!.dia} de ${s.ritmo!.dias}` : "Previsto"}
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="tnum text-3xl font-semibold">{fmt(s.variableReal)}</span>
            <span className="text-sm text-muted">de {fmt0(s.prevision)}</span>
          </div>
          <div className="relative mt-3">
            <Meter value={usado} tone={usado > 1 || (s.ritmo && s.variableReal > s.ritmo.previstoHastaHoy) ? "bad" : "accent"} />
            {s.ritmo && <div className="absolute -top-1 h-4 w-0.5 rounded bg-ink" style={{ left: `${(s.ritmo.dia / s.ritmo.dias) * 100}%` }} title="Lo que tocaría llevar hoy" />}
          </div>
          {s.ritmo ? (
            <div className="mt-3 space-y-1 text-sm">
              {s.variableReal <= s.ritmo.previstoHastaHoy
                ? <p className="text-good">Vas {fmt0(s.ritmo.previstoHastaHoy - s.variableReal)} por debajo de lo previsto a día de hoy.</p>
                : <p className="text-bad">Vas {fmt0(s.variableReal - s.ritmo.previstoHastaHoy)} por encima de lo previsto a día de hoy.</p>}
              <p className="text-ink2">{s.desviacion > 0
                ? <>Te quedan <b className="text-ink">{fmt0(s.desviacion)}</b>, unos <b className="text-ink">{fmt0(s.ritmo.quedaPorDia)} al día</b>.</>
                : <span className="text-bad">Ya has gastado {fmt0(-s.desviacion)} más de lo previsto.</span>}</p>
            </div>
          ) : (
            <p className={`mt-3 text-sm ${s.desviacion >= 0 ? "text-good" : "text-bad"}`}>
              {s.periodo === "pasado" ? (s.desviacion >= 0 ? `Ahorraste ${fmt(s.desviacion)}` : `Te pasaste ${fmt(-s.desviacion)}`) : `${Math.round(usado * 100)} % de lo previsto`}
            </p>
          )}
          {cats.length > 0 && (
            <div className="mt-5 border-t border-line pt-4">
              <HBars format={fmt0} rows={cats.slice(0, 6).map((c) => ({ label: c.name, value: c.total, hint: `${Math.round((c.total / s.variableReal) * 100)} %` }))} />
            </div>
          )}
        </div>

        {/* Recibos e ingresos */}
        <div className="card">
          <div className="flex items-center justify-between">
            <h2 className="section-title">Ingresos y recibos</h2>
            <Link href={`/ingresos?m=${month}`} className="text-sm text-accent">Ver ›</Link>
          </div>
          {(["ingreso", "fijo"] as const).map((k) => {
            const e = s.estado[k];
            return (
              <div key={k} className="mt-4">
                <div className="mb-1.5 flex justify-between text-sm">
                  <span className="text-ink2">{k === "ingreso" ? "Recibidos" : "Pagados"}</span>
                  <span className="tnum font-medium">{e.hechos} de {e.total}</span>
                </div>
                <Meter value={e.total ? e.hechos / e.total : 1} tone={e.hechos === e.total ? "good" : "accent"} />
              </div>
            );
          })}
          {pendientes.length > 0 ? (
            <ul className="mt-4 divide-y divide-line/70 text-sm">
              {pendientes.slice(0, 6).map((l) => (
                <li key={l.line.id} className="flex items-center justify-between py-2">
                  <span className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${l.line.section === "ingreso" ? "bg-good" : "bg-warn"}`} />
                    {l.line.name}{l.line.next_month ? <span className="text-xs text-muted"> · llega tras el {cutoff}</span> : null}
                  </span>
                  <span className="tnum text-ink2">{l.line.section === "ingreso" ? "+" : "−"}{fmt0(l.value)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="mt-4 text-sm text-good">✓ Todo recibido y pagado este mes.</p>}
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-3 text-sm">
            <div><div className="label">Fondo anuales</div><div className={`tnum mt-0.5 font-semibold ${s.fondoAnuales < 0 ? "text-bad" : ""}`}>{fmt0(s.fondoAnuales)}</div></div>
            <div><div className="label">Acumulado año</div><div className={`tnum mt-0.5 font-semibold ${acumulado < 0 ? "text-bad" : ""}`}>{fmt0(acumulado)}</div></div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-5">
        <div className="card lg:col-span-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="section-title">Últimos movimientos</h2>
            <Link href={`/gastos?m=${month}`} className="text-sm text-accent">Ver todos ›</Link>
          </div>
          {recientes.length
            ? <MovementList expenses={recientes} categories={d.categories} />
            : <p className="py-6 text-center text-sm text-muted">Sin gastos en {MONTHS[month - 1].toLowerCase()} todavía.</p>}
        </div>
        <div className="space-y-4 lg:col-span-2">
          {chart.length > 1 && (
            <div className="card">
              <h2 className="section-title mb-2">Ingresos y gastos · {d.year}</h2>
              <YearChart data={chart} selected={month} />
            </div>
          )}
          <details className="card">
            <summary className="cursor-pointer list-none font-semibold">+ Apuntar un gasto a mano</summary>
            <div className="mt-3"><ExpenseForm compact categories={d.categories} methods={d.paymentMethods} defaultDate={defaultDate} /></div>
          </details>
        </div>
      </section>
    </div>
  );
}
