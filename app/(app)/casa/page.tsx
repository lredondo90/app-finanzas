import Link from "next/link";
import HBars from "@/components/HBars";
import Hero from "@/components/Hero";
import MonthPicker, { currentMonth } from "@/components/MonthPicker";
import { categoryIcon } from "@/lib/categoryIcon";
import { getUser, loadYear } from "@/lib/data";
import { MONTHS, firstMonth, fmt, fmt0 } from "@/lib/finance";
import { type HouseMovement, houseGroup } from "@/lib/house";
import { loadHouseMonth } from "@/lib/houseData";

export const dynamic = "force-dynamic";

const dayShort = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString("es-ES", { day: "numeric", month: "short" }).replace(".", "");
/** Nombre de quien aporta, sin «traspaso desde cuenta…» */
const who = (m: HouseMovement) => m.description.replace(/\s+/g, " ").trim();

export default async function CasaPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const sp = await searchParams;
  const d = await loadYear();
  const month = currentMonth(sp.m, d.year, firstMonth(d));
  const { supabase } = await getUser();
  const { joint, from, to, movs, internal, missingColumn, budgets } = await loadHouseMonth(supabase, d.year, month);
  const balances = new Map(d.syncedAccounts.map((a) => [a.uid, a]));
  const total = joint.reduce((s, j) => s + Number(balances.get(j.uid)?.balance ?? 0), 0);
  const inMonth = movs.filter((m) => m.date >= from && m.date < to);
  const real = inMonth.filter((m) => !internal.has(m.id));
  const entradas = real.filter((m) => m.amount > 0);
  const gastos = real.filter((m) => m.amount < 0);
  const totalEntradas = entradas.reduce((s, m) => s + m.amount, 0);
  const totalGastos = -gastos.reduce((s, m) => s + m.amount, 0);

  const catName = (id: string | null) => d.categories.find((c) => c.id === id)?.name ?? null;
  const porQuien = new Map<string, number>();
  for (const m of entradas) porQuien.set(who(m), (porQuien.get(who(m)) ?? 0) + m.amount);
  const porGrupo = new Map<string, number>();
  for (const m of gastos) {
    const g = houseGroup(m, catName);
    porGrupo.set(g, (porGrupo.get(g) ?? 0) - m.amount);
  }
  const label = (uid: string) => joint.find((j) => j.uid === uid)?.label ?? "Cuenta conjunta";

  return (
    <div className="space-y-4">
      <Hero kicker="Casa" value={fmt0(total)}
        sub={joint.length ? `Saldo de ${joint.length === 1 ? "la cuenta conjunta" : `las ${joint.length} cuentas conjuntas`}` : "Cuentas conjuntas"}
        top={<MonthPicker month={month} year={d.year} base="/casa" min={firstMonth(d)} />}>
        {joint.length > 0 && (
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
            <span>Entra <b className="tnum">{fmt0(totalEntradas)}</b></span>
            <span>Sale <b className="tnum">{fmt0(totalGastos)}</b></span>
            <span className="text-white/70">en {MONTHS[month - 1].toLowerCase()}</span>
          </div>
        )}
      </Hero>

      {!joint.length && (
        <div className="card text-sm text-ink2">
          Aún no tienes ninguna cuenta conjunta. En <Link href="/importar" className="text-accent">Bancos</Link>, abre «Cambiar cuentas a sincronizar»
          y pon el tipo «Conjunta (casa)» a las cuentas que compartes. Sus movimientos dejarán de contar en tus gastos y aparecerán aquí.
        </div>
      )}
      {missingColumn && (
        <p className="rounded-lg bg-warn/15 p-3 text-sm">Falta actualizar la base de datos (columna account_uid) para ver los movimientos de las cuentas conjuntas.</p>
      )}

      {/* Presupuesto de casa (p. ej. Revolut: 600 € al mes entre los dos) */}
      {budgets.map(({ account: j, budget, spent }) => {
        const left = budget - spent;
        const pct = Math.min(1, spent / budget);
        return (
          <div key={j.uid} className="card">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="section-title">Presupuesto de casa · {j.label}</h2>
              <span className="tnum text-sm text-ink2">{fmt0(spent)} de {fmt0(budget)}</span>
            </div>
            <div className="mt-3 h-2 rounded-full bg-line/70">
              <div className={`h-2 rounded-full ${left < 0 ? "bg-bad" : "bg-accent"}`} style={{ width: `${pct * 100}%` }} />
            </div>
            <p className={`mt-2 text-sm ${left < 0 ? "text-bad" : "text-ink2"}`}>
              {left >= 0 ? <>Quedan <b className="tnum">{fmt(left)}</b> este mes</> : <>Os habéis pasado <b className="tnum">{fmt(-left)}</b></>}
            </p>
          </div>
        );
      })}

      {joint.length > 0 && (
        <section className="grid gap-4 lg:grid-cols-2">
          <div className="card">
            <h2 className="section-title mb-3">Quién ha aportado</h2>
            {porQuien.size ? (
              <HBars format={fmt} rows={[...porQuien.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: k, value: v }))} />
            ) : <p className="text-sm text-muted">Este mes aún no ha entrado dinero en las cuentas conjuntas.</p>}
          </div>
          <div className="card">
            <h2 className="section-title mb-3">En qué se va</h2>
            {porGrupo.size ? (
              <HBars format={fmt} rows={[...porGrupo.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: k, value: v }))} />
            ) : <p className="text-sm text-muted">Sin gastos de casa este mes.</p>}
          </div>
        </section>
      )}

      {joint.map((j) => {
        const list = inMonth.filter((m) => m.account_uid === j.uid);
        const bal = balances.get(j.uid)?.balance;
        return (
          <div key={j.uid} className="card">
            <div className="flex items-baseline justify-between gap-2">
              <div className="min-w-0">
                <h2 className="section-title truncate">{j.label}</h2>
                <div className="text-xs text-muted">{j.bank}{j.iban ? ` · ···${j.iban.slice(-4)}` : ""}</div>
              </div>
              <span className="tnum font-semibold">{bal == null ? "—" : fmt(bal)}</span>
            </div>
            {list.length ? (
              <ul className="mt-2 divide-y divide-line/70">
                {list.map((m) => {
                  const g = m.amount > 0 ? "Aportación" : internal.has(m.id) ? "Entre cuentas de casa" : houseGroup(m, catName);
                  const ic = categoryIcon(m.amount > 0 || internal.has(m.id) ? "transfer" : g);
                  return (
                    <li key={m.id} className="flex items-center gap-3 py-2.5">
                      <span className="icon-tile" style={{ background: `rgb(${ic.rgb} / 0.14)` }} aria-hidden>{g === "Hipoteca" ? "🏡" : ic.emoji}</span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{m.description}</div>
                        <div className="truncate text-xs text-muted">{dayShort(m.date)} · {internal.has(m.id) ? `${g} (${label(m.account_uid)})` : g}</div>
                      </div>
                      <div className={`tnum shrink-0 font-semibold ${m.amount > 0 ? "text-good" : ""} ${internal.has(m.id) ? "text-muted" : ""}`}>{fmt(m.amount)}</div>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="mt-2 text-sm text-muted">Sin movimientos en {MONTHS[month - 1].toLowerCase()}.</p>}
          </div>
        );
      })}
    </div>
  );
}
