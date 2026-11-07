import Hero from "@/components/Hero";
import CellInput from "@/components/CellInput";
import MonthPicker, { currentMonth } from "@/components/MonthPicker";
import { clearAdjustment, deleteOneOffIncome, saveOneOffIncome, setBudgetCell, setLineDone } from "@/app/actions";
import { MONTHS, firstMonth, fmt, fmt0, monthOf, monthSummary, plannedValue } from "@/lib/finance";
import { loadYear } from "@/lib/data";
import type { YearData } from "@/lib/types";

export const dynamic = "force-dynamic";

type Summary = ReturnType<typeof monthSummary>;

function Section({ d, s, month, section }: { d: YearData; s: Summary; month: number; section: "ingreso" | "fijo" }) {
  const isIncome = section === "ingreso";
  const lines = s.lineas.filter((l) => l.line.section === section);
  const st = s.estado[section];
  const complete = st.total > 0 && st.hechos === st.total;
  const doneLabel = isIncome ? "Recibido" : "Pagado";

  return (
    <div className="card">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="label">{isIncome ? "Ingresos del mes" : "Gastos fijos del mes"}</div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${complete ? "bg-good/15 text-good" : "bg-bad/15 text-bad"}`}>
          {complete ? `✓ Todos ${isIncome ? "recibidos" : "pagados"}` : `⚠ ${st.hechos} de ${st.total} ${isIncome ? "recibidos" : "pagados"} · faltan ${fmt0(st.pendiente)}`}
        </span>
      </div>
      <ul className="divide-y divide-line">
        {lines.map(({ line, value, adjusted, done }) => {
          const plan = plannedValue(d, line, month);
          const pending = !done && value !== 0 && !line.is_annual_fund;
          return (
            <li key={line.id} className={`flex items-center gap-3 py-2.5 ${pending ? "text-bad" : ""}`}>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{line.name}</div>
                <div className="text-xs text-muted">
                  Fijo {fmt0(plan)}
                  {adjusted && (
                    <form action={async () => { "use server"; await clearAdjustment(line.id, d.year, month); }} className="inline">
                      {" · "}<button className="text-accent">volver al fijo</button>
                    </form>
                  )}
                </div>
              </div>
              <div className="w-28 shrink-0">
                <CellInput ariaLabel={`Importe ${line.name} ${MONTHS[month - 1]}`} value={adjusted ? value : null} placeholder={String(Math.round(plan * 100) / 100).replace(".", ",")}
                  highlight={adjusted} className={pending ? "text-bad" : ""}
                  onSave={async (v: string) => { "use server"; await setBudgetCell(line.id, d.year, month, "adjusted", v); }} />
              </div>
              {line.is_annual_fund ? (
                <span className="w-28 shrink-0 rounded-lg bg-line/60 px-2 py-2 text-center text-xs text-muted" title="Cuota de ahorro para los recibos anuales">Ahorro anuales</span>
              ) : (
              <form action={async () => { "use server"; await setLineDone(line.id, d.year, month, !done, plan); }} className="shrink-0">
                <button className={`w-28 rounded-lg px-2 py-2 text-xs font-medium ${done ? "bg-good/15 text-good" : value === 0 ? "bg-line/60 text-muted" : "bg-bad/15 text-bad"}`}
                  aria-pressed={done} title="Pulsa para cambiar">
                  {done ? `✓ ${doneLabel}` : value === 0 ? "Sin importe" : "● Pendiente"}
                </button>
              </form>
              )}
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex justify-between border-t border-line pt-3 text-sm">
        <span className="text-ink2">Total {isIncome ? "previsto (fijos)" : "gastos fijos"}</span>
        <span className="tnum font-semibold">{fmt(lines.reduce((a, l) => a + l.value, 0))}</span>
      </div>
      <p className="mt-2 text-xs text-muted">Escribe el importe solo si este mes es distinto del fijo; si lo dejas vacío, vale el fijo.</p>
    </div>
  );
}

export default async function IngresosPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const sp = await searchParams;
  const d = await loadYear();
  const first = firstMonth(d);
  const month = currentMonth(sp.m, d.year, first);
  const s = monthSummary(d, month);
  const puntuales = d.oneOffIncomes.filter((i) => monthOf(i.date) === month);
  const defaultDate = `${d.year}-${String(month).padStart(2, "0")}-${String(Math.min(new Date().getDate(), 28)).padStart(2, "0")}`;

  return (
    <div className="space-y-4">
      <Hero top={<MonthPicker month={month} year={d.year} base="/ingresos" min={first} />} kicker="Ingresos y recibos" value={fmt0(s.ingresos)} sub={s.estado.ingreso.pendiente > 0 ? `Falta por cobrar ${fmt0(s.estado.ingreso.pendiente)}` : "Todo cobrado"}>
      </Hero>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <div className="card"><div className="label">Ingresos del mes</div><div className="mt-1 text-2xl font-semibold">{fmt0(s.ingresos)}</div>
          {s.ingresosPuntuales > 0 && <div className="mt-1 text-xs text-ink2">incluye {fmt0(s.ingresosPuntuales)} puntuales</div>}</div>
        <div className="card"><div className="label">Pendiente de cobrar</div>
          <div className={`mt-1 text-2xl font-semibold ${s.estado.ingreso.pendiente > 0 ? "text-bad" : "text-good"}`}>{fmt0(s.estado.ingreso.pendiente)}</div></div>
        <div className="card col-span-2 lg:col-span-1"><div className="label">Pendiente de pagar</div>
          <div className={`mt-1 text-2xl font-semibold ${s.estado.fijo.pendiente > 0 ? "text-bad" : "text-good"}`}>{fmt0(s.estado.fijo.pendiente)}</div></div>
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <Section d={d} s={s} month={month} section="ingreso" />
        <Section d={d} s={s} month={month} section="fijo" />
      </section>

      <div className="card">
        <div className="label mb-3">Ingresos puntuales de {MONTHS[month - 1].toLowerCase()}</div>
        {puntuales.length > 0 && (
          <ul className="mb-3 divide-y divide-line">
            {puntuales.map((i) => (
              <li key={i.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="tnum w-12 text-muted">{i.date.slice(8, 10)}/{i.date.slice(5, 7)}</span>
                <span className="flex-1 font-medium">{i.concept}{i.notes && <span className="ml-2 text-xs font-normal text-muted">{i.notes}</span>}</span>
                <span className="tnum">{fmt(i.amount)}</span>
                <form action={deleteOneOffIncome}><input type="hidden" name="id" value={i.id} /><button className="text-muted hover:text-bad" aria-label="Eliminar">×</button></form>
              </li>
            ))}
          </ul>
        )}
        <form action={saveOneOffIncome} className="grid grid-cols-2 gap-2 sm:grid-cols-[auto_2fr_1fr_2fr_auto]">
          <input className="input" type="date" name="date" required defaultValue={defaultDate} aria-label="Fecha" />
          <input className="input" name="concept" placeholder="Concepto (venta, devolución…)" required aria-label="Concepto" />
          <input className="input tnum" name="amount" inputMode="decimal" placeholder="Importe €" required aria-label="Importe" />
          <input className="input" name="notes" placeholder="Notas" aria-label="Notas" />
          <button className="btn col-span-2 sm:col-span-1">Añadir</button>
        </form>
      </div>
    </div>
  );
}
