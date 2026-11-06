import Link from "next/link";
import HBars from "@/components/HBars";
import MonthPicker, { currentMonth } from "@/components/MonthPicker";
import Stat from "@/components/Stat";
import YearChart from "@/components/YearChart";
import ExpenseForm from "@/components/ExpenseForm";
import { MONTHS, MONTHS_SHORT, fmt, fmt0, monthOf, monthSummary } from "@/lib/finance";
import { getUser, loadYear } from "@/lib/data";
import SyncOnOpen from "@/components/SyncOnOpen";

export const dynamic = "force-dynamic";

const fmtWhen = (iso: string) =>
  new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const fmtDay = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

function LastLoads({ loads }: { loads: { source: string; loadedAt: string; lastMovement: string | null }[] }) {
  if (!loads.length) return null;
  const newest = loads.reduce((a, b) => (a.loadedAt > b.loadedAt ? a : b));
  const days = Math.floor((Date.now() - new Date(newest.loadedAt).getTime()) / 86400000);
  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border px-3 py-2 text-xs ${days >= 4 ? "border-warn/60 bg-warn/10" : "border-line bg-surface"}`}>
      <span className="font-medium text-ink">Última carga de gastos:</span>
      {loads.map((l) => (
        <span key={l.source} className="text-ink2">
          <b className="text-ink">{l.source}</b> {fmtWhen(l.loadedAt)}{l.lastMovement ? ` (movimientos hasta el ${fmtDay(l.lastMovement)})` : ""}
        </span>
      ))}
      {days >= 4 && <span className="text-ink">· Hace {days} días: <Link href="/importar" className="text-accent underline">sube el extracto</Link></span>}
    </div>
  );
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const sp = await searchParams;
  const d = await loadYear();
  const month = currentMonth(sp.m, d.year);

  if (d.lines.length === 0 && d.expenses.length === 0) {
    return (
      <div className="card mx-auto mt-10 max-w-lg text-center">
        <h1 className="text-xl font-semibold">Bienvenido</h1>
        <p className="mt-2 text-ink2">Aún no hay datos. Importa tu Excel de presupuesto para empezar con todo lo que ya tienes.</p>
        <Link href="/ajustes" className="btn mt-4">Importar Excel</Link>
      </div>
    );
  }

  const { supabase } = await getUser();
  const [{ count: pendingCount = 0 }, { count: connCount = 0 }] = await Promise.all([
    supabase.from("bank_pending").select("*", { count: "exact", head: true }),
    supabase.from("bank_connections").select("*", { count: "exact", head: true }),
  ]);
  const hasConnections = (connCount ?? 0) > 0;
  const s = monthSummary(d, month);
  const year = Array.from({ length: 12 }, (_, i) => monthSummary(d, i + 1));
  const chart = year.map((m, i) => ({ mes: MONTHS_SHORT[i], month: i + 1, ingresos: m.ingresos, gastos: m.totalGastos, resultado: m.resultado }));
  const ytd = year.slice(0, month);
  const acumulado = ytd.reduce((a, m) => a + m.resultadoTrasInversion, 0);

  const usado = s.prevision > 0 ? s.variableReal / s.prevision : 0;
  const cats = s.porCategoria.filter((c) => c.total > 0).sort((a, b) => b.total - a.total);
  const fijos = s.lineas.filter((l) => l.line.section === "fijo" && l.value !== 0).sort((a, b) => b.value - a.value);
  const recientes = d.expenses.filter((e) => monthOf(e.date) === month).slice(0, 8);
  const catName = (id: string | null) => d.categories.find((c) => c.id === id)?.name ?? "Sin categoría";
  const today = new Date();
  const defaultDate = today.getFullYear() === d.year && today.getMonth() + 1 === month
    ? today.toISOString().slice(0, 10)
    : `${d.year}-${String(month).padStart(2, "0")}-01`;

  return (
    <div className="space-y-4">
      <MonthPicker month={month} year={d.year} />
      <LastLoads loads={d.loads} />
      {hasConnections && <SyncOnOpen />}
      {(pendingCount ?? 0) > 0 && (
        <Link href="/importar" className="flex items-center gap-3 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 text-sm">
          <span className="font-semibold text-accent">{pendingCount}</span>
          <span className="flex-1">movimientos nuevos del banco por revisar</span>
          <span className="text-accent">Revisar →</span>
        </Link>
      )}

      {/* KPIs */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Link href={`/ingresos?m=${month}`} className="block">
          <Stat label="Ingresos" value={fmt0(s.ingresos)}
            sub={s.estado.ingreso.hechos === s.estado.ingreso.total
              ? <span className="text-good">✓ Todos recibidos</span>
              : <span className="text-bad">⚠ {s.estado.ingreso.hechos}/{s.estado.ingreso.total} recibidos · faltan {fmt0(s.estado.ingreso.pendiente)}</span>} />
        </Link>
        <Stat label="Gastos" value={fmt0(s.totalGastos)} sub={<>Fijos {fmt0(s.fijos)} · Variable {fmt0(s.variableConsiderado)}
          {s.estado.fijo.hechos < s.estado.fijo.total && <span className="block text-bad">⚠ {s.estado.fijo.total - s.estado.fijo.hechos} fijos sin pagar</span>}</>} />
        <Stat label="Resultado" value={fmt0(s.resultado)} tone={s.resultado >= 0 ? "good" : "bad"} sub="Ingresos − gastos" />
        <Stat label="Tras inversión" value={fmt0(s.resultadoTrasInversion)} tone={s.resultadoTrasInversion >= 0 ? "good" : "bad"}
          sub={<>Invertido {fmt0(s.inversion)} · Acumulado año {fmt0(acumulado)}</>} />
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        {/* Gasto variable: cómo vas día a día */}
        <div className="card lg:col-span-1">
          <div className="flex items-center justify-between">
            <div className="label">{s.periodo === "actual" ? `Cómo vas · día ${s.ritmo!.dia} de ${s.ritmo!.dias}` : "Gasto variable"}</div>
            <span className="rounded-full bg-line/70 px-2 py-0.5 text-[11px] text-ink2">
              {s.periodo === "pasado" ? "Mes terminado" : s.periodo === "actual" ? "En curso" : "Previsto"}
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-semibold">{fmt(s.variableReal)}</span>
            <span className="text-sm text-muted">de {fmt0(s.prevision)}</span>
          </div>
          <div className="relative mt-3 h-2.5 rounded-full bg-line/60" role="meter" aria-valuenow={Math.round(usado * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Gasto variable sobre lo previsto">
            <div className={`h-2.5 rounded-full ${usado > 1 || (s.ritmo && s.variableReal > s.ritmo.previstoHastaHoy) ? "bg-bad" : "bg-accent"}`} style={{ width: `${Math.min(100, usado * 100)}%` }} />
            {s.ritmo && (
              <div className="absolute -top-1 h-4.5 w-0.5 rounded bg-ink" style={{ left: `${(s.ritmo.dia / s.ritmo.dias) * 100}%`, height: "18px" }} title="Lo que tocaría llevar hoy" />
            )}
          </div>
          {s.ritmo ? (
            <div className="mt-3 space-y-1.5 text-sm">
              {s.variableReal <= s.ritmo.previstoHastaHoy ? (
                <p className="text-good">▼ Vas {fmt0(s.ritmo.previstoHastaHoy - s.variableReal)} por debajo de lo que tocaría a día de hoy ({fmt0(s.ritmo.previstoHastaHoy)}).</p>
              ) : (
                <p className="text-bad">▲ Vas {fmt0(s.variableReal - s.ritmo.previstoHastaHoy)} por encima de lo que tocaría a día de hoy ({fmt0(s.ritmo.previstoHastaHoy)}).</p>
              )}
              <p className="text-ink2">A este ritmo acabarás el mes en <b className={s.ritmo.proyeccion > s.prevision ? "text-bad" : "text-ink"}>{fmt0(s.ritmo.proyeccion)}</b>.</p>
              <p className="text-ink2">{s.desviacion > 0 ? <>Te quedan <b className="text-ink">{fmt0(s.desviacion)}</b>: unos <b className="text-ink">{fmt0(s.ritmo.quedaPorDia)}/día</b> hasta fin de mes.</> : <span className="text-bad">Ya has gastado {fmt0(-s.desviacion)} más de lo previsto.</span>}</p>
            </div>
          ) : (
            <div className="mt-2 flex justify-between text-xs">
              <span className="text-ink2">{Math.round(usado * 100)} % de lo previsto</span>
              {s.periodo === "pasado" && (
                <span className={s.desviacion >= 0 ? "text-good" : "text-bad"}>
                  {s.desviacion >= 0 ? `▼ Ahorraste ${fmt(s.desviacion)}` : `▲ Te pasaste ${fmt(-s.desviacion)}`}
                </span>
              )}
            </div>
          )}
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-3 text-sm">
            <div><div className="label">Fondo anuales</div><div className={`tnum mt-0.5 font-medium ${s.fondoAnuales < 0 ? "text-bad" : ""}`}>{fmt0(s.fondoAnuales)}</div></div>
            <div><div className="label">Planes ahorro</div><div className="tnum mt-0.5 font-medium">{fmt0(s.planes)}</div></div>
          </div>
        </div>

        {/* Por categoría */}
        <div className="card lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <div className="label">Gasto variable por categoría</div>
            <Link href={`/gastos?m=${month}`} className="text-xs text-accent">Ver todos →</Link>
          </div>
          {cats.length ? (
            <HBars format={fmt} rows={cats.map((c) => ({ label: c.name, value: c.total, hint: `${Math.round((c.total / s.variableReal) * 100)} %` }))} />
          ) : (
            <p className="py-6 text-center text-sm text-muted">Sin gastos variables apuntados en {MONTHS[month - 1].toLowerCase()}.</p>
          )}
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <div className="label mb-2">Ingresos y gastos · {d.year}</div>
          <YearChart data={chart} selected={month} />
        </div>
        <div className="card">
          <div className="label mb-3">Gastos fijos del mes</div>
          <HBars format={fmt0} rows={fijos.map((l) => ({ label: l.line.name + (l.adjusted ? " *" : ""), value: l.value, hint: l.adjusted ? "ajustado este mes" : undefined }))} />
          {fijos.some((l) => l.adjusted) && <p className="mt-3 text-xs text-muted">* importe ajustado este mes</p>}
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <div className="label">Últimos gastos</div>
            <Link href={`/gastos?m=${month}`} className="text-xs text-accent">Ver todos →</Link>
          </div>
          {recientes.length ? (
            <table className="data">
              <tbody>
                {recientes.map((e) => (
                  <tr key={e.id}>
                    <td className="tnum w-14 text-muted">{e.date.slice(8, 10)}/{e.date.slice(5, 7)}</td>
                    <td><div className="font-medium">{e.description ?? "—"}</div><div className="text-xs text-muted">{catName(e.category_id)}</div></td>
                    <td className="tnum text-right">{fmt(e.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="py-6 text-center text-sm text-muted">Nada por aquí todavía.</p>}
        </div>
        <div className="card">
          <div className="mb-3 flex items-center justify-between"><div className="label">Apuntar un gasto</div><Link href="/importar" className="text-xs text-accent">Importar extracto →</Link></div>
          <ExpenseForm compact categories={d.categories} methods={d.paymentMethods} defaultDate={defaultDate} />
        </div>
      </section>
    </div>
  );
}
