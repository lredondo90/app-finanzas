import Link from "next/link";
import ExpenseForm from "@/components/ExpenseForm";
import MonthPicker, { currentMonth } from "@/components/MonthPicker";
import { deleteExpense } from "@/app/actions";
import { fmt, monthOf } from "@/lib/finance";
import { loadYear } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function GastosPage({ searchParams }: { searchParams: Promise<{ m?: string; c?: string }> }) {
  const sp = await searchParams;
  const d = await loadYear();
  const month = currentMonth(sp.m, d.year);
  const all = d.expenses.filter((e) => monthOf(e.date) === month);
  const list = sp.c ? all.filter((e) => (sp.c === "none" ? !e.category_id : e.category_id === sp.c)) : all;
  const total = list.reduce((s, e) => s + Number(e.amount), 0);
  const catName = (id: string | null) => d.categories.find((c) => c.id === id)?.name ?? "Sin categoría";
  const defaultDate = `${d.year}-${String(month).padStart(2, "0")}-${String(Math.min(new Date().getDate(), 28)).padStart(2, "0")}`;

  return (
    <div className="space-y-4">
      <MonthPicker month={month} year={d.year} base="/gastos" />

      <Link href="/importar" className="card flex items-center gap-3 border-accent/30 bg-accent/5 hover:bg-accent/10">
        <span className="text-2xl" aria-hidden>⇪</span>
        <span className="flex-1"><b>Importar extracto del banco</b><span className="block text-sm text-ink2">BBVA (Excel), Trade Republic (PDF) u otro Excel/CSV</span></span>
        <span className="text-accent">→</span>
      </Link>

      <div className="card">
        <div className="label mb-3">Nuevo gasto variable</div>
        <ExpenseForm categories={d.categories} methods={d.paymentMethods} defaultDate={defaultDate} />
      </div>

      <div className="card">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Link href={`/gastos?m=${month}`} className={`rounded-full px-3 py-1 text-xs ${!sp.c ? "bg-accent text-white" : "bg-line/60 text-ink2"}`}>Todas</Link>
          {d.categories.map((c) => (
            <Link key={c.id} href={`/gastos?m=${month}&c=${c.id}`}
              className={`rounded-full px-3 py-1 text-xs ${sp.c === c.id ? "bg-accent text-white" : "bg-line/60 text-ink2"}`}>{c.name}</Link>
          ))}
          <span className="ml-auto text-sm">
            <span className="text-muted">{list.length} gastos · </span><span className="tnum font-semibold">{fmt(total)}</span>
          </span>
        </div>

        {list.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">No hay gastos en este mes.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data min-w-[640px]">
              <thead>
                <tr><th>Fecha</th><th>Categoría</th><th>Descripción</th><th className="text-right">Importe</th><th>Pago</th><th>Notas</th><th></th></tr>
              </thead>
              <tbody>
                {list.map((e) => (
                  <tr key={e.id} className="align-top">
                    <td className="tnum whitespace-nowrap text-ink2">{e.date.split("-").reverse().join("/")}</td>
                    <td className="whitespace-nowrap">{catName(e.category_id)}</td>
                    <td className="font-medium">{e.description}</td>
                    <td className="tnum whitespace-nowrap text-right">{fmt(e.amount)}</td>
                    <td className="text-ink2">{e.payment_method}</td>
                    <td className="max-w-[16rem] text-xs text-muted">{e.notes}</td>
                    <td className="whitespace-nowrap text-right">
                      <details className="relative inline-block">
                        <summary className="cursor-pointer list-none text-xs text-accent">Editar</summary>
                        <div className="absolute right-0 z-10 mt-1 w-80 rounded-xl border border-line bg-surface p-3 shadow-xl">
                          <ExpenseForm compact expense={e} categories={d.categories} methods={d.paymentMethods} defaultDate={e.date} />
                          <form action={deleteExpense} className="mt-2">
                            <input type="hidden" name="id" value={e.id} />
                            <button className="text-xs text-bad">Eliminar gasto</button>
                          </form>
                        </div>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
