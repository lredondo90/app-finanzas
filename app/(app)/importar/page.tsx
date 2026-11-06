import BankConnections from "@/components/BankConnections";
import BankImport from "@/components/BankImport";
import type { SuggestedRow } from "@/lib/bankSuggest";
import { deleteImportRule } from "@/app/importActions";
import { getUser } from "@/lib/data";

export const dynamic = "force-dynamic";

const ACTION_LABEL: Record<string, string> = {
  variable: "Gasto variable", fijo: "Gasto fijo", ingreso: "Ingreso fijo", puntual: "Ingreso puntual", inversion: "Inversión", ignorar: "No contar",
};

export default async function ImportarPage({ searchParams }: { searchParams: Promise<{ error?: string; conectado?: string; sync?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await getUser();
  const [categories, lines, rules, conns, pending] = await Promise.all([
    supabase.from("categories").select("*").order("sort_order"),
    supabase.from("budget_lines").select("*").order("sort_order"),
    supabase.from("import_rules").select("*").order("updated_at", { ascending: false }),
    supabase.from("bank_connections").select("*").order("created_at"),
    supabase.from("bank_pending").select("row").order("created_at"),
  ]);
  const pendingRows = (pending.data ?? []).map((p) => p.row as SuggestedRow).sort((a, b) => b.date.localeCompare(a.date));
  const [saved, pend] = (sp.sync ?? "").split("|").map(Number);
  const cats = categories.data ?? [];
  const ls = lines.data ?? [];
  const target = (r: { action: string; category_id: string | null; line_id: string | null }) =>
    r.category_id ? cats.find((c) => c.id === r.category_id)?.name : r.line_id ? ls.find((l) => l.id === r.line_id)?.name : null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Importar extracto del banco</h1>
        <p className="text-sm text-ink2">
          Sube el extracto del mes. Los gastos con tarjeta se apuntan como gastos variables con su categoría, los recibos e ingresos
          marcan como pagado/recibido su concepto fijo, y los traspasos o aportaciones a planes no se cuentan dos veces.
        </p>
      </div>

      {sp.error && (
        <p className="card border-bad/40 bg-bad/10 text-sm text-bad">
          {sp.error === "config" ? "Falta configurar Enable Banking en Vercel." : sp.error === "banco" ? "Escribe el nombre del banco." : sp.error}
        </p>
      )}
      {sp.conectado && <p className="card border-good/40 bg-good/10 text-sm text-good">✓ Banco conectado. Pulsa «Sincronizar ahora» para traer los movimientos.</p>}
      {sp.sync && !sp.error && (
        <p className="card border-good/40 bg-good/10 text-sm text-good">✓ Sincronizado: {saved || 0} guardados automáticamente, {pend || 0} nuevos por revisar.</p>
      )}

      <BankConnections connections={conns.data ?? []} />

      {pendingRows.length > 0 && <BankImport key={pendingRows.length} pendingMode initialRows={pendingRows} categories={cats} lines={ls} />}

      <details className="card" open={!(conns.data ?? []).length}>
        <summary className="cursor-pointer text-sm font-medium">Subir un extracto a mano (Excel, CSV o PDF)</summary>
        <div className="mt-3"><BankImport categories={cats} lines={ls} /></div>
      </details>

      {(rules.data?.length ?? 0) > 0 && (
        <details className="card">
          <summary className="cursor-pointer text-sm font-medium">Lo que he aprendido ({rules.data!.length})</summary>
          <ul className="mt-3 divide-y divide-line text-sm">
            {rules.data!.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-1.5">
                <span className="min-w-0 flex-1 truncate text-ink2">{r.pattern}</span>
                <span className="shrink-0">{ACTION_LABEL[r.action]}{target(r) ? ` · ${target(r)}` : ""}</span>
                <form action={deleteImportRule}><input type="hidden" name="pattern" value={r.pattern} /><button className="text-muted hover:text-bad" aria-label="Olvidar">×</button></form>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
