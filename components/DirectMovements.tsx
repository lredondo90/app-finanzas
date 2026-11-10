"use client";

import MoveSelect from "@/components/MoveSelect";
import type { BudgetLine, Category } from "@/lib/types";

const eur = (v: number) => v.toLocaleString("es-ES", { style: "currency", currency: "EUR" });

export interface DirectMovement { id: string; bank: string; date: string; description: string; amount: number; action: string; category_id: string | null; line_id: string | null; annual_id?: string | null; tenant?: boolean; pending: boolean }

/** Movimientos que se guardaron solos (cuentas «sin revisar»): cambiar qué son (categoría, recibo, ingreso, inversión o no contar) */
export default function DirectMovements({ rows, categories, lines, annuals = [] }: { rows: DirectMovement[]; categories: Category[]; lines: BudgetLine[]; annuals?: { id: string; name: string }[] }) {
  return (
    <ul className="divide-y divide-line/70 text-sm">
      {rows.map((r) => (
        <li key={r.id} className="flex items-center gap-2 py-1.5">
          <span className="tnum w-11 shrink-0 text-xs text-muted">{r.date.slice(8, 10)}/{r.date.slice(5, 7)}</span>
          <span className="min-w-0 flex-1 truncate text-ink2">{r.bank}{r.pending ? " · pendiente" : ""}</span>
          <span className={`tnum shrink-0 font-medium ${r.amount > 0 ? "text-good" : ""}`}>{eur(r.amount)}</span>
          <MoveSelect m={r} categories={categories} lines={lines} annuals={annuals} className="w-40 shrink-0" />
        </li>
      ))}
    </ul>
  );
}
