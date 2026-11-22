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
import { MONTHS, firstMonth, fmt, fmt0, plannedValue, type monthSummary } from "@/lib/finance";
import { getUser, loadYear } from "@/lib/data";
import { monthPlan, type MonthPlan } from "@/lib/plan";
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
function Checklist({ d, s, month, section, moves, open, oneOffMoves }: { d: YearData; s: Summary; month: number; section: "ingreso" | "fijo"; moves: Map<string, LineMove[]>; open?: string; oneOffMoves?: Map<string, LineMove> }) {
  const income = section === "ingreso";
  const rows = s.lineas.filter((l) => l.line.section === section && (l.value !== 0 || l.done));
  const st = s.estado[section];
  const all = st.total > 0 && st.hechos === st.total;
  const word = income ? "Cobrado" : "Pagado";
  // Ingresos puntuales del mes (intereses, bizums, ingresos sin concepto fijo…): cuentan en el ahorro, así que se ven aquí también
  const puntuales = income ? d.oneOffIncomes.filter((i) => i.date.startsWith(`${d.year}-`) && Number(i.date.slice(5, 7)) === month).sort((a, b) => a.date.localeCompare(b.date)) : [];
  const totalPuntuales = puntuales.reduce((a, i) => a + Number(i.amount), 0);
  return (
    <section className="card">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="section-title">{income ? "Ingresos" : "Gastos fijos"}</h2>
        <span className={`text-sm font-semibold ${all ? "text-good" : "text-ink2"}`}>{all ? `Todo ${word.toLowerCase()}` : `${word}s ${st.hechos} de ${st.total}`}</span>
      </div>
      <p className="mb-2 text-sm text-ink2">{all ? `${fmt0(rows.reduce((a, r) => a + r.value, 0) + totalPuntuales)} en total` : `Falta por ${income ? "cobrar" : "pagar"} ${fmt0(st.pendiente)}`}</p>
      {rows.length === 0 && <p className="py-4 text-center text-sm text-muted">Nada previsto este mes. <Link href="/plan" className="text-accent">Escribir mi plan ›</Link></p>}
      <ul className="divide-y divide-line/70">
        {rows.map(({ line, value, done }) => {
          const fund = line.is_annual_fund;
          const ms = moves.get(line.id) ?? [];
          const ok = done || fund;
          return (
            <li key={line.id}>
              <details className="group scroll-mt-4" id={`l-${line.id}`} open={open === line.id}>
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
                      <MoveSelect m={m} categories={d.categories} lines={d.lines} annuals={d.annuals} className="mt-1" />
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
        {puntuales.length > 0 && (
          <li>
            <details className="group">
              <summary className="flex min-h-[3.25rem] cursor-pointer list-none items-center gap-3 py-2">
                <Check done />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">Otros ingresos</div>
                  <div className="truncate text-xs text-muted">{puntuales.length === 1 ? "1 ingreso puntual" : `${puntuales.length} ingresos puntuales`} · intereses, bizums…</div>
                </div>
                <div className="tnum shrink-0 font-semibold">{fmt0(totalPuntuales)}</div>
                <span className="shrink-0 text-xs text-muted transition group-open:rotate-90" aria-hidden>›</span>
              </summary>
              <div className="mb-3 space-y-2 rounded-2xl bg-page p-3">
                <p className="text-xs text-muted">Si alguno es un traspaso entre tus cuentas o no es un ingreso de verdad, cámbialo aquí: se guarda al elegir.</p>
                {puntuales.map((i) => {
                  const m = oneOffMoves?.get(i.id);
                  return (
                    <div key={i.id} className="border-t border-line/60 pt-2 first:border-0">
                      <div className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="min-w-0 truncate">{shortDate(i.date)} · {i.concept}{i.notes?.startsWith("Importado de ") ? ` · ${i.notes.slice(13)}` : ""}</span>
                        <span className="tnum shrink-0 font-semibold">{fmt(Number(i.amount))}</span>
                      </div>
                      {m ? <MoveSelect m={m} categories={d.categories} lines={d.lines} annuals={d.annuals} className="mt-1" />
                        : <p className="mt-1 text-xs text-muted">Apuntado a mano. <Link href={`/ingresos?m=${month}`} className="text-accent">Cambiarlo ›</Link></p>}
                    </div>
                  );
                })}
              </div>
            </details>
          </li>
        )}
      </ul>
    </section>
  );
}

/** Nombre legible de una compra de fondos: «Savings plan execution LU… Amundi S&P 500…, quantity: …» → «Amundi S&P 500…» */
const fundName = (desc: string) =>
  desc.replace(/^savings plan execution\s+[A-Z]{2}[A-Z0-9]{9}\d\s*/i, "").replace(/,\s*quantity:.*$/i, "").trim() || desc;

/** Resultado del mes en ahorro: ingresos − gastos fijos − gasto libre (la misma cuenta que en Presupuesto) */
function Ahorro({ d, mp, month, fundMoves }: { d: YearData; mp: MonthPlan; month: number; fundMoves: LineMove[] }) {
  const { s, plan, libre, ahorroPrevisto, desviacion } = mp;
  // Fondos: lo metido en fondos este mes (movimientos del banco marcados como inversión); en meses futuros, tus planes de ahorro
  const fondos = s.periodo === "futuro" ? s.planes
    : -fundMoves.reduce((a, m) => a + m.amount, 0);
  const efectivo = ahorroPrevisto - fondos;
  const pasado = s.periodo === "pasado";
  const actual = s.periodo === "actual";
  const cobrado = s.lineas.filter((l) => l.line.section === "ingreso" && l.done).reduce((a, l) => a + l.value, 0) + s.ingresosPuntuales;
  const pagado = s.lineas.filter((l) => l.line.section === "fijo" && (l.done || l.line.is_annual_fund)).reduce((a, l) => a + l.value, 0);
  const hastaHoy = cobrado - pagado - s.variableReal;
  const signo = (v: number) => (v < -0.5 ? "−" : "");
  const rows = [
    { name: "Ingresos", v: s.ingresos },
    { name: "Gastos fijos", v: -s.fijos },
    { name: pasado ? "Gasto libre" : "Gasto libre (al ritmo que llevas)", v: -libre.previsto },
  ];
  return (
    <section className="card">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="section-title">{pasado ? "Ahorraste este mes" : actual ? "Vas a ahorrar este mes" : "Ahorro previsto"}</h2>
        <Link href={`/presupuesto?m=${month}`} className="shrink-0 text-xs text-accent">Detalle ›</Link>
      </div>
      <div className={`tnum mt-1 text-3xl font-semibold ${ahorroPrevisto < -0.5 ? "text-bad" : "text-good"}`}>{signo(ahorroPrevisto)}{fmt0(Math.abs(ahorroPrevisto))}</div>
      <p className="mt-1 text-sm text-ink2">
        Tu plan: {signo(plan.ahorro)}{fmt0(Math.abs(plan.ahorro))}
        {Math.abs(desviacion) >= 0.5 && <> · <span className={desviacion < 0 ? "font-semibold text-bad" : "font-semibold text-good"}>{desviacion < 0 ? `${fmt0(-desviacion)} menos` : `${fmt0(desviacion)} más`}</span></>}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-page px-3 py-2">
          <div className="text-xs text-muted">En efectivo</div>
          <div className={`tnum text-lg font-semibold ${efectivo < -0.5 ? "text-bad" : ""}`}>{signo(efectivo)}{fmt0(Math.abs(efectivo))}</div>
          <div className="text-[11px] text-muted">Se queda en tus cuentas</div>
        </div>
        <div className="rounded-2xl bg-page px-3 py-2">
          <div className="text-xs text-muted">En fondos</div>
          <div className={`tnum text-lg font-semibold ${fondos < -0.5 ? "text-bad" : ""}`}>{signo(fondos)}{fmt0(Math.abs(fondos))}</div>
          <div className="text-[11px] text-muted">{s.periodo === "futuro" ? "Según tus planes de ahorro" : actual ? "Metido en fondos hasta hoy" : "Metido en fondos"}</div>
        </div>
      </div>
      {fundMoves.length > 0 && (
        <details className="group mt-2">
          <summary className="flex min-h-[2.75rem] cursor-pointer list-none items-center justify-between gap-2 rounded-2xl border border-line px-3 text-sm font-semibold text-accent">
            <span>Ver a qué fondos ha ido ({fundMoves.length} {fundMoves.length === 1 ? "movimiento" : "movimientos"})</span>
            <span className="text-xs transition group-open:rotate-90" aria-hidden>›</span>
          </summary>
          <div className="mt-2 space-y-2 rounded-2xl bg-page p-3">
            <p className="text-xs text-muted">Si alguno no es una compra de fondos, cámbialo aquí: se guarda al elegir.</p>
            {fundMoves.map((m) => (
              <div key={m.id} className="border-t border-line/60 pt-2 first:border-0">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="min-w-0">{shortDate(m.date)} · {m.bank}<span className="block truncate text-xs text-muted">{fundName(m.description)}</span></span>
                  <span className="tnum shrink-0 font-semibold">{fmt(-m.amount)}</span>
                </div>
                <MoveSelect m={m} categories={d.categories} lines={d.lines} annuals={d.annuals} className="mt-1" />
              </div>
            ))}
          </div>
        </details>
      )}
      <ul className="mt-3 space-y-1 text-sm">
        {rows.map((r) => (
          <li key={r.name} className="flex justify-between gap-2"><span className="text-ink2">{r.name}</span><span className="tnum">{r.v < 0 ? "−" : "+"}{fmt0(Math.abs(r.v))}</span></li>
        ))}
      </ul>
      {actual && (
        <p className="mt-3 rounded-2xl bg-page px-3 py-2 text-sm">
          Hasta hoy: cobrado {fmt0(cobrado)} − pagado {fmt0(pagado)} − gastado {fmt0(s.variableReal)} = <b className={hastaHoy < -0.5 ? "text-bad" : ""}>{signo(hastaHoy)}{fmt0(Math.abs(hastaHoy))}</b>
        </p>
      )}
      <p className="mt-2 text-xs text-muted">
        Ahorro = ingresos − gastos fijos − gasto libre. De ahí, lo que metes en fondos va a «En fondos» y el resto es efectivo.{" "}
        {pasado ? "Con lo que realmente cobraste y gastaste."
          : actual ? "Lo cobrado y pagado va con su importe real; lo pendiente, con el de tu plan."
          : "Mes futuro: todo según tu plan."}
      </p>
    </section>
  );
}

export default async function EsteMes({ searchParams }: { searchParams: Promise<{ m?: string; l?: string }> }) {
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
  const [{ count: pendingCount = 0 }, { count: connCount = 0 }, house, { data: linked }, { data: tenant }, { data: paidAnnuals }] = await Promise.all([
    supabase.from("bank_pending").select("*", { count: "exact", head: true }),
    supabase.from("bank_connections").select("*", { count: "exact", head: true }),
    loadHouseMonth(supabase, d.year, month),
    supabase.from("bank_movements").select("id, bank, date, description, amount, action, category_id, line_id")
      .not("line_id", "is", null).gte("date", win.from).lt("date", win.to).order("date", { ascending: false }),
    supabase.from("tenant_entries").select("amount"),
    supabase.from("bank_movements").select("annual_id").not("annual_id", "is", null).gte("date", `${d.year}-01-01`).lt("date", `${d.year + 1}-01-01`),
  ]);
  const moves = new Map<string, LineMove[]>();
  for (const m of linked ?? []) {
    const line = d.lines.find((l) => l.id === m.line_id);
    if (!line) continue;
    moves.set(line.id, [...(moves.get(line.id) ?? []), { ...m, amount: Number(m.amount) }]);
  }

  // Movimientos del banco de los ingresos puntuales del mes, para poder cambiarlos desde aquí
  const oneOffIds = d.oneOffIncomes.filter((i) => i.date.startsWith(`${d.year}-`) && Number(i.date.slice(5, 7)) === month).map((i) => i.id);
  const { data: oneOffRows } = oneOffIds.length
    ? await supabase.from("bank_movements").select("id, bank, date, description, amount, action, category_id, line_id, one_off_income_id").in("one_off_income_id", oneOffIds)
    : { data: [] as (LineMove & { one_off_income_id: string })[] };
  const oneOffMoves = new Map<string, LineMove>((oneOffRows ?? []).map((m) => [m.one_off_income_id as string, { ...m, amount: Number(m.amount) }]));
  // Lo metido en fondos este mes: movimientos del banco marcados como inversión
  const mm = String(month).padStart(2, "0");
  const nextM = month === 12 ? `${d.year + 1}-01-01` : `${d.year}-${String(month + 1).padStart(2, "0")}-01`;
  const { data: fundRows } = await supabase.from("bank_movements").select("id, bank, date, description, amount, action, category_id, line_id")
    .eq("action", "inversion").gte("date", `${d.year}-${mm}-01`).lt("date", nextM).order("date");
  const fundMoves: LineMove[] = (fundRows ?? []).map((m) => ({ ...m, amount: Number(m.amount) }));
  const mp = monthPlan(d, month);
  const s = mp.s;
  const debe = (tenant ?? []).reduce((a, t) => a + Number(t.amount), 0);
  const anualesPagados = new Set((paidAnnuals ?? []).map((x) => x.annual_id as string)).size;
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

      <Ahorro d={d} mp={mp} month={month} fundMoves={fundMoves} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Checklist d={d} s={s} month={month} section="ingreso" moves={moves} open={sp.l} oneOffMoves={oneOffMoves} />
        <Checklist d={d} s={s} month={month} section="fijo" moves={moves} open={sp.l} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/inquilino" className="card flex min-h-[3.5rem] items-center gap-3">
          <span className="min-w-0 flex-1"><span className="block font-semibold">Tu inquilino te debe</span><span className="block truncate text-xs text-muted">Gastos que le cobras y lo que te va pagando</span></span>
          <span className={`tnum text-lg font-semibold ${debe > 0.005 ? "text-bad" : "text-good"}`}>{fmt0(Math.max(0, debe))}</span><span className="text-muted">›</span>
        </Link>
        <Link href="/anuales" className="card flex min-h-[3.5rem] items-center gap-3">
          <span className="min-w-0 flex-1"><span className="block font-semibold">Recibos anuales</span><span className="block truncate text-xs text-muted">Pagados {anualesPagados} de {d.annuals.length} este año</span></span>
          <span className="text-muted">›</span>
        </Link>
      </div>
    </div>
  );
}
