import Hero from "@/components/Hero";
import Link from "next/link";
import CellInput from "@/components/CellInput";
import NextMonthToggle from "@/components/NextMonthToggle";
import YearSwitcher from "@/components/YearSwitcher";
import { addBudgetLine, deleteBudgetLine, fillPlannedYear, setBudgetCell } from "@/app/actions";
import { MONTHS_SHORT, fmt0, isAdjusted, lineValue, monthSummary, plannedValue } from "@/lib/finance";
import { getUser, loadYear } from "@/lib/data";
import type { BudgetLine, Section } from "@/lib/types";

export const dynamic = "force-dynamic";

const SECTIONS: { key: Section; title: string; total: string }[] = [
  { key: "ingreso", title: "Ingresos", total: "Total ingresos" },
  { key: "fijo", title: "Gastos fijos", total: "Total gastos fijos" },
  { key: "provision", title: "Provisión gastos variables", total: "Total provisión" },
];

export default async function PresupuestoPage({ searchParams }: { searchParams: Promise<{ modo?: string; nuevo?: string }> }) {
  const sp = await searchParams;
  const modo = sp.modo === "fijo" ? "fijo" : "ajustes";
  const d = await loadYear();
  const { supabase } = await getUser();
  const { data: yearRows } = await supabase.from("budget_values").select("year").order("year").limit(5000);
  const years = Array.from(new Set((yearRows ?? []).map((r) => r.year as number)));
  const cutoff = d.settings?.cutoff_day ?? 25;
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const sums = months.map((m) => monthSummary(d, m));
  const yearTotal = (f: (i: number) => number) => months.reduce((s, m) => s + f(m - 1), 0);

  const row = (line: BudgetLine) => {
    const vals = months.map((m) => (modo === "fijo" ? plannedValue(d, line, m) : lineValue(d, line, m)));
    return (
      <tr key={line.id}>
        <td className="sticky left-0 z-[1] min-w-[11rem] bg-surface">
          <div className="flex items-center gap-2">
            <span className="font-medium">{line.name}</span>
            {line.is_annual_fund && <Link href="/plan#anuales" className="text-[10px] text-accent">auto</Link>}
            {(line.section === "ingreso" || line.section === "fijo") && !line.is_annual_fund && (modo === "fijo" || line.next_month) && (
              <NextMonthToggle lineId={line.id} value={!!line.next_month} cutoff={cutoff} />
            )}
            {modo === "fijo" && !line.is_annual_fund && (
              <form action={deleteBudgetLine} className="ml-auto">
                <input type="hidden" name="id" value={line.id} />
                <button className="text-xs text-muted hover:text-bad" aria-label={`Eliminar ${line.name}`}>×</button>
              </form>
            )}
          </div>
        </td>
        {months.map((m, i) => {
          if (modo === "fijo" && line.is_annual_fund) return <td key={m} className="tnum px-1.5 text-right text-ink2">{fmt0(vals[i])}</td>;
          const adj = isAdjusted(d, line, m);
          const raw = d.values.find((v) => v.line_id === line.id && v.month === m);
          const save = async (v: string) => {
            "use server";
            await setBudgetCell(line.id, d.year, m, modo === "fijo" ? "planned" : "adjusted", v);
          };
          return (
            <td key={m} className="px-0.5 py-0.5">
              <CellInput
                ariaLabel={`${line.name} ${MONTHS_SHORT[m - 1]}`}
                value={modo === "fijo" ? vals[i] : raw?.adjusted ?? null}
                placeholder={modo === "ajustes" ? String(Math.round(plannedValue(d, line, m))) : undefined}
                highlight={modo === "ajustes" && adj}
                onSave={save}
              />
            </td>
          );
        })}
        <td className="tnum px-2 text-right font-medium">{fmt0(vals.reduce((a, b) => a + b, 0))}</td>
        {modo === "fijo" && !line.is_annual_fund && (
          <td className="px-1">
            <CellInput ariaLabel={`Copiar a todo el año ${line.name}`} value={null} placeholder="todo el año"
              onSave={async (v: string) => { "use server"; await fillPlannedYear(line.id, d.year, v); }} />
          </td>
        )}
      </tr>
    );
  };

  const totalRow = (label: string, f: (i: number) => number, cls = "") => (
    <tr key={label} className={`bg-line/30 ${cls}`}>
      <td className="sticky left-0 z-[1] bg-[rgb(var(--line)/0.3)] font-semibold backdrop-blur">{label}</td>
      {months.map((m) => <td key={m} className="tnum px-2 text-right font-semibold">{fmt0(f(m - 1))}</td>)}
      <td className="tnum px-2 text-right font-semibold">{fmt0(yearTotal(f))}</td>
    </tr>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Hero kicker="Tabla del presupuesto" title={String(d.year)}>
            <YearSwitcher year={d.year} years={years} dark />
          </Hero>
          <div className="mt-3" />
          {sp.nuevo && <p className="mb-2 rounded-xl bg-good/10 px-3 py-2 text-sm text-good">✓ Creado {sp.nuevo} con lo previsto del año anterior. Revisa el plan fijo por si algo cambia.</p>}
          <p className="text-sm text-ink2">
            {modo === "fijo"
              ? `Plan fijo de cada mes. Edítalo solo si cambia el plan. La última columna copia un importe a los 12 meses. Con ↪, un ingreso o recibo que llega después del día ${cutoff} cuenta para el mes siguiente.`
              : "Escribe el importe REAL solo en el mes que se desvíe de lo fijo (vacío = vale lo fijo; un 0 también cuenta). En naranja, los meses ajustados."}
          </p>
        </div>
        <div className="flex rounded-lg border border-line p-0.5 text-sm">
          <Link href="/presupuesto/tabla?modo=ajustes" className={`rounded-md px-3 py-1.5 ${modo === "ajustes" ? "bg-accent text-white" : "text-ink2"}`}>Mensual + ajustes</Link>
          <Link href="/presupuesto/tabla?modo=fijo" className={`rounded-md px-3 py-1.5 ${modo === "fijo" ? "bg-accent text-white" : "text-ink2"}`}>Plan fijo</Link>
        </div>
      </div>

      <div className="card overflow-x-auto p-0 sm:p-0">
        <table className="data min-w-[1100px]">
          <thead>
            <tr>
              <th className="sticky left-0 z-[1] bg-surface">Concepto</th>
              {MONTHS_SHORT.map((m) => <th key={m} className="text-right">{m}</th>)}
              <th className="text-right">Total</th>
              {modo === "fijo" && <th className="text-right">Todo el año</th>}
            </tr>
          </thead>
          <tbody>
            {SECTIONS.map((sec) => {
              const lines = d.lines.filter((l) => l.section === sec.key);
              return [
                <tr key={sec.key + "h"}><td colSpan={15} className="pt-4 text-xs font-semibold uppercase tracking-wide text-accent">{sec.title}</td></tr>,
                ...lines.map(row),
                modo === "fijo" ? (
                  <tr key={sec.key + "add"}>
                    <td colSpan={15}>
                      <form action={addBudgetLine} className="flex max-w-sm gap-2">
                        <input type="hidden" name="section" value={sec.key} />
                        <input className="input py-1" name="name" placeholder={`Nuevo concepto de ${sec.title.toLowerCase()}`} />
                        <button className="btn-ghost py-1">Añadir</button>
                      </form>
                    </td>
                  </tr>
                ) : null,
                totalRow(sec.total, (i) => (sec.key === "ingreso" ? sums[i].ingresos : sec.key === "fijo" ? sums[i].fijos : sums[i].prevision)),
              ];
            })}

            {modo === "ajustes" && (
              <>
                <tr><td colSpan={15} className="pt-4 text-xs font-semibold uppercase tracking-wide text-accent">Gastos variables</td></tr>
                <tr>
                  <td className="sticky left-0 bg-surface">Gasto variable real</td>
                  {sums.map((s) => <td key={s.month} className="tnum px-2 text-right"><Link href={`/gastos?m=${s.month}`} className="hover:text-accent">{fmt0(s.variableReal)}</Link></td>)}
                  <td className="tnum px-2 text-right">{fmt0(yearTotal((i) => sums[i].variableReal))}</td>
                </tr>
                <tr>
                  <td className="sticky left-0 bg-surface">Desviación (previsto − real)</td>
                  {sums.map((s) => <td key={s.month} className={`tnum px-2 text-right ${s.desviacion < 0 ? "text-bad" : "text-good"}`}>{fmt0(s.desviacion)}</td>)}
                  <td className="tnum px-2 text-right">{fmt0(yearTotal((i) => sums[i].desviacion))}</td>
                </tr>
                <tr>
                  <td className="sticky left-0 bg-surface text-ink2">Mes</td>
                  {sums.map((s) => (
                    <td key={s.month} className={`px-2 text-right text-xs ${s.periodo === "actual" ? "font-semibold text-accent" : "text-muted"}`}
                      title={s.periodo === "pasado" ? "Usa el gasto real" : s.periodo === "actual" ? "Usa lo previsto, o lo real si ya lo supera" : "Usa la provisión"}>
                      {s.periodo === "pasado" ? "real" : s.periodo === "actual" ? "en curso" : "previsto"}
                    </td>
                  ))}
                  <td></td>
                </tr>
                {totalRow("Gasto variable considerado", (i) => sums[i].variableConsiderado)}
                <tr><td colSpan={15} className="h-3"></td></tr>
                {totalRow("Total gastos", (i) => sums[i].totalGastos)}
                {totalRow("Resultado (ingresos − gastos)", (i) => sums[i].resultado)}
                <tr>
                  <td className="sticky left-0 bg-surface">Aportación neta a inversión</td>
                  {sums.map((s) => <td key={s.month} className="tnum px-2 text-right">{fmt0(s.inversion)}</td>)}
                  <td className="tnum px-2 text-right">{fmt0(yearTotal((i) => sums[i].inversion))}</td>
                </tr>
                {totalRow("Resultado tras inversión", (i) => sums[i].resultadoTrasInversion)}
                <tr>
                  <td className="sticky left-0 bg-surface text-ink2">Saldo fondo anuales (fin de mes)</td>
                  {sums.map((s) => <td key={s.month} className={`tnum px-2 text-right text-ink2 ${s.fondoAnuales < 0 ? "text-bad" : ""}`}>{fmt0(s.fondoAnuales)}</td>)}
                  <td></td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
