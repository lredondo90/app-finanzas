"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { type ConfirmRow, confirmBankImport } from "@/app/importActions";
import { type ImportAction, type SuggestedRow, isGenericPattern } from "@/lib/bankSuggest";
import type { BudgetLine, Category } from "@/lib/types";

const eur = (v: number) => v.toLocaleString("es-ES", { style: "currency", currency: "EUR" });

type Row = SuggestedRow & { remember: boolean };

/** Valor del desplegable «qué es»: acción + concepto */
const encode = (r: Pick<Row, "action" | "line_id">) => (r.action === "fijo" || r.action === "ingreso" ? `${r.action}:${r.line_id}` : r.action);

export default function BankImport({ categories, lines, initialRows, pendingMode }: {
  categories: Category[]; lines: BudgetLine[]; initialRows?: SuggestedRow[]; pendingMode?: boolean;
}) {
  const [rows, setRows] = useState<Row[] | null>(initialRows?.length ? initialRows.map((r) => ({ ...r, remember: !isGenericPattern(r.pattern) })) : null);
  const [useReal, setUseReal] = useState(true);
  const [saving, start] = useTransition();
  const [result, setResult] = useState<{ error?: string; ok?: string; months?: string[] } | null>(null);
  const [filter, setFilter] = useState<"todos" | "variable" | "otros">("todos");

  const incomeLines = lines.filter((l) => l.section === "ingreso");
  const fixedLines = lines.filter((l) => l.section === "fijo" && !l.is_annual_fund);
  const update = (i: number, patch: Partial<Row>) => setRows((rs) => rs!.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  const totals = useMemo(() => {
    const t = { variable: 0, ingreso: 0, fijo: 0, puntual: 0, n: 0 };
    for (const r of rows ?? []) {
      if (!r.include) continue;
      t.n++;
      if (r.action === "variable") t.variable += -r.amount;
      if (r.action === "ingreso") t.ingreso += r.amount;
      if (r.action === "fijo") t.fijo += -r.amount;
      if (r.action === "puntual") t.puntual += r.amount;
    }
    return t;
  }, [rows]);

  const save = () => {
    // En «por revisar», lo desmarcado se descarta (se guarda como «no contar» para que no vuelva a salir)
    const payload: ConfirmRow[] = rows!.filter((r) => r.include || pendingMode).map((r) => ({
      key: r.key, pattern: r.pattern, bank: r.bank, date: r.date, description: r.description, detail: r.detail, type: r.type,
      amount: r.amount, action: r.include ? r.action : "ignorar", category_id: r.category_id, line_id: r.line_id, remember: r.include && r.remember,
    }));
    start(async () => {
      const res = await confirmBankImport(payload, useReal);
      setResult(res);
      if (res.ok) setRows(null);
    });
  };

  return (
    <div className="space-y-4">

      {result?.ok && (
        <div className="card border-good/40 bg-good/10">
          <p className="font-medium text-good">✓ {result.ok}</p>
          <div className="mt-2 flex flex-wrap gap-2 text-sm">
            {result.months?.map((ym) => {
              const m = Number(ym.slice(5, 7));
              return (
                <span key={ym} className="flex gap-2">
                  <Link className="btn-ghost py-1" href={`/?m=${m}`}>Dashboard {ym.slice(5, 7)}/{ym.slice(0, 4)}</Link>
                  <Link className="btn-ghost py-1" href={`/ingresos?m=${m}`}>Ingresos y recibos</Link>
                </span>
              );
            })}
          </div>
        </div>
      )}
      {result?.error && <p className="card text-sm text-bad">{result.error}</p>}

      {rows && (
        <div className="card">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="label">{pendingMode ? `Por revisar · ${rows.length} movimientos nuevos del banco` : `Revisa · ${rows.length} movimientos`}</div>
              <p className="mt-1 text-xs text-muted">Cambia lo que no esté bien. Lo marcado con «recordar» lo aprenderé para la próxima vez.</p>
            </div>
            <div className="flex rounded-lg border border-line p-0.5 text-xs">
              {(["todos", "variable", "otros"] as const).map((f) => (
                <button key={f} type="button" onClick={() => setFilter(f)} className={`rounded-md px-2.5 py-1 ${filter === f ? "bg-accent text-white" : "text-ink2"}`}>
                  {f === "todos" ? "Todos" : f === "variable" ? "Gastos variables" : "Resto"}
                </button>
              ))}
            </div>
          </div>

          <ul className="divide-y divide-line">
            {rows.map((r, i) => {
              if (filter === "variable" && r.action !== "variable") return null;
              if (filter === "otros" && r.action === "variable") return null;
              return (
                <li key={r.key} className={`grid gap-2 py-3 sm:grid-cols-[1fr_14rem_12rem] sm:items-center ${r.include ? "" : "opacity-50"}`}>
                  <div className="flex min-w-0 items-start gap-3">
                    <input type="checkbox" checked={r.include} onChange={(e) => update(i, { include: e.target.checked })} aria-label="Importar" className="mt-1 h-4 w-4 shrink-0 accent-[rgb(var(--accent))]" />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium [overflow-wrap:anywhere]">{r.description}</div>
                      <div className="text-xs text-muted">
                        {[r.date.split("-").reverse().join("/"), [r.bank, r.account].filter(Boolean).join(" "), r.type && r.type !== r.description ? r.type : null].filter(Boolean).join(" · ")}
                      </div>
                      {r.detail && <div className="text-xs text-muted [overflow-wrap:anywhere]">{r.detail}</div>}
                      <div className={`text-xs ${r.learned ? "text-good" : "text-ink2"}`}>{r.learned ? "★ " : ""}{r.reason}</div>
                    </div>
                    <div className={`tnum shrink-0 text-right font-semibold ${r.amount > 0 ? "text-good" : ""}`}>{eur(r.amount)}</div>
                  </div>
                  <select className="input" value={encode(r)} aria-label="Qué es"
                    onChange={(e) => {
                      const [a, id] = e.target.value.split(":");
                      update(i, { action: a as ImportAction, line_id: id ?? null, include: true,
                        category_id: a === "variable" ? r.category_id ?? categories.find((c) => c.name === "Otros")?.id ?? null : r.category_id });
                    }}>
                    <option value="variable">Gasto variable</option>
                    <optgroup label="Gasto fijo pagado">
                      {fixedLines.map((l) => <option key={l.id} value={`fijo:${l.id}`}>{l.name}</option>)}
                    </optgroup>
                    <optgroup label="Ingreso fijo recibido">
                      {incomeLines.map((l) => <option key={l.id} value={`ingreso:${l.id}`}>{l.name}</option>)}
                    </optgroup>
                    <option value="puntual">Ingreso puntual</option>
                    <option value="inversion">Inversión (ya cuenta en planes)</option>
                    <option value="ignorar">No contar (traspaso, anual…)</option>
                  </select>
                  <div className="flex items-center gap-2">
                    {r.action === "variable" ? (
                      <select className="input" value={r.category_id ?? ""} onChange={(e) => update(i, { category_id: e.target.value })} aria-label="Categoría">
                        {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    ) : <span className="flex-1" />}
                    <label className="flex shrink-0 items-center gap-1 text-xs text-muted" title="Aplicarlo automáticamente la próxima vez">
                      <input type="checkbox" checked={r.remember} onChange={(e) => update(i, { remember: e.target.checked })} /> recordar
                    </label>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-[1fr_auto] sm:items-center">
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
              <span>Gastos variables <b className="tnum">{eur(totals.variable)}</b></span>
              <span>Fijos pagados <b className="tnum">{eur(totals.fijo)}</b></span>
              <span>Ingresos fijos <b className="tnum text-good">{eur(totals.ingreso)}</b></span>
              <span>Puntuales <b className="tnum text-good">{eur(totals.puntual)}</b></span>
              <label className="flex w-full items-center gap-2 text-xs text-ink2">
                <input type="checkbox" checked={useReal} onChange={(e) => setUseReal(e.target.checked)} />
                Usar el importe real del banco en ingresos y gastos fijos de ese mes (si no, solo se marcan como recibidos/pagados)
              </label>
            </div>
            <button type="button" className="btn" disabled={saving || totals.n === 0} onClick={save}>
              {saving ? "Guardando…" : pendingMode ? `Guardar ${totals.n} y descartar ${rows.length - totals.n}` : `Guardar ${totals.n} movimientos`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
