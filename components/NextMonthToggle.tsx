"use client";

import { useOptimistic, useTransition } from "react";
import { setLineNextMonth } from "@/app/actions";

/** Interruptor «cuenta para el mes siguiente» de un concepto (nómina, recibos de fin de mes) */
export default function NextMonthToggle({ lineId, value, cutoff }: { lineId: string; value: boolean; cutoff: number }) {
  const [on, setOn] = useOptimistic(value);
  const [, start] = useTransition();
  return (
    <button type="button" aria-pressed={on}
      title={on ? `Si llega después del día ${cutoff}, cuenta para el mes siguiente` : `Marcar: si llega después del día ${cutoff}, cuenta para el mes siguiente`}
      onClick={() => start(async () => { setOn(!on); await setLineNextMonth(lineId, !on); })}
      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${on ? "bg-accent text-white" : "border border-line text-muted hover:text-ink"}`}>
      {on ? `↪ mes sig. (>${cutoff})` : "↪"}
    </button>
  );
}
