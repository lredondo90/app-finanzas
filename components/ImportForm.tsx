"use client";

import { useActionState } from "react";
import { importExcel } from "@/app/actions";

export default function ImportForm({ hasData }: { hasData: boolean }) {
  const [state, action, pending] = useActionState(importExcel, null);
  return (
    <form action={action} className="space-y-3"
      onSubmit={(e) => { if (hasData && !confirm("La importación sustituye TODOS tus datos actuales por los del Excel. ¿Continuar?")) e.preventDefault(); }}>
      <input type="file" name="file" accept=".xlsx" required className="block w-full text-sm text-ink2 file:mr-3 file:rounded-lg file:border-0 file:bg-accent file:px-3 file:py-2 file:text-sm file:text-white" />
      <button className="btn" disabled={pending}>{pending ? "Importando…" : "Importar Excel"}</button>
      {state?.error && <p className="text-sm text-bad">{state.error}</p>}
      {state?.ok && <p className="text-sm text-good">✓ {state.ok}</p>}
    </form>
  );
}
