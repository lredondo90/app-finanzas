"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface Row { mes: string; month: number; ingresos: number; gastos: number; resultado: number }

const eur = (v: number) => v.toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

function Tip({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-medium text-ink">{r.mes}</div>
      <div className="flex items-center gap-2 text-ink2"><span className="h-2 w-2 rounded-sm bg-accent" />Ingresos <span className="tnum ml-auto text-ink">{eur(r.ingresos)}</span></div>
      <div className="flex items-center gap-2 text-ink2"><span className="h-2 w-2 rounded-sm bg-accent2" />Gastos <span className="tnum ml-auto text-ink">{eur(r.gastos)}</span></div>
      <div className="mt-1 flex gap-2 border-t border-line pt-1 text-ink2">Resultado <span className={`tnum ml-auto font-medium ${r.resultado >= 0 ? "text-good" : "text-bad"}`}>{eur(r.resultado)}</span></div>
    </div>
  );
}

export default function YearChart({ data, selected }: { data: Row[]; selected: number }) {
  return (
    <div>
      <div className="mb-2 flex gap-4 text-xs text-ink2">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-accent" />Ingresos</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-accent2" />Gastos (fijos + variable)</span>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={2} barCategoryGap="22%" margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="rgb(var(--line))" />
            <XAxis dataKey="mes" tickLine={false} axisLine={{ stroke: "rgb(var(--line))" }} tick={{ fill: "rgb(var(--muted))", fontSize: 11 }} />
            <YAxis tickLine={false} axisLine={false} width={52} tick={{ fill: "rgb(var(--muted))", fontSize: 11 }}
              tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toLocaleString("es-ES", { maximumFractionDigits: 1 })}k` : String(v))} />
            <Tooltip content={<Tip />} cursor={{ fill: "rgb(var(--line))", opacity: 0.4 }} />
            <Bar dataKey="ingresos" radius={[4, 4, 0, 0]} maxBarSize={18}>
              {data.map((d) => <Cell key={d.month} fill="rgb(var(--accent))" fillOpacity={d.month === selected ? 1 : 0.45} />)}
            </Bar>
            <Bar dataKey="gastos" radius={[4, 4, 0, 0]} maxBarSize={18}>
              {data.map((d) => <Cell key={d.month} fill="rgb(var(--accent2))" fillOpacity={d.month === selected ? 1 : 0.45} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
