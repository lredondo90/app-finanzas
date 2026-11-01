"use client";

import { useState, useTransition } from "react";

/** Celda numérica editable: guarda al salir del campo o al pulsar Enter */
export default function CellInput({ value, onSave, placeholder, highlight, className = "", ariaLabel }: {
  value: number | null; onSave: (v: string) => Promise<void>; placeholder?: string; highlight?: boolean; className?: string; ariaLabel?: string;
}) {
  const initial = value == null ? "" : String(Math.round(value * 100) / 100).replace(".", ",");
  const [v, setV] = useState(initial);
  const [pending, start] = useTransition();
  const [last, setLast] = useState(initial);
  if (initial !== last) { setLast(initial); setV(initial); }

  const commit = () => {
    if (v === initial) return;
    start(async () => { await onSave(v.replace(",", ".")); });
  };

  return (
    <input
      aria-label={ariaLabel}
      value={v}
      placeholder={placeholder}
      inputMode="decimal"
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      className={`tnum w-full min-w-[4.5rem] rounded-md border bg-transparent px-1.5 py-1 text-right text-base outline-none focus:border-accent focus:bg-surface sm:text-sm
        ${highlight ? "border-warn/70 bg-warn/15" : "border-transparent hover:border-line"} ${pending ? "opacity-50" : ""} ${className}`}
    />
  );
}
