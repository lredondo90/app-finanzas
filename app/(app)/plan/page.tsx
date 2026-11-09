import Link from "next/link";
import CellInput from "@/components/CellInput";
import Hero from "@/components/Hero";
import YearSwitcher from "@/components/YearSwitcher";
import { deleteAnnual, saveAnnual, savePlanException, setBudgetCell, setPlanLine } from "@/app/actions";
import { MONTHS, MONTHS_SHORT, annualMonthlyQuota, firstMonth, fmt, fmt0 } from "@/lib/finance";
import { getUser, loadYear } from "@/lib/data";
import { jointAccounts } from "@/lib/house";
import type { StoredAccount } from "@/lib/enableBanking";
import { exceptions, extraValue, normalValue, yearPlan } from "@/lib/plan";
import type { BudgetLine, YearData } from "@/lib/types";

export const dynamic = "force-dynamic";

const hasExtra = (d: YearData, l: BudgetLine) => l.section === "ingreso" && (!!l.next_month || /nomina|nómina/i.test(l.name) || extraValue(d, l) > 0);

function LineRow({ d, line }: { d: YearData; line: BudgetLine }) {
  if (line.is_annual_fund) {
    return (
      <div className="flex items-center justify-between gap-3 py-2 text-sm">
        <span>{line.name} <a href="#anuales" className="text-xs text-accent">auto</a></span>
        <span className="tnum pr-1.5 text-ink2">{fmt0(annualMonthlyQuota(d))}</span>
      </div>
    );
  }
  const normal = normalValue(d, line);
  const extra = line.section === "ingreso" ? extraValue(d, line) : 0;
  const save = (field: "normal" | "extra") => async (v: string) => {
    "use server";
    await setPlanLine(line.id, d.year, field, v, normal, extra);
  };
  return (
    <div className="py-1.5">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="min-w-0 truncate">{line.name}</span>
        <div className="w-28 shrink-0"><CellInput ariaLabel={`${line.name}: mes normal`} value={normal} onSave={save("normal")} className="border-line" /></div>
      </div>
      {hasExtra(d, line) && (
        <div className="mt-1 flex items-center justify-between gap-3 text-sm">
          <span className="text-xs text-muted">+ paga extra en enero y julio</span>
          <div className="w-28 shrink-0"><CellInput ariaLabel={`${line.name}: paga extra`} value={extra} placeholder="0" onSave={save("extra")} className="border-line" /></div>
        </div>
      )}
    </div>
  );
}

