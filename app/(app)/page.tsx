import Link from "next/link";
import HBars from "@/components/HBars";
import MonthPicker, { currentMonth } from "@/components/MonthPicker";
import Stat from "@/components/Stat";
import YearChart from "@/components/YearChart";
import ExpenseForm from "@/components/ExpenseForm";
import { MONTHS, MONTHS_SHORT, fmt, fmt0, monthOf, monthSummary } from "@/lib/finance";
import { loadYear } from "@/lib/data";

export const dynamic = "force-dynamic";

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

      {/* KPIs */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Ingresos" value={fmt0(s.ingresos)} sub={`${s.lineas.filter((l) => l.line.section === "ingreso" && l.value).length} fuentes`} />
        <Stat label="Gastos" value={fmt0(s.totalGastos)} sub={<>Fijos {fmt0(s.fijos)} · Variable {fmt0(s.variableConsiderado)}</>} />
        <Stat label="Resultado" value={fmt0(s.resultado)} tone={s.resultado >= 0 ? "good" : "bad"} sub="Ingresos − gastos" />
        <Stat label="Tras inversión" value={fmt0(s.resultadoTrasInversion)} tone={s.resultadoTrasInversion >= 0 ? "good" : "bad"}
          sub={<>Invertido {fmt0(s.inversion)} · Acumulado año {fmt0(acumulado)}</>} />
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        {/* Gasto variable */}
        <div className="card lg:col-span-1">
          <div className="flex items-center justify-between">
            <div className="label">Gasto variable</div>
            <span className={`rounded-full px-2 py-0.5 text-[11px] ${s.closed ? "bg-good/15 text-good" : "bg-line/70 text-ink2"}`}>
              {s.closed ? "✓ Mes cerrado" : "Mes abierto"}
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-semibold">{fmt(s.variableReal)}</span>
            <span className="text-sm text-muted">de {fmt0(s.prevision)} previstos</span>
          </div>
          <div className="mt-3 h-2.5 rounded-full bg-line/60" role="meter" aria-valuenow={Math.round(usado * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Gasto variable sobre lo previsto">
            <div className={`h-2.5 rounded-full ${usado > 1 ? "bg-bad" : "bg-accent"}`} style={{ width: `${Math.min(100, usado * 100)}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-xs">
            <span className="text-ink2">{Math.round(usado * 100)} % usado</span>
            <span className={s.desviacion >= 0 ? "text-good" : "text-bad"}>
              {s.desviacion >= 0 ? `▼ Quedan ${fmt(s.desviacion)}` : `▲ Te pasas ${fmt(-s.desviacion)}`}
            </span>
          </div>
          <p className="mt-3 text-xs text-muted">
            {s.closed ? "El resultado usa el gasto real." : "Mientras el mes esté abierto, el resultado usa la provisión. Ciérralo en Presupuesto."}
          </p>
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
          <div className="label mb-3">Apuntar un gasto</div>
          <ExpenseForm compact categories={d.categories} methods={d.paymentMethods} defaultDate={defaultDate} />
        </div>
      </section>
    </div>
  );
}
