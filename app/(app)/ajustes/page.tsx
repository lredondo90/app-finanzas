import ImportForm from "@/components/ImportForm";
import { addCategory, addPaymentMethod, deleteCategory, deletePaymentMethod, saveSettings } from "@/app/actions";
import { loadYear } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function AjustesPage() {
  const d = await loadYear();
  const hasData = d.lines.length > 0 || d.expenses.length > 0;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Ajustes</h1>

      <div className="card">
        <div className="label mb-1">Importar desde Excel</div>
        <p className="mb-3 text-sm text-ink2">
          Sube tu <b>Presupuesto_2026.xlsx</b> (o uno con la misma estructura). Se cargan los conceptos fijos y ajustes, meses cerrados,
          gastos variables, categorías, anuales, planes, operaciones, bancos e histórico.
        </p>
        <ImportForm hasData={hasData} />
      </div>

      <form action={saveSettings} className="card flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="year">Año activo</label>
          <input id="year" className="input tnum mt-1 w-28" name="year" type="number" defaultValue={d.year} />
        </div>
        <input type="hidden" name="annual_fund_initial" value={d.settings?.annual_fund_initial ?? 0} />
        <button className="btn-ghost">Guardar</button>
        <p className="w-full text-xs text-muted">Para empezar un año nuevo, cambia el año y rellena el plan fijo en Presupuesto.</p>
      </form>

      <section className="grid gap-3 md:grid-cols-2">
        <div className="card">
          <div className="label mb-3">Categorías de gasto variable</div>
          <ul className="mb-3 divide-y divide-line">
            {d.categories.map((c) => (
              <li key={c.id} className="flex items-center justify-between py-1.5 text-sm">
                {c.name}
                <form action={deleteCategory}><input type="hidden" name="id" value={c.id} /><button className="text-muted hover:text-bad" aria-label={`Eliminar ${c.name}`}>×</button></form>
              </li>
            ))}
          </ul>
          <form action={addCategory} className="flex gap-2">
            <input className="input" name="name" placeholder="Nueva categoría" required />
            <button className="btn-ghost">Añadir</button>
          </form>
        </div>
        <div className="card">
          <div className="label mb-3">Métodos de pago</div>
          <ul className="mb-3 divide-y divide-line">
            {d.paymentMethods.map((m) => (
              <li key={m.id} className="flex items-center justify-between py-1.5 text-sm">
                {m.name}
                <form action={deletePaymentMethod}><input type="hidden" name="id" value={m.id} /><button className="text-muted hover:text-bad" aria-label={`Eliminar ${m.name}`}>×</button></form>
              </li>
            ))}
          </ul>
          <form action={addPaymentMethod} className="flex gap-2">
            <input className="input" name="name" placeholder="Nuevo método" required />
            <button className="btn-ghost">Añadir</button>
          </form>
        </div>
      </section>
    </div>
  );
}
