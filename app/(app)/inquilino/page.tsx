import Hero from "@/components/Hero";
import ShareList from "@/components/ShareList";
import { deleteTenantEntry, importTenantList, saveTenantEntry } from "@/app/actions";
import { fmt, todayMadrid } from "@/lib/finance";
import { getUser } from "@/lib/data";

export const dynamic = "force-dynamic";

const es = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;

export default async function InquilinoPage() {
  const { supabase } = await getUser();
  const { data, error } = await supabase.from("tenant_entries").select("id, date, concept, amount, movement_id").order("date", { ascending: false }).order("created_at", { ascending: false });
  const rows = (data ?? []).map((r) => ({ ...r, amount: Number(r.amount) }));
  const total = rows.reduce((a, r) => a + r.amount, 0);
  const gastos = rows.filter((r) => r.amount > 0);
  const pagos = rows.filter((r) => r.amount < 0);
  const sumGastos = gastos.reduce((a, r) => a + r.amount, 0);
  const sumPagos = -pagos.reduce((a, r) => a + r.amount, 0);
  const t = todayMadrid();
  const today = `${t.year}-${String(t.month).padStart(2, "0")}-${String(t.day).padStart(2, "0")}`;

  // Texto para enviar: gastos por fecha, pagos y lo que queda
  const asc = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const text = [
    "Gastos pendientes:",
    ...asc.filter((r) => r.amount > 0).map((r) => `${es(r.date)} · ${r.concept} · ${fmt(r.amount)}`),
    ...(pagos.length ? ["", "Pagos recibidos:", ...asc.filter((r) => r.amount < 0).map((r) => `${es(r.date)} · ${r.concept} · ${fmt(-r.amount)}`)] : []),
    "",
    `Total pendiente: ${fmt(total)}`,
  ].join("\n");

  return (
    <div className="space-y-4">
      <Hero kicker="Tu inquilino te debe" value={fmt(Math.max(0, total))}
        sub={total < -0.005 ? `Te ha pagado ${fmt(-total)} de más` : `${fmt(sumGastos)} de gastos · ${fmt(sumPagos)} pagado`} />

      {error && <p className="card bg-bad/10 text-sm text-bad">No se ha podido leer la lista: {error.message}</p>}

      {rows.length > 0 && <div className="card"><ShareList text={text} title="Gastos pendientes" /></div>}

      <section className="card">
        <h2 className="section-title mb-1">Gastos y pagos</h2>
        {rows.length === 0 && <p className="py-6 text-center text-sm text-muted">Aún no hay nada apuntado. Marca un gasto como «Del inquilino» en Movimientos o añádelo aquí abajo.</p>}
        <ul className="divide-y divide-line/70">
          {rows.map((r) => (
            <li key={r.id} className="flex min-h-[3.25rem] items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{r.concept}</div>
                <div className="truncate text-xs text-muted">{es(r.date)} · {r.amount < 0 ? "Pago recibido" : "Te lo debe"}{r.movement_id ? " · del banco" : ""}</div>
              </div>
              <div className={`tnum shrink-0 font-semibold ${r.amount < 0 ? "text-good" : ""}`}>{r.amount < 0 ? `−${fmt(-r.amount)}` : fmt(r.amount)}</div>
              <form action={deleteTenantEntry}>
                <input type="hidden" name="id" value={r.id} />
                <button className="flex h-11 w-9 items-center justify-center text-muted hover:text-bad" aria-label={`Quitar ${r.concept}`}>×</button>
              </form>
            </li>
          ))}
        </ul>
        {rows.length > 0 && (
          <div className="mt-2 flex justify-between border-t border-line pt-3 font-semibold"><span>Te debe</span><span className="tnum">{fmt(total)}</span></div>
        )}
      </section>

      <section className="card">
        <h2 className="section-title mb-2">Añadir a mano</h2>
        <form action={saveTenantEntry} className="grid grid-cols-2 gap-2">
          <select className="input col-span-2" name="kind" aria-label="Tipo" defaultValue="gasto">
            <option value="gasto">Gasto que me debe</option>
            <option value="pago">Pago que me ha hecho</option>
          </select>
          <input className="input" type="date" name="date" required defaultValue={today} aria-label="Fecha" />
          <input className="input tnum" name="amount" inputMode="decimal" placeholder="Importe €" required aria-label="Importe" />
          <input className="input col-span-2" name="concept" placeholder="Concepto (luz, comunidad, alquiler…)" aria-label="Concepto" />
          <button className="btn col-span-2">Añadir</button>
        </form>
      </section>

      <details className="card">
        <summary className="cursor-pointer list-none font-semibold">Pegar un listado</summary>
        <form action={importTenantList} className="mt-3 space-y-2">
          <p className="text-xs text-muted">Una línea por gasto: fecha; concepto; importe. Por ejemplo: 05/10/2026; Luz; 61,47</p>
          <textarea className="input h-36" name="list" aria-label="Listado" placeholder={"05/10/2026; Luz; 61,47\n02/11/2026; Comunidad; 118,40"} />
          <button className="btn">Cargar listado</button>
        </form>
      </details>
    </div>
  );
}
