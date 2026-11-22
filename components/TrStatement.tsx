"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addMissingLine, dropExtraMovement, reconcileTrStatement, type ReconcileResult } from "@/app/trStatementActions";

const eur = (v: number) => v.toLocaleString("es-ES", { style: "currency", currency: "EUR" });
const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** Subir el extracto de Trade Republic y ver qué cuadra */
export default function TrStatement() {
  const [res, setRes] = useState<ReconcileResult | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});
  const [busy, start] = useTransition();
  const router = useRouter();

  const upload = (form: FormData) => start(async () => {
    setDone({});
    setRes(await reconcileTrStatement(form));
    router.refresh();
  });
  const act = (key: string, fn: () => Promise<unknown>, label: string) => start(async () => {
    await fn();
    setDone((d) => ({ ...d, [key]: label }));
    router.refresh();
  });

  const extras = res?.extras ?? [];
  const missing = res?.missing ?? [];
  const pendientes = extras.filter((x) => !done[`x${x.id}`]).length + missing.filter((_, i) => !done[`m${i}`]).length;

  return (
    <div className="space-y-4">
      <form action={upload} className="card space-y-3">
        <p className="text-sm text-ink2">
          En la app de Trade Republic: <b>Perfil → Documentos → Extracto de cuenta</b> (o «Estado de cuenta»), elige el mes y descarga el PDF. Súbelo aquí.
        </p>
        <input name="file" type="file" accept="application/pdf,.pdf" required className="block w-full text-sm" />
        <button className="btn w-full sm:w-auto" disabled={busy}>{busy && !res ? "Leyendo el extracto…" : "Subir y cuadrar"}</button>
        <p className="text-xs text-muted">El PDF se lee en el servidor y no se guarda. Solo se guarda el nombre y la categoría de cada movimiento.</p>
      </form>

      {res?.error && <p className="card border-bad/40 bg-bad/10 text-sm text-bad">{res.error}</p>}

      {res && !res.error && (
        <>
          <div className={`card text-sm ${pendientes === 0 && res.balanced ? "border-good/40 bg-good/10" : ""}`}>
            <p className="font-semibold">
              {pendientes === 0 && res.balanced ? "✓ Todo cuadra" : `${pendientes} ${pendientes === 1 ? "cosa por revisar" : "cosas por revisar"}`}
              <span className="font-normal text-muted"> · del {res.from ? dm(res.from) : "?"} al {res.to ? dm(res.to) : "?"}</span>
            </p>
            <ul className="mt-2 space-y-0.5 text-ink2">
              <li>{res.matched} de {res.total} movimientos del extracto encontrados en la app</li>
              {(res.named ?? 0) > 0 && <li>{res.named} con su nombre puesto ahora</li>}
              {(res.recategorized?.length ?? 0) > 0 && <li>{res.recategorized!.length} pasados de «Otros» a su categoría</li>}
              {(res.toInvestment?.length ?? 0) > 0 && <li>{res.toInvestment!.length} compras del plan de inversión marcadas como inversión</li>}
            </ul>
            {!res.balanced && <p className="mt-2 text-xs text-bad">Los saldos del PDF no cuadran del todo: {(res.warnings ?? []).join(" ") || "revisa que sea el extracto completo."}</p>}
          </div>

          {extras.length > 0 && (
            <div className="card">
              <h2 className="section-title">En la app pero no en el extracto</h2>
              <p className="mb-2 text-xs text-muted">Cuentan en tus números y Trade Republic no los tiene. Casi siempre es un movimiento repetido.</p>
              <ul className="divide-y divide-line/70 text-sm">
                {extras.map((x) => (
                  <li key={x.id} className="flex items-center gap-2 py-1.5">
                    <span className="tnum w-11 shrink-0 text-xs text-muted">{dm(x.date)}</span>
                    <span className="min-w-0 flex-1 truncate text-ink2">{x.description}{x.category ? ` · ${x.category}` : ""}</span>
                    <span className="tnum shrink-0 font-medium">{eur(x.amount)}</span>
                    {done[`x${x.id}`]
                      ? <span className="shrink-0 text-xs text-good">{done[`x${x.id}`]}</span>
                      : <button className="btn-ghost shrink-0 text-xs" disabled={busy} onClick={() => act(`x${x.id}`, () => dropExtraMovement(x.id), "✓ Ya no cuenta")}>No contar</button>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {missing.length > 0 && (
            <div className="card">
              <h2 className="section-title">En el extracto pero no en la app</h2>
              <p className="mb-2 text-xs text-muted">No llegaron por la conexión del banco. Añádelos para que el mes cuadre.</p>
              <ul className="divide-y divide-line/70 text-sm">
                {missing.map((m, i) => (
                  <li key={i} className="flex items-center gap-2 py-1.5">
                    <span className="tnum w-11 shrink-0 text-xs text-muted">{dm(m.line.date)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-ink2">{m.line.description || m.line.type}</span>
                      <span className="block text-xs text-muted">{m.suggestion.label}</span>
                    </span>
                    <span className={`tnum shrink-0 font-medium ${m.line.amount > 0 ? "text-good" : ""}`}>{eur(m.line.amount)}</span>
                    {done[`m${i}`]
                      ? <span className="shrink-0 text-xs text-good">{done[`m${i}`]}</span>
                      : <button className="btn-ghost shrink-0 text-xs" disabled={busy} onClick={() => act(`m${i}`, () => addMissingLine(m), "✓ Añadido")}>Añadir</button>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {((res.recategorized?.length ?? 0) > 0 || (res.toInvestment?.length ?? 0) > 0) && (
            <details className="card text-sm">
              <summary className="cursor-pointer list-none font-medium">Qué he cambiado ›</summary>
              <ul className="mt-2 divide-y divide-line/70">
                {res.toInvestment!.map((x, i) => (
                  <li key={`i${i}`} className="flex gap-2 py-1.5"><span className="tnum w-11 shrink-0 text-xs text-muted">{dm(x.date)}</span><span className="min-w-0 flex-1 truncate text-ink2">{x.description}</span><span className="shrink-0 text-xs">Inversión</span></li>
                ))}
                {res.recategorized!.map((x, i) => (
                  <li key={`c${i}`} className="flex gap-2 py-1.5"><span className="tnum w-11 shrink-0 text-xs text-muted">{dm(x.date)}</span><span className="min-w-0 flex-1 truncate text-ink2">{x.description}</span><span className="shrink-0 text-xs">{x.category}</span></li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted">Si algo no está bien, cámbialo desde Movimientos.</p>
            </details>
          )}
        </>
      )}
    </div>
  );
}
