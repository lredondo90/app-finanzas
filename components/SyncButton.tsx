"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { syncBanks } from "@/app/bankSyncActions";

type Result = Awaited<ReturnType<typeof syncBanks>>;

/** Botón «Sincronizar ahora»: dice que está trabajando (puede tardar un minuto) y el resultado justo debajo */
export default function SyncButton({ compact }: { compact?: boolean } = {}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<Result | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const run = () => {
    setResult(null);
    setFailed(null);
    start(async () => {
      try {
        const r = await syncBanks();
        setResult(r);
        router.refresh();
      } catch (e) {
        setFailed(e instanceof Error ? e.message : "No se pudo sincronizar");
      }
    });
  };

  if (compact) {
    const msg = failed ? `⚠ ${failed}` : result ? (result.synced ? `✓ ${result.saved} nuevos` : result.skipped.length ? "Sin consultas hoy" : "Sin cambios") : null;
    return (
      <div className="flex flex-col items-end gap-1">
        <button type="button" onClick={run} disabled={pending} className="hero-chip inline-flex items-center gap-1.5 py-1.5 disabled:opacity-70" aria-label="Sincronizar con el banco">
          <span className={`inline-block ${pending ? "animate-spin" : ""}`}>↻</span>{pending ? "Sincronizando…" : "Sincronizar"}
        </button>
        {msg && !pending && <span className="text-[11px] text-white/70">{msg}</span>}
      </div>
    );
  }
  return (
    <div className="w-full sm:w-auto">
      <button type="button" onClick={run} disabled={pending} className="btn-ghost w-full py-1.5 disabled:opacity-60 sm:w-auto">
        {pending ? <span className="inline-flex items-center gap-2"><span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />Sincronizando…</span> : "↻ Sincronizar ahora"}
      </button>
      {pending && <p className="mt-1 text-xs text-muted">Consultando cada banco, puede tardar hasta un minuto.</p>}
      {failed && <p className="mt-1 text-xs text-bad">⚠ {failed}</p>}
      {result && (
        <div className="mt-1 space-y-0.5 text-xs">
          <p className={result.synced ? "text-good" : "text-ink2"}>
            {result.synced
              ? `✓ ${result.synced} ${result.synced === 1 ? "banco sincronizado" : "bancos sincronizados"}: ${result.saved} movimientos guardados, ${result.pending} por revisar.`
              : "No se ha podido consultar ningún banco ahora."}
          </p>
          {result.skipped.length > 0 && <p className="text-warn">{result.skipped.join(", ")}: ya se usaron hoy las consultas que permite el banco; mañana se vuelve a intentar.</p>}
          {result.errors.map((e) => <p key={e} className="text-bad">⚠ {e}</p>)}
        </div>
      )}
    </div>
  );
}
