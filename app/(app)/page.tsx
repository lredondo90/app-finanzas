import Link from "next/link";
import Hero from "@/components/Hero";
import Meter from "@/components/Meter";
import MonthPicker, { currentMonth } from "@/components/MonthPicker";
import MoveSelect from "@/components/MoveSelect";
import SyncButton from "@/components/SyncButton";
import SyncOnOpen from "@/components/SyncOnOpen";
import { setLineDone } from "@/app/actions";
import { periodOf, periodWindow } from "@/lib/accounting";
import { loadPeriods } from "@/lib/periods";
import { MONTHS, firstMonth, fmt, fmt0, monthSummary, plannedValue } from "@/lib/finance";
import { getUser, loadYear } from "@/lib/data";
import { loadHouseMonth } from "@/lib/houseData";
import type { YearData } from "@/lib/types";

export const dynamic = "force-dynamic";

type Summary = ReturnType<typeof monthSummary>;
interface LineMove { id: string; bank: string; date: string; description: string; amount: number; action: string; category_id: string | null; line_id: string | null }

const shortDate = (date: string) => `${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1].slice(0, 3).toLowerCase()}`;

function Check({ done }: { done: boolean }) {
  return done ? (
    <svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0 text-good" role="img" aria-label="Hecho">
      <circle cx="12" cy="12" r="11" fill="currentColor" /><path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0 text-warn" role="img" aria-label="Pendiente">
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="3 3" />
    </svg>
  );
}

