import Link from "next/link";
import ExpenseForm from "@/components/ExpenseForm";
import Hero from "@/components/Hero";
import MonthPicker, { currentMonth } from "@/components/MonthPicker";
import MovementList from "@/components/MovementList";
import { deleteExpense } from "@/app/actions";
import { categoryIcon } from "@/lib/categoryIcon";
import { firstMonth, fmt, fmt0, monthOf, monthSummary } from "@/lib/finance";
import { loadYear } from "@/lib/data";

export const dynamic = "force-dynamic";

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
          : <MovementList expenses={list} categories={d.categories} action={(e) => (
              <details className="relative">
                <summary className="cursor-pointer list-none px-1 text-muted hover:text-accent" aria-label="Editar">⋯</summary>
                <div className="absolute right-0 z-10 mt-1 w-80 rounded-2xl border border-line bg-surface p-3 shadow-xl">
                  <ExpenseForm compact expense={e} categories={d.categories} methods={d.paymentMethods} defaultDate={e.date} />
                  {e.notes && <p className="mt-2 text-xs text-muted">{e.notes}</p>}
                  <form action={deleteExpense} className="mt-2">
                    <input type="hidden" name="id" value={e.id} />
                    <button className="text-xs text-bad">Eliminar</button>
                  </form>
                </div>
              </details>
            )} />}
      </div>

      <details className="card">
        <summary className="cursor-pointer list-none font-semibold">+ Apuntar un gasto a mano</summary>
        <div className="mt-3"><ExpenseForm categories={d.categories} methods={d.paymentMethods} defaultDate={defaultDate} /></div>
      </details>
    </div>
  );
}
