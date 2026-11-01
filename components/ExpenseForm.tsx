import { saveExpense } from "@/app/actions";
import type { Category, Expense, PaymentMethod } from "@/lib/types";

export default function ExpenseForm({ categories, methods, defaultDate, expense, compact }: {
  categories: Category[]; methods: PaymentMethod[]; defaultDate: string; expense?: Expense; compact?: boolean;
}) {
  return (
    <form action={saveExpense} className={`grid gap-2 ${compact ? "sm:grid-cols-2" : "sm:grid-cols-6"}`}>
      {expense && <input type="hidden" name="id" value={expense.id} />}
      <input className="input" type="date" name="date" required defaultValue={expense?.date ?? defaultDate} aria-label="Fecha" />
      <select className="input" name="category_id" defaultValue={expense?.category_id ?? ""} aria-label="Categoría" required>
        <option value="" disabled>Categoría…</option>
        {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <input className={`input ${compact ? "" : "sm:col-span-2"}`} name="description" placeholder="Descripción (comercio)" defaultValue={expense?.description ?? ""} />
      <input className="input tnum" name="amount" inputMode="decimal" placeholder="Importe €" required defaultValue={expense?.amount ?? ""} aria-label="Importe" />
      <select className="input" name="payment_method" defaultValue={expense?.payment_method ?? methods[0]?.name ?? ""} aria-label="Método de pago">
        <option value="">Método…</option>
        {methods.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
      </select>
      <input className={`input ${compact ? "" : "sm:col-span-5"}`} name="notes" placeholder="Notas (opcional)" defaultValue={expense?.notes ?? ""} />
      <button className="btn">{expense ? "Guardar" : "Añadir gasto"}</button>
    </form>
  );
}
