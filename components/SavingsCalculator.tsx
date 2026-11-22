"use client";

import { useEffect, useMemo, useState } from "react";
import { project } from "@/lib/projection";

const eur0 = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const f0 = (v: number) => eur0.format(v);
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const ymLabel = (ym: string) => `${MESES[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
const num = (s: string) => { const v = Number(String(s).replace(/\./g, "").replace(",", ".")); return Number.isFinite(v) ? v : 0; };
const KEY = "calc-ahorro-v1";

export interface CalcDefaults {
  cashMine: number; joint: number; tenant: number; funds: number;
  monthly: number; toFunds: number; extra: number;
  /** Primer mes que suma («aaaa-mm») */
  from: string;
}

/** Calculadora: cuánto tendrás ahorrado en una fecha con tu plan, tus aportaciones a fondos y una TAE */
export default function SavingsCalculator({ d }: { d: CalcDefaults }) {
  const initial = {
    to: `${Number(d.from.slice(0, 4)) + (d.from.endsWith("-12") ? 1 : 0)}-12`,
    taeFunds: "6", taeCash: "0",
    withJoint: false, withTenant: false,
    monthly: String(d.monthly), toFunds: String(d.toFunds), extra: String(d.extra),
  };
  const [v, setV] = useState(initial);
  // Recuerda en este dispositivo la fecha y la TAE que pusiste (lo demás sale siempre del plan)
  useEffect(() => {
    try { const s = JSON.parse(localStorage.getItem(KEY) ?? "null"); if (s) setV((x) => ({ ...x, to: s.to ?? x.to, taeFunds: s.taeFunds ?? x.taeFunds, taeCash: s.taeCash ?? x.taeCash })); } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify({ to: v.to, taeFunds: v.taeFunds, taeCash: v.taeCash })); } catch {}
  }, [v.to, v.taeFunds, v.taeCash]);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  const cash = d.cashMine + (v.withJoint ? d.joint : 0) - (v.withTenant ? 0 : d.tenant);
  const r = useMemo(() => project({
    cash, funds: d.funds, monthly: num(v.monthly), toFunds: num(v.toFunds), extra: num(v.extra),
    taeFunds: num(v.taeFunds), taeCash: num(v.taeCash), from: d.from, to: v.to || d.from,
  }), [cash, d.funds, d.from, v]);
  const yearEnds = r.points.filter((p, i) => p.ym.endsWith("-12") || i === r.points.length - 1);
  const edited = num(v.monthly) !== d.monthly || num(v.toFunds) !== d.toFunds || num(v.extra) !== d.extra;

  return (
    <div className="card">
      <h2 className="section-title">¿Cuánto tendré ahorrado?</h2>
      <p className="mt-0.5 text-sm text-muted">Desde lo que tienes hoy, sumando cada mes el ahorro de tu plan y con la rentabilidad que pongas.</p>

      <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
        <label className="col-span-3 sm:col-span-1">Fecha<input className="input mt-1" type="month" min={d.from} value={v.to} onChange={set("to")} /></label>
        <label>TAE fondos %<input className="input tnum mt-1" inputMode="decimal" value={v.taeFunds} onChange={set("taeFunds")} /></label>
        <label>TAE efectivo %<input className="input tnum mt-1" inputMode="decimal" value={v.taeCash} onChange={set("taeCash")} /></label>
      </div>

      {r.months > 0 ? (
        <div className="mt-4 rounded-2xl bg-accent/10 p-4">
          <div className="text-xs text-muted">A final de {ymLabel(v.to)} tendrías</div>
          <div className="tnum mt-0.5 text-3xl font-semibold">{f0(r.total)}</div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
            <div><div className="text-xs text-muted">Efectivo</div><b className="tnum">{f0(r.cash)}</b></div>
            <div><div className="text-xs text-muted">Fondos</div><b className="tnum">{f0(r.funds)}</b></div>
          </div>
          <p className="mt-2 text-xs text-muted">
            Hoy {f0(r.start)} + {f0(r.aportado)} ahorrados en {r.months} {r.months === 1 ? "mes" : "meses"} + {f0(r.intereses)} de rentabilidad.
          </p>
        </div>
      ) : <p className="mt-4 text-sm text-muted">Elige una fecha a partir de {ymLabel(d.from)}.</p>}

      {yearEnds.length > 1 && (
        <ul className="mt-3 divide-y divide-line/70 text-sm">
          {yearEnds.map((p) => (
            <li key={p.ym} className="flex justify-between py-1.5">
              <span className="text-ink2">{ymLabel(p.ym)}</span>
              <span className="tnum"><span className="text-muted">{f0(p.cash)} + {f0(p.funds)} = </span><b>{f0(p.cash + p.funds)}</b></span>
            </li>
          ))}
        </ul>
      )}

      <details className="mt-3 border-t border-line pt-3">
        <summary className="cursor-pointer text-sm text-accent">Punto de partida y ritmo{edited ? " (cambiado)" : ""}</summary>
        <div className="mt-2 space-y-1.5 text-sm">
          <div className="flex justify-between"><span>Efectivo hoy</span><b className="tnum">{f0(cash)}</b></div>
          <div className="flex justify-between"><span>Fondos hoy</span><b className="tnum">{f0(d.funds)}</b></div>
          {d.joint !== 0 && <label className="flex items-center gap-2"><input type="checkbox" checked={v.withJoint} onChange={set("withJoint")} />Contar las conjuntas ({f0(d.joint)})</label>}
          {d.tenant !== 0 && <label className="flex items-center gap-2"><input type="checkbox" checked={v.withTenant} onChange={set("withTenant")} />Contar lo del inquilino ({f0(d.tenant)})</label>}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
          <label>Ahorro al mes<input className="input tnum mt-1" inputMode="decimal" value={v.monthly} onChange={set("monthly")} /></label>
          <label>de ello a fondos<input className="input tnum mt-1" inputMode="decimal" value={v.toFunds} onChange={set("toFunds")} /></label>
          <label>+ paga extra<input className="input tnum mt-1" inputMode="decimal" value={v.extra} onChange={set("extra")} /></label>
        </div>
        <p className="mt-2 text-xs text-muted">
          Sale de Mi plan: un mes normal ahorras {f0(d.monthly)} ({f0(d.toFunds)} a fondos con tus planes de ahorro) y en enero y julio la paga extra suma {f0(d.extra)} al efectivo.
          Empieza a sumar en {ymLabel(d.from)}. La TAE se aplica cada mes con interés compuesto.
        </p>
        {edited && <button type="button" className="btn-ghost mt-2 px-3 py-1 text-sm" onClick={() => setV({ ...v, monthly: initial.monthly, toFunds: initial.toFunds, extra: initial.extra })}>Volver a mi plan</button>}
      </details>
    </div>
  );
}
