"use client";

import { reclassifyMovement } from "@/app/importActions";
import type { Category } from "@/lib/types";

const eur = (v: number) => v.toLocaleString("es-ES", { style: "currency", currency: "EUR" });

export interface DirectMovement { id: string; bank: string; date: string; description: string; amount: number; action: string; category_id: string | null; pending: boolean }

/** Movimientos que se guardaron solos (cuentas «sin revisar»): cambiar su categoría o marcarlos como inversión / no contar */
export default function DirectMovements({ rows, categories }: { rows: DirectMovement[]; categories: Category[] }) {
  return (
    <ul className="divide-y divide-line/70 text-sm">
      {rows.map((r) => (
        <li key={r.id} className="flex items-center gap-2 py-1.5">
          <span className="tnum w-11 shrink-0 text-xs text-muted">{r.date.slice(8, 10)}/{r.date.slice(5, 7)}</span>
          <span className="min-w-0 flex-1 truncate text-ink2">{r.bank}{r.pending ? " · pendiente" : ""}</span>
          <span className={`tnum shrink-0 font-medium ${r.amount > 0 ? "text-good" : ""}`}>{eur(r.amount)}</span>
          {r.amount < 0 ? (
            <form action={reclassifyMovement}>
              <input type="hidden" name="id" value={r.id} />
              <select name="to" aria-label="Qué es" className="rounded-lg border border-line bg-surface px-1.5 py-1 text-xs"
                defaultValue={r.action === "variable" ? `cat:${r.category_id ?? ""}` : r.action}
                onChange={(e) => e.currentTarget.form?.requestSubmit()}>
                {categories.map((c) => <option key={c.id} value={`cat:${c.id}`}>{c.name}</option>)}
                <option value="inversion">Inversión (ETF)</option>
                <option value="ignorar">No contar</option>
              </select>
            </form>
          ) : <span className="w-24 shrink-0 text-right text-xs text-muted">{r.action === "puntual" ? "Ingreso" : "No cuenta"}</span>}
        </li>
      ))}
    </ul>
  );
}