export default async function PlanPage({ searchParams }: { searchParams: Promise<{ nuevo?: string }> }) {
  const sp = await searchParams;
  const d = await loadYear();
  const { supabase } = await getUser();
  const [{ data: yearRows }, { data: conns }] = await Promise.all([
    supabase.from("budget_values").select("year").order("year").limit(5000),
    supabase.from("bank_connections").select("aspsp_name, accounts").order("created_at"),
  ]);
  const years = Array.from(new Set((yearRows ?? []).map((r) => r.year as number)));
  const casa = jointAccounts((conns ?? []) as { aspsp_name: string; accounts: StoredAccount[] }[]).filter((j) => j.budget);

  const sec = (s: string) => d.lines.filter((l) => l.section === s);
  const sumNormal = (s: string) => sec(s).reduce((a, l) => a + (l.is_annual_fund ? annualMonthlyQuota(d) : normalValue(d, l)), 0);
  const extraTotal = sec("ingreso").reduce((a, l) => a + extraValue(d, l), 0);
  const ahorroNormal = sumNormal("ingreso") - sumNormal("fijo") - sumNormal("provision");
  const plannedYear = yearPlan(d, firstMonth(d)).plan;
  const cambios = d.lines.flatMap((l) => exceptions(d, l).map((e) => ({ line: l, ...e })));
  const annualTotal = d.annuals.reduce((s, a) => s + Number(a.amount), 0);

  return (
    <div className="space-y-4">
      <Hero top={<YearSwitcher year={d.year} years={years} dark />} kicker="Mi plan" title={`Plan de ${d.year}`}
        sub="Lo escribes una vez: sirve para todos los meses y para la previsión del año. Se guarda al salir de cada casilla." />
      {sp.nuevo && <p className="rounded-xl bg-good/10 px-3 py-2 text-sm text-good">✓ Creado {sp.nuevo} con el plan del año anterior. Revisa si algo cambia.</p>}

      <section className="card">
        <div className="mb-1 flex items-baseline justify-between"><h2 className="label">Ingresos · mes normal</h2></div>
        <div className="divide-y divide-line/60">{sec("ingreso").map((l) => <LineRow key={l.id} d={d} line={l} />)}</div>
      </section>

      <section className="card">
        <h2 className="label mb-1">Gastos fijos · mes normal</h2>
        <div className="divide-y divide-line/60">{sec("fijo").map((l) => <LineRow key={l.id} d={d} line={l} />)}</div>
      </section>

      <section className="card">
        <h2 className="label mb-1">Gasto libre</h2>
        <div className="divide-y divide-line/60">{sec("provision").map((l) => <LineRow key={l.id} d={d} line={l} />)}</div>
        <p className="mt-1 text-xs text-muted">Un solo bote para todo lo que no es fijo, de todas tus cuentas.</p>
        {casa.map((j) => (
          <div key={j.uid} className="mt-2 flex items-center justify-between border-t border-line/60 pt-2 text-sm">
            <span>Casa · {j.label} <span className="text-xs text-muted">(entre los dos)</span></span>
            <Link href="/importar" className="tnum text-ink2">{fmt0(j.budget)} <span className="text-xs text-accent">cambiar</span></Link>
          </div>
        ))}
      </section>

      <section className="card space-y-2">
        <div className="flex justify-between rounded-xl bg-accent/10 px-3 py-2.5 text-sm"><span>Ahorro de un mes normal</span><b className="tnum">{fmt0(ahorroNormal)}</b></div>
        {extraTotal > 0 && <div className="flex justify-between px-3 text-sm"><span className="text-ink2">En enero y julio, con la paga extra</span><b className="tnum">{fmt0(ahorroNormal + extraTotal)}</b></div>}
        <div className="flex justify-between px-3 text-sm"><span className="text-ink2">Ahorro previsto del año</span><b className="tnum">{fmt0(plannedYear)}</b></div>
      </section>

      <section className="card">
        <h2 className="label mb-2">Cambios puntuales</h2>
        {cambios.length === 0 && <p className="text-sm text-muted">Ninguno: todos los meses siguen tu plan.</p>}
        <div className="divide-y divide-line/60">
          {cambios.map((c) => (
            <div key={`${c.line.id}-${c.month}`} className="flex items-center justify-between gap-3 py-1.5 text-sm">
              <span className="min-w-0">{MONTHS[c.month - 1]} · {c.line.name} <span className="text-xs text-muted">en vez de {fmt0(c.normal)}</span></span>
              <div className="flex shrink-0 items-center gap-2">
                <div className="w-24"><CellInput ariaLabel={`${c.line.name} en ${MONTHS[c.month - 1]}`} value={c.value} className="border-line"
                  onSave={async (v: string) => { "use server"; await setBudgetCell(c.line.id, d.year, c.month, "planned", v); }} /></div>
                <form action={async () => { "use server"; await setBudgetCell(c.line.id, d.year, c.month, "planned", String(c.normal)); }}>
                  <button className="text-xs text-muted hover:text-bad" aria-label={`Quitar el cambio de ${c.line.name} en ${MONTHS[c.month - 1]}`}>×</button>
                </form>
              </div>
            </div>
          ))}
        </div>
        <form action={savePlanException} className="mt-3 grid grid-cols-[1fr_auto] gap-2 border-t border-line pt-3 sm:grid-cols-[2fr_1fr_1fr_auto]">
          <input type="hidden" name="year" value={d.year} />
          <select name="line_id" className="input col-span-2 sm:col-span-1" aria-label="Concepto" required defaultValue="">
            <option value="" disabled>Concepto…</option>
            {d.lines.filter((l) => !l.is_annual_fund).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <select name="month" className="input" aria-label="Mes" required defaultValue="">
            <option value="" disabled>Mes…</option>
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <input name="value" className="input tnum" inputMode="decimal" placeholder="Importe" aria-label="Importe de ese mes" required />
          <button className="btn col-span-2 sm:col-span-1">Añadir</button>
        </form>
        <p className="mt-2 text-xs text-muted">Para lo que sabes de antemano que será distinto un mes. Lo que llega del banco no se toca aquí.</p>
      </section>

      <section id="anuales" className="card scroll-mt-4">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="label">Recibos anuales</h2>
          <span className="tnum text-sm text-ink2">{fmt0(annualTotal)} al año · {fmt(annualMonthlyQuota(d))}/mes</span>
        </div>
        <div className="space-y-2">
          {d.annuals.map((a) => (
            <div key={a.id} className="flex items-center gap-2">
              <form action={saveAnnual} className="grid flex-1 grid-cols-[1fr_5.5rem_5.5rem_auto] gap-2">
                <input type="hidden" name="id" value={a.id} />
                <input className="input" name="name" defaultValue={a.name} aria-label="Concepto" />
                <input className="input tnum" name="amount" inputMode="decimal" defaultValue={a.amount} aria-label="Importe anual" />
                <select className="input" name="pay_month" defaultValue={a.pay_month ?? ""} aria-label="Mes en que se paga">
                  <option value="">—</option>
                  {MONTHS_SHORT.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
                <button className="btn-ghost px-3">✓</button>
              </form>
              <form action={deleteAnnual}>
                <input type="hidden" name="id" value={a.id} />
                <button className="px-1 text-muted hover:text-bad" aria-label={`Eliminar ${a.name}`}>×</button>
              </form>
            </div>
          ))}
          <form action={saveAnnual} className="grid grid-cols-[1fr_5.5rem_5.5rem_auto] gap-2 border-t border-line pt-3">
            <input className="input" name="name" placeholder="Nuevo recibo anual" aria-label="Nuevo recibo anual" required />
            <input className="input tnum" name="amount" inputMode="decimal" placeholder="€/año" aria-label="Importe anual" required />
            <select className="input" name="pay_month" defaultValue="" aria-label="Mes en que se paga">
              <option value="">Mes</option>
              {MONTHS_SHORT.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <button className="btn px-3">Añadir</button>
          </form>
        </div>
        <p className="mt-2 text-xs text-muted">El total se reparte entre 12: esa cuota es la hucha de anuales de cada mes. El saldo y el próximo pago se ven en <Link href="/ano" className="text-accent">Año</Link>.</p>
      </section>

      <div className="flex flex-wrap gap-2">
        <Link href="/presupuesto/tabla?modo=fijo" className="btn-ghost">Tabla de 12 meses · añadir o quitar conceptos</Link>
      </div>
    </div>
  );
}
