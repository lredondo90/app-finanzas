import Hero from "@/components/Hero";
import YearSwitcher from "@/components/YearSwitcher";
import { addCategory, addPaymentMethod, deleteCategory, deletePaymentMethod, saveSettings } from "@/app/actions";
import { getUser, loadYear } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function AjustesPage() {
  const d = await loadYear();
  const { supabase } = await getUser();
  const { data: yearRows } = await supabase.from("budget_values").select("year").order("year").limit(5000);
  const years = Array.from(new Set((yearRows ?? []).map((r) => r.year as number)));
  const start = d.settings?.start_date;

  return (
    <div className="space-y-4">
      <Hero kicker="Mis Finanzas" title="Ajustes" />

      <div className="card space-y-3">
        <div className="label">Año</div>
        <YearSwitcher year={d.year} years={years} />
        <p className="text-xs text-muted">«Crear» copia lo previsto de cada concepto mes a mes; los ajustes y los recibidos/pagados empiezan vacíos.</p>
      </div>

      <form action={saveSettings} className="card space-y-3">
        <div className="label">Mes de la nómina</div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-sm text-ink2" htmlFor="cutoff_day">Día de corte</label>
            <input id="cutoff_day" className="input tnum mt-1 w-24" name="cutoff_day" type="number" min={1} max={28} defaultValue={d.settings?.cutoff_day ?? 25} />
          </div>
          <input type="hidden" name="year" value={d.year} />
          <input type="hidden" name="annual_fund_initial" value={d.settings?.annual_fund_initial ?? 0} />
          <button className="btn-ghost">Guardar</button>
        </div>
        <p className="text-xs text-muted">
          Los conceptos marcados con ↪ en Presupuesto (la nómina, recibos de fin de mes) cuentan para el mes siguiente si llegan después de este día.
          Los gastos del día a día se quedan en su mes.
          {start && <> La app empieza el {new Date(`${start}T00:00:00`).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}: lo anterior no se tiene en cuenta.</>}
        </p>
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
