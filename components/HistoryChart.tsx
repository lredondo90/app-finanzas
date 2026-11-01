"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const eur = (v: number) => v.toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

export default function HistoryChart({ data }: { data: { fecha: string; total: number }[] }) {
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="rgb(var(--line))" />
          <XAxis dataKey="fecha" tickLine={false} axisLine={{ stroke: "rgb(var(--line))" }} tick={{ fill: "rgb(var(--muted))", fontSize: 11 }} />
          <YAxis tickLine={false} axisLine={false} width={56} tick={{ fill: "rgb(var(--muted))", fontSize: 11 }}
            tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} domain={["auto", "auto"]} />
          <Tooltip formatter={(v) => [eur(Number(v)), "Patrimonio"]}
            contentStyle={{ background: "rgb(var(--surface))", border: "1px solid rgb(var(--line))", borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: "rgb(var(--ink))" }} />
          <Line type="monotone" dataKey="total" stroke="rgb(var(--accent))" strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: "rgb(var(--surface))" }} activeDot={{ r: 5 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
