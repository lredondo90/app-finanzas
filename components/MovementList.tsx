import { categoryIcon } from "@/lib/categoryIcon";
import { fmt } from "@/lib/finance";
import type { Category, Expense } from "@/lib/types";

const dayLabel = (date: string) => {
  const d = new Date(`${date}T12:00:00`);
  const today = new Date();
  const y = new Date(); y.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return "Hoy";
  if (same(d, y)) return "Ayer";
  return d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
};

/** Movimientos agrupados por día, con icono de la categoría (estilo app del banco) */
export default function MovementList({ expenses, categories, action }: {
  expenses: Expense[]; categories: Category[]; action?: (e: Expense) => React.ReactNode;
}) {
  const groups: { date: string; items: Expense[] }[] = [];
  for (const e of expenses) {
    const g = groups.find((x) => x.date === e.date);
    if (g) g.items.push(e); else groups.push({ date: e.date, items: [e] });
  }
  const catName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? "Sin categoría";
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <div key={g.date}>
          <div className="mb-1 flex items-baseline justify-between px-1 text-xs font-medium text-muted first-letter:uppercase">
            <span className="first-letter:uppercase">{dayLabel(g.date)}</span>
            <span className="tnum">{fmt(-g.items.reduce((s, e) => s + Number(e.amount), 0))}</span>
          </div>
          <ul className="divide-y divide-line/70">
            {g.items.map((e) => {
              const cat = catName(e.category_id);
              const ic = categoryIcon(cat);
              const amount = Number(e.amount);
              return (
                <li key={e.id} className="flex items-center gap-3 py-2.5">
                  <span className="icon-tile" style={{ background: `rgb(${ic.rgb} / 0.14)` }} aria-hidden>{ic.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{e.description ?? "—"}</div>
                    <div className="truncate text-xs text-muted">{cat}{e.payment_method ? ` · ${e.payment_method}` : ""}</div>
                  </div>
                  <div className={`tnum shrink-0 font-semibold ${amount < 0 ? "text-good" : ""}`}>{fmt(-amount)}</div>
                  {action?.(e)}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
