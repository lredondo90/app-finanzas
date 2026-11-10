import Link from "next/link";
import ExpenseForm from "@/components/ExpenseForm";
import Hero from "@/components/Hero";
import MonthPicker, { currentMonth } from "@/components/MonthPicker";
import MovementList from "@/components/MovementList";
import MoveSelect from "@/components/MoveSelect";
import { deleteExpense } from "@/app/actions";
import { categoryIcon } from "@/lib/categoryIcon";
import { periodWindow } from "@/lib/accounting";
import { loadPeriods } from "@/lib/periods";
import { firstMonth, fmt, fmt0, monthOf, monthSummary, plannedValue } from "@/lib/finance";
import { getUser, loadYear } from "@/lib/data";

export const dynamic = "force-dynamic";

const signed = (v: number) => (Math.abs(v) < 0.5 ? "0 €" : `${v > 0 ? "+" : "−"}${fmt0(Math.abs(v))}`);

export default async function GastosPage({ searchParams }: { searchParams: Promise<{ m?: string; c?: string }> }) {
  const sp = await searchParams;
  const d = await loadYear();
  const first = firstMonth(d);
  const month = currentMonth(sp.m, d.year, first);
  const all = d.expenses.filter((e) => monthOf(e.date) === month);
  const list = sp.c ? all.filter((e) => (sp.c === "none" ? !e.category_id : e.category_id === sp.c)) : all;
  const total = list.reduce((s, e) => s + Number(e.amount), 0);
  const s = monthSummary(d, month);
  const cats = s.porCategoria.filter((c) => c.total > 0).sort((a, b) => b.total - a.total);
  // Movimientos del banco del mes: los gastos se editan desde su gasto; el resto (recibos, ingresos, inversión, no contar) aquí abajo
  const { supabase } = await getUser();
  const mm = String(month).padStart(2, "0");
  const next = month === 12 ? `${d.year + 1}-01-01` : `${d.year}-${String(month + 1).padStart(2, "0")}-01`;
  // Ingresos y recibos van de nómina a nómina: se traen también los del final del mes anterior que cuentan para este
  const win = periodWindow(await loadPeriods(supabase), d.year, month);
  const start = `${d.year}-${mm}-01`;
  const from = win.from < start ? win.from : start;
  const { data: movs } = await supabase.from("bank_movements")
    .select("id, bank, date, description, detail, amount, action, category_id, line_id, expense_id, annual_id")
    .gte("date", from).lt("date", next).order("date", { ascending: false }).order("created_at", { ascending: false });
  const { data: tenantRows } = await supabase.from("tenant_entries").select("movement_id").not("movement_id", "is", null);
  const tenantIds = new Set((tenantRows ?? []).map((t) => t.movement_id as string));
  const movsT = (movs ?? []).map((m) => ({ ...m, tenant: tenantIds.has(m.id) }));
  const byExpense = new Map(movsT.filter((m) => m.expense_id).map((m) => [m.expense_id as string, m]));
  // Los de las cuentas conjuntas (no cuentan, pero llevan su categoría para Casa) se editan en Casa
  const others = sp.c ? [] : movsT.filter((m) => !m.expense_id && !(m.action === "ignorar" && m.category_id) && (m.date >= start ? m.date < win.to || m.action !== "fijo" && m.action !== "ingreso" : m.date >= win.from));
  const lineName = (id: string | null) => d.lines.find((l) => l.id === id)?.name;
  const label = (m: { action: string; line_id: string | null; annual_id: string | null; tenant: boolean }) =>
    m.tenant ? "Del inquilino"
    : m.annual_id ? `Recibo anual · ${d.annuals.find((a) => a.id === m.annual_id)?.name ?? ""}`
    : m.action === "fijo" ? `Recibo · ${lineName(m.line_id) ?? "sin concepto"}`
    : m.action === "ingreso" ? `Ingreso · ${lineName(m.line_id) ?? "sin concepto"}`
    : m.action === "puntual" ? "Ingreso puntual" : m.action === "inversion" ? "Inversión" : "No cuenta";
  // Desviaciones de lo ya cobrado o pagado frente al plan (lo pendiente cuenta con el plan)
  const devs = s.lineas
    .filter((x) => (x.line.section === "ingreso" || x.line.section === "fijo") && !x.line.is_annual_fund && x.done)
    .map((x) => {
      const plan = plannedValue(d, x.line, month);
      const income = x.line.section === "ingreso";
      return { id: x.line.id, name: x.line.name, income, plan, real: x.value, dev: income ? x.value - plan : plan - x.value };
    })
    .filter((x) => Math.abs(x.dev) >= 0.5);
  const devIng = devs.filter((x) => x.income).reduce((a, x) => a + x.dev, 0);
  const devFij = devs.filter((x) => !x.income).reduce((a, x) => a + x.dev, 0);
  const queda = s.prevision - s.variableReal;
  const resultado = devIng + devFij + queda;
  const defaultDate = `${d.year}-${String(month).padStart(2, "0")}-${String(Math.min(new Date().getDate(), 28)).padStart(2, "0")}`;

  return (
    <div className="space-y-4">
      <Hero top={<MonthPicker month={month} year={d.year} base="/gastos" min={first} />} value={fmt(total)} sub={`${list.length} movimientos${sp.c ? " en esta categoría" : ""} · previsto ${fmt0(s.prevision)}`}>
      </Hero>

      {/* Categorías como fichas */}
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <Link href={`/gastos?m=${month}`} className={`shrink-0 rounded-full px-4 py-2 text-sm ${!sp.c ? "bg-accent font-semibold text-white" : "bg-surface text-ink2 shadow-sm"}`}>Todas</Link>
        {cats.map((c) => {
          const ic = categoryIcon(c.name);
          const on = sp.c === (c.id ?? "none");
          return (
            <Link key={c.id ?? "none"} href={`/gastos?m=${month}&c=${c.id ?? "none"}`}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm ${on ? "bg-accent font-semibold text-white" : "bg-surface text-ink2 shadow-sm"}`}>
              <span aria-hidden>{ic.emoji}</span>{c.name}<span className={`tnum ${on ? "text-white/80" : "text-muted"}`}>{fmt0(c.total)}</span>
            </Link>
          );
        })}
      </div>

      <div className="card">
        {list.length === 0
          ? <p className="py-8 text-center text-sm text-muted">No hay movimientos en este mes.</p>
          : <MovementList expenses={list} categories={d.categories} edit={(e) => {
              const m = byExpense.get(e.id);
              if (!m) return (
                <>
                  <ExpenseForm compact expense={e} categories={d.categories} methods={d.paymentMethods} defaultDate={e.date} />
                  <form action={deleteExpense} className="mt-3 text-right">
                    <input type="hidden" name="id" value={e.id} />
                    <button className="text-xs text-bad">Eliminar</button>
                  </form>
                </>
              );
              return (
                <>
                  <label className="text-xs text-muted">Qué es (viene de {m.bank}). Se guarda al elegir</label>
                  <MoveSelect m={m} categories={d.categories} lines={d.lines} annuals={d.annuals} className="mt-1" />
                  <details className="mt-1">
                    <summary className="cursor-pointer list-none text-xs text-accent">Cambiar fecha, importe o descripción ›</summary>
                    <div className="mt-2"><ExpenseForm compact expense={e} categories={d.categories} methods={d.paymentMethods} defaultDate={e.date} /></div>
                  </details>
                </>
              );
            }} />}
      </div>

      {others.length > 0 && (
        <div className="card">
          <h2 className="section-title">Ingresos, recibos y otros del banco</h2>
          <p className="mb-2 text-xs text-muted">No cuentan como gasto del día a día. Si alguno está mal, cambia aquí qué es: el presupuesto y el patrimonio se actualizan al momento.</p>
          <ul className="divide-y divide-line/70">
            {others.map((m) => {
              const amount = Number(m.amount);
              return (
                <li key={m.id}>
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-center gap-3 py-2.5">
                      <span className="tnum w-11 shrink-0 text-xs text-muted">{m.date.slice(8, 10)}/{m.date.slice(5, 7)}</span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{m.description}</div>
                        <div className="truncate text-xs text-muted">{label(m)} · {m.bank}</div>
                      </div>
                      <div className={`tnum shrink-0 font-semibold ${amount > 0 ? "text-good" : ""}`}>{fmt(amount)}</div>
                      <span className="shrink-0 text-xs text-muted transition group-open:rotate-90" aria-hidden>›</span>
                    </summary>
                    <div className="mb-3 rounded-2xl bg-page p-3">
                      {m.detail && <p className="mb-2 text-xs text-muted">{m.detail}</p>}
                      <label className="text-xs text-muted">Qué es. Se guarda al elegir</label>
                      <MoveSelect m={m} categories={d.categories} lines={d.lines} annuals={d.annuals} className="mt-1" />
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {!sp.c && (
        <section className="card space-y-2">
          <h2 className="section-title">Desviaciones frente a tu plan</h2>
          {devs.length === 0
            ? <p className="text-sm text-muted">Los ingresos y recibos cobrados o pagados coinciden con lo presupuestado.</p>
            : <ul className="divide-y divide-line/70">
                {devs.map((x) => (
                  <li key={x.id} className="flex items-center gap-3 py-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{x.name}</div>
                      <div className="text-xs text-muted">{x.income ? "Cobrado" : "Pagado"} {fmt(x.real)} · plan {fmt(x.plan)}</div>
                    </div>
                    <span className={`tnum shrink-0 font-semibold ${x.dev >= 0 ? "text-good" : "text-bad"}`}>{signed(x.dev)}</span>
                  </li>
                ))}
              </ul>}
          <p className="text-xs text-muted">En verde lo que va a tu favor (cobras más o pagas menos de lo previsto); en rojo, en contra. Lo pendiente cuenta con lo presupuestado.</p>
        </section>
      )}

      {!sp.c && s.prevision > 0 && (
        <section className="card space-y-2">
          <h2 className="section-title">Resultado del mes a día de hoy</h2>
          <div className="flex justify-between text-sm"><span className="text-ink2">Desviación en ingresos</span><span className={`tnum font-semibold ${devIng >= 0 ? "text-good" : "text-bad"}`}>{signed(devIng)}</span></div>
          <div className="flex justify-between text-sm"><span className="text-ink2">Desviación en recibos</span><span className={`tnum font-semibold ${devFij >= 0 ? "text-good" : "text-bad"}`}>{signed(devFij)}</span></div>
          <div className="flex justify-between text-sm"><span className="text-ink2">Gastado: {fmt0(s.variableReal)} de {fmt0(s.prevision)}</span><span className={`tnum font-semibold ${queda >= 0 ? "text-good" : "text-bad"}`}>{queda >= 0 ? `te quedan ${fmt0(queda)}` : `${fmt0(-queda)} de más`}</span></div>
          <div className="flex justify-between border-t border-line pt-2 font-semibold"><span>Resultado</span><span className={`tnum ${resultado >= 0 ? "text-good" : "text-bad"}`}>{signed(resultado)}</span></div>
          <p className="text-xs text-muted">
            {resultado >= 0
              ? `Si no gastas más este mes, ahorrarás ${fmt0(resultado)} más de lo que tenías previsto.`
              : `Aunque no gastes más este mes, ahorrarás ${fmt0(-resultado)} menos de lo que tenías previsto.`}
            {" "}Es la suma de las desviaciones y lo que te queda de tus {fmt0(s.prevision)}.
          </p>
        </section>
      )}

      <details className="card">
        <summary className="cursor-pointer list-none font-semibold">+ Apuntar un gasto a mano</summary>
        <div className="mt-3"><ExpenseForm categories={d.categories} methods={d.paymentMethods} defaultDate={defaultDate} /></div>
      </details>
    </div>
  );
}