/** Ingresos o gastos fijos del mes: una línea por concepto con ✓ o «Pendiente». Al tocarla se ve el movimiento del banco y se puede cambiar */
function Checklist({ d, s, month, section, moves }: { d: YearData; s: Summary; month: number; section: "ingreso" | "fijo"; moves: Map<string, LineMove[]> }) {
  const income = section === "ingreso";
  const rows = s.lineas.filter((l) => l.line.section === section && (l.value !== 0 || l.done));
  const st = s.estado[section];
  const all = st.total > 0 && st.hechos === st.total;
  const word = income ? "Cobrado" : "Pagado";
  return (
    <section className="card">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="section-title">{income ? "Ingresos" : "Gastos fijos"}</h2>
        <span className={`text-sm font-semibold ${all ? "text-good" : "text-ink2"}`}>{all ? `Todo ${word.toLowerCase()}` : `${word}s ${st.hechos} de ${st.total}`}</span>
      </div>
      <p className="mb-2 text-sm text-ink2">{all ? `${fmt0(rows.reduce((a, r) => a + r.value, 0))} en total` : `Falta por ${income ? "cobrar" : "pagar"} ${fmt0(st.pendiente)}`}</p>
      {rows.length === 0 && <p className="py-4 text-center text-sm text-muted">Nada previsto este mes. <Link href="/plan" className="text-accent">Escribir mi plan ›</Link></p>}
      <ul className="divide-y divide-line/70">
        {rows.map(({ line, value, done }) => {
          const fund = line.is_annual_fund;
          const ms = moves.get(line.id) ?? [];
          const ok = done || fund;
          return (
            <li key={line.id}>
              <details className="group">
                <summary className="flex min-h-[3.25rem] cursor-pointer list-none items-center gap-3 py-2">
                  <Check done={ok} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{line.name}</div>
                    <div className={`truncate text-xs ${ok ? "text-muted" : "font-semibold text-ink2"}`}>
                      {fund ? "Se aparta cada mes para los recibos anuales"
                        : !done ? "Pendiente"
                        : ms.length ? `${word} el ${shortDate(ms[0].date)} · ${ms[0].bank}` : `${word} (marcado a mano)`}
                    </div>
                  </div>
                  <div className="tnum shrink-0 font-semibold">{fmt0(value)}</div>
                  <span className="shrink-0 text-xs text-muted transition group-open:rotate-90" aria-hidden>›</span>
                </summary>
                <div className="mb-3 space-y-3 rounded-2xl bg-page p-3">
                  {ms.map((m) => (
                    <div key={m.id}>
                      <div className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="min-w-0 truncate">{shortDate(m.date)} · {m.description}</span>
                        <span className="tnum shrink-0 font-semibold">{fmt(m.amount)}</span>
                      </div>
                      <label className="mt-1.5 block text-xs text-muted">¿No es {line.name}? Cambia aquí qué es</label>
                      <MoveSelect m={m} categories={d.categories} lines={d.lines} className="mt-1" />
                    </div>
                  ))}
                  {!fund && ms.length === 0 && (
                    <>
                      <p className="text-xs text-muted">
                        {done ? "No hay ningún movimiento del banco enlazado." : `Se marcará solo cuando llegue el movimiento del banco. Si ya ha llegado con otro nombre, búscalo en Movimientos y dile que es ${line.name}.`}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <form action={async () => { "use server"; await setLineDone(line.id, d.year, month, !done, plannedValue(d, line, month)); }}>
                          <button className="btn-ghost min-h-[2.75rem]">{done ? "Volver a pendiente" : `Marcar como ${word.toLowerCase()}`}</button>
                        </form>
                        {!done && <Link href={`/gastos?m=${month}`} className="btn-ghost min-h-[2.75rem]">Buscar en Movimientos</Link>}
                      </div>
                    </>
                  )}
                  {!fund && <Link href={`/ingresos?m=${month}`} className="block text-xs text-accent">Cambiar el importe de este mes ›</Link>}
                </div>
              </details>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default async function EsteMes({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const sp = await searchParams;
  const d = await loadYear();
  const first = firstMonth(d);
  const month = currentMonth(sp.m, d.year, first);

  if (d.lines.length === 0) {
    return (
      <div className="space-y-4">
        <Hero kicker="Mis Finanzas" title="Bienvenido" sub="Aún no hay presupuesto. Escribe tu plan y conecta tu banco." />
        <div className="flex gap-2"><Link href="/plan" className="btn">Escribir mi plan</Link><Link href="/importar" className="btn-ghost">Conectar banco</Link></div>
      </div>
    );
  }

  const { supabase } = await getUser();
  // Ingresos y recibos cuentan de nómina a nómina
  const periods = await loadPeriods(supabase);
  const win = periodWindow(periods, d.year, month);
  const [{ count: pendingCount = 0 }, { count: connCount = 0 }, house, { data: linked }] = await Promise.all([
    supabase.from("bank_pending").select("*", { count: "exact", head: true }),
    supabase.from("bank_connections").select("*", { count: "exact", head: true }),
    loadHouseMonth(supabase, d.year, month),
    supabase.from("bank_movements").select("id, bank, date, description, amount, action, category_id, line_id")
      .not("line_id", "is", null).gte("date", win.from).lt("date", win.to).order("date", { ascending: false }),
  ]);
  const moves = new Map<string, LineMove[]>();
  for (const m of linked ?? []) {
    const line = d.lines.find((l) => l.id === m.line_id);
    if (!line) continue;
    moves.set(line.id, [...(moves.get(line.id) ?? []), { ...m, amount: Number(m.amount) }]);
  }

  const s = monthSummary(d, month);
  const gastado = s.variableReal;
  const tope = s.prevision;
  const queda = tope - gastado;

  return (
    <div className="space-y-4">
      <Hero
        top={<MonthPicker month={month} year={d.year} min={first} />}
        right={(connCount ?? 0) > 0 ? <div className="flex items-center gap-2 text-white/70"><SyncOnOpen /><SyncButton compact /></div> : undefined}
        kicker="Gastado este mes"
        value={fmt0(gastado)}
        sub={tope > 0 ? <>de tus {fmt0(tope)} · {queda >= 0 ? `te quedan ${fmt0(queda)}` : `te has pasado ${fmt0(-queda)}`}</> : undefined}>
        {tope > 0 && <Meter value={gastado / tope} light />}
        {house.budgets.map(({ account, budget, spent }) => (
          <Link key={account.uid} href={`/casa?m=${month}`} className="mt-4 block">
            <div className="mb-1.5 flex items-baseline justify-between text-sm text-white/80">
              <span className="truncate">Casa · {account.label}</span>
              <span className="tnum shrink-0"><b className="text-white">{fmt0(spent)}</b> de {fmt0(budget)}</span>
            </div>
            <Meter value={spent / budget} light />
          </Link>
        ))}
        <Link href={`/hoy?m=${month}`} className="mt-4 inline-block text-sm font-semibold text-white">Ver el detalle del gasto ›</Link>
      </Hero>

      {(pendingCount ?? 0) > 0 && (
        <Link href="/importar" className="flex min-h-[2.75rem] items-center gap-2 rounded-2xl bg-accent/10 px-4 py-2.5 text-sm">
          <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-white">{pendingCount}</span>
          <span className="flex-1">{pendingCount === 1 ? "movimiento que no sé qué es" : "movimientos que no sé qué son"}</span>
          <span className="font-semibold text-accent">Decírmelo ›</span>
        </Link>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Checklist d={d} s={s} month={month} section="ingreso" moves={moves} />
        <Checklist d={d} s={s} month={month} section="fijo" moves={moves} />
      </div>
    </div>
  );
}
