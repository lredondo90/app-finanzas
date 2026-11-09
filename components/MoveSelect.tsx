"use client";

import { reclassifyMovement } from "@/app/importActions";
import type { BudgetLine, Category } from "@/lib/types";

export interface MoveRef { id: string; action: string; category_id: string | null; line_id: string | null }

/** Valor del desplegable para lo que es ahora un movimiento del banco */
export const moveValue = (m: MoveRef) =>
  m.action === "variable" ? `cat:${m.category_id ?? ""}`
  : (m.action === "fijo" || m.action === "ingreso") && m.line_id ? `line:${m.line_id}`
  : m.action;

/** Cambiar qué es un movimiento del banco ya guardado: gasto de una categoría, recibo, ingreso, inversión o no contar */
export default function MoveSelect({ m, categories, lines, className = "" }: { m: MoveRef; categories: Category[]; lines: BudgetLine[]; className?: string }) {
  const fijos = lines.filter((l) => l.section === "fijo" && !l.is_annual_fund);
  const ingresos = lines.filter((l) => l.section === "ingreso");
  const value = moveValue(m);
  return (
    <form action={reclassifyMovement} className={className}>
      <input type="hidden" name="id" value={m.id} />
      <select name="to" aria-label="Qué es" className="input py-1.5 text-sm" defaultValue={value}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}>
        {value === "cat:" && <option value="cat:">Gasto sin categoría</option>}
        {(value === "fijo" || value === "ingreso") && <option value={value}>{value === "fijo" ? "Recibo sin concepto" : "Ingreso sin concepto"}</option>}
        <optgroup label="Gasto del día a día">
          {categories.map((c) => <option key={c.id} value={`cat:${c.id}`}>{c.name}</option>)}
        </optgroup>
        {fijos.length > 0 && <optgroup label="Recibo o gasto fijo">
          {fijos.map((l) => <option key={l.id} value={`line:${l.id}`}>{l.name}</option>)}
        </optgroup>}
        <optgroup label="Ingreso">
          {ingresos.map((l) => <option key={l.id} value={`line:${l.id}`}>{l.name}</option>)}
          <option value="puntual">Ingreso puntual</option>
        </optgroup>
        <optgroup label="Otros">
          <option value="inversion">Inversión (fondos/ETF)</option>
          <option value="ignorar">No contar (traspaso…)</option>
        </optgroup>
      </select>
    </form>
  );
}
