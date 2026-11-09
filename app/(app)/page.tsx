import Link from "next/link";
import ExpenseForm from "@/components/ExpenseForm";
import Hero from "@/components/Hero";
import Meter from "@/components/Meter";
import MonthPicker, { currentMonth } from "@/components/MonthPicker";
import MovementList from "@/components/MovementList";
import SyncButton from "@/components/SyncButton";
import SyncOnOpen from "@/components/SyncOnOpen";
import { I, Icon } from "@/components/navItems";
import { MONTHS, firstMonth, fmt0, monthOf } from "@/lib/finance";
import { getUser, loadYear } from "@/lib/data";
import { loadHouseMonth } from "@/lib/houseData";
import { libreByAccount, monthPlan } from "@/lib/plan";

export const dynamic = "force-dynamic";

const signed = (v: number) => `${v >= 0 ? "+" : "−"}${fmt0(Math.abs(v))}`;

export default async function Hoy({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
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
  const [{ count: pendingCount = 0 }, { count: connCount = 0 }, house] = await Promise.all([
    supabase.from("bank_pending").select("*", { count: "exact", head: true }),
    supabase.from("bank_connections").select("*", { count: "exact", head: true }),
    loadHouseMonth(supabase, d.year, month),
  ]);

  const mp = monthPlan(d, month);
  const { s, libre } = mp;
  const actual = s.periodo === "actual";
  const usado = libre.presupuesto > 0 ? libre.gastado / libre.presupuesto : 0;
  const markLibre = actual && s.ritmo ? s.ritmo.dia / s.ritmo.dias : null;
  const overPace = libre.hoyTocaria != null && libre.gastado > libre.hoyTocaria;
  const porCuenta = libreByAccount(d, month);
  const recientes = d.expenses.filter((e) => monthOf(e.date) === month).slice(0, 5);
  const today = new Date();
  const defaultDate = today.getFullYear() === d.year && today.getMonth() + 1 === month
    ? today.toISOString().slice(0, 10)
    : `${d.year}-${String(month).padStart(2, "0")}-01`;

  // Aviso sobre el total del gasto libre
  const aviso = libre.presupuesto <= 0 ? null
    : usado >= 1 ? { tone: "bad" as const, text: `Te has pasado ${fmt0(libre.gastado - libre.presupuesto)} de tus ${fmt0(libre.presupuesto)} de gasto libre.` }
    : usado >= 0.8 ? { tone: "warn" as const, text: `Ya has gastado el ${Math.round(usado * 100)} % de tus ${fmt0(libre.presupuesto)} de gasto libre.` }
    : actual && libre.previsto > libre.presupuesto ? { tone: "warn" as const, text: `A este ritmo acabarás el mes en ${fmt0(libre.previsto)}, ${fmt0(libre.previsto - libre.presupuesto)} por encima de tus ${fmt0(libre.presupuesto)}.` }
    : null;

  return (
    <div className="space-y-4">
      <Hero
        top={<MonthPicker month={month} year={d.year} min={first} />}
        right={
          <div className="flex items-center gap-2 text-white/70">
            {(connCount ?? 0) > 0 && <><SyncOnOpen /><SyncButton compact /></>}
            <Link href="/mas" aria-label="Más opciones y ajustes" className="hero-chip px-2.5"><Icon d={I.gear} className="h-4 w-4" /></Link>
          </div>
        }
        kicker={libre.queda >= 0 ? "Gasto libre · te quedan" : "Gasto libre · te has pasado"}
        value={fmt0(Math.abs(libre.queda))}
        sub={<>de tus {fmt0(libre.presupuesto)} libres · llevas {fmt0(libre.gastado)}</>}>
        <Meter value={usado} mark={markLibre} light />
        {actual && libre.hoyTocaria != null && (
          <p className="mt-3 text-sm text-white/80">
            {overPace
              ? <>Vas <b className="text-white">{fmt0(libre.gastado - libre.hoyTocaria)} por encima</b> de lo que tocaría a día de hoy (marca amarilla).</>
              : <>Vas <b className="text-white">{fmt0(libre.hoyTocaria - libre.gastado)} por debajo</b> de lo que tocaría a día de hoy (marca amarilla).</>}
            {libre.queda > 0 && libre.porDia != null && <> Puedes gastar unos <b className="text-white">{fmt0(libre.porDia)} al día</b>.</>}
          </p>
        )}
      </Hero>

      {aviso && (
        <div className={`flex items-start gap-2 rounded-2xl px-4 py-3 text-sm ${aviso.tone === "bad" ? "bg-bad/10 text-bad" : "bg-warn/15 text-ink"}`}>
          <span aria-hidden className="font-bold">!</span><span>{aviso.text}</span>
        </div>
      )}

      {(pendingCount ?? 0) > 0 && (
        <Link href="/importar" className="flex items-center gap-2 px-1 text-sm text-ink2">
          <span className="rounded-full bg-accent px-1.5 py-0.5 text-[11px] font-bold text-white">{pendingCount}</span>
          movimientos por revisar <span className="text-accent">Revisar ›</span>
        </Link>
      )}

      <section className="grid gap-3 sm:grid-cols-2">
        {/* Gasto libre */}
        <Link href={`/presupuesto?m=${month}`} className="card block space-y-2.5">
          <div className="flex items-center justify-between"><span className="font-semibold">Gasto libre</span><span className="text-muted">›</span></div>
          <div className="flex items-baseline gap-2">
            <span className="tnum text-2xl font-semibold">{fmt0(libre.gastado)}</span>
            <span className="text-xs text-muted">de {fmt0(libre.presupuesto)} · {libre.queda >= 0 ? `quedan ${fmt0(libre.queda)}` : `${fmt0(-libre.queda)} de más`}</span>
          </div>
          <Meter value={usado} mark={markLibre} tone={usado > 1 || overPace ? "bad" : "accent"} />
          {porCuenta.length > 0 && (
            <div className="flex flex-wrap gap-1.5 text-xs text-ink2">
              {porCuenta.slice(0, 3).map((c) => (
                <span key={c.name} className="rounded-full bg-line/50 px-2.5 py-1">
                  {c.name} {fmt0(c.total)}{libre.gastado > 0 ? ` (${Math.round((c.total / libre.gastado) * 100)} %)` : ""}
                </span>
              ))}
            </div>
          )}
          {libre.hoyTocaria != null && (
            <p className="text-xs text-muted">{overPace ? "Por encima" : "Por debajo"} del ritmo (deberías ir por {fmt0(libre.hoyTocaria)}).</p>
          )}
        </Link>

        {/* Casa */}
        {house.budgets.map(({ account, budget, spent }) => {
          const mark = markLibre;
          const tocaria = mark != null ? budget * mark : null;
          const bad = spent > budget || (tocaria != null && spent > tocaria);
          return (
            <Link key={account.uid} href={`/casa?m=${month}`} className="card block space-y-2.5">
              <div className="flex items-center justify-between"><span className="truncate font-semibold">Casa · {account.label}</span><span className="text-muted">›</span></div>
              <div className="flex items-baseline gap-2">
                <span className="tnum text-2xl font-semibold">{fmt0(spent)}</span>
                <span className="text-xs text-muted">de {fmt0(budget)} entre los dos · {spent <= budget ? `quedan ${fmt0(budget - spent)}` : `${fmt0(spent - budget)} de más`}</span>
              </div>
              <Meter value={spent / budget} mark={mark} tone={bad ? "warn" : "accent"} />
              {tocaria != null && <p className="text-xs text-muted">{spent > tocaria ? "Algo por encima" : "Por debajo"} del ritmo (debería ir por {fmt0(tocaria)}).</p>}
            </Link>
          );
        })}
      </section>

      {/* Así acabarás el mes */}
      <section className="card space-y-2.5">
        <h2 className="section-title">{s.periodo === "pasado" ? `Así acabó ${MONTHS[month - 1].toLowerCase()}` : "Así acabarás el mes"}</h2>
        <p className="text-sm text-ink2">
          {s.periodo === "pasado" ? "Gastaste " : s.periodo === "actual" ? "A este ritmo gastarás unos " : "Según tu plan gastarás "}
          <b className="tnum text-ink">{fmt0(libre.previsto)}</b> de tus {fmt0(libre.presupuesto)} libres, y {s.periodo === "pasado" ? "ahorraste" : "ahorrarás"} <b className="tnum text-ink">{fmt0(mp.ahorroPrevisto)}</b>.
        </p>
        <div className="flex justify-between text-sm"><span className="text-ink2">Ahorro según tu plan</span><span className="tnum">{fmt0(mp.plan.ahorro)}</span></div>
        <div className="flex justify-between text-sm"><span className="text-ink2">Diferencia</span><span className={`tnum font-semibold ${mp.desviacion >= 0 ? "text-good" : "text-bad"}`}>{signed(mp.desviacion)}</span></div>
        <Link href="/ano" className="block pt-1 text-sm font-semibold text-accent">Ver mi año frente al plan ›</Link>
      </section>

      <section className="card">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="section-title">Últimos movimientos</h2>
          <Link href={`/gastos?m=${month}`} className="text-sm text-accent">Ver todos ›</Link>
        </div>
        {recientes.length
          ? <MovementList expenses={recientes} categories={d.categories} />
          : <p className="py-6 text-center text-sm text-muted">Sin gastos en {MONTHS[month - 1].toLowerCase()} todavía.</p>}
      </section>

      <details className="card">
        <summary className="cursor-pointer list-none font-semibold">+ Apuntar un gasto a mano</summary>
        <div className="mt-3"><ExpenseForm compact categories={d.categories} methods={d.paymentMethods} defaultDate={defaultDate} /></div>
      </details>
    </div>
  );
}
