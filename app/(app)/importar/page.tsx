import Hero from "@/components/Hero";
import BankConnections from "@/components/BankConnections";
import BankImport from "@/components/BankImport";
import type { SuggestedRow } from "@/lib/bankSuggest";
import { deleteImportRule } from "@/app/importActions";
import { getUser } from "@/lib/data";

export const dynamic = "force-dynamic";

const ACTION_LABEL: Record<string, string> = {
  variable: "Gasto variable", fijo: "Gasto fijo", ingreso: "Ingreso fijo", puntual: "Ingreso puntual", inversion: "Inversión", ignorar: "No contar",
};

export default async function ImportarPage({ searchParams }: { searchParams: Promise<{ error?: string; conectado?: string; sync?: string; cuentas?: string; cuentas_ok?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await getUser();
  const [categories, lines, rules, conns, pending] = await Promise.all([
    supabase.from("categories").select("*").order("sort_order"),
    supabase.from("budget_lines").select("*").order("sort_order"),
    supabase.from("import_rules").select("*").order("updated_at", { ascending: false }),
    supabase.from("bank_connections").select("*").order("created_at"),
    supabase.from("bank_pending").select("row").order("created_at"),
  ]);
  // Lo anterior al inicio de la app no se revisa (salvo la nómina y los recibos que pasan al mes siguiente)
  const { data: settings } = await supabase.from("settings").select("start_date").maybeSingle();
  const start: string | null = settings?.start_date ?? null;
  const shifts = (id: string | null) => !!(lines.data ?? []).find((l) => l.id === id)?.next_month;
  const pendingRows = (pending.data ?? []).map((p) => p.row as SuggestedRow)
    .filter((r) => !start || r.date >= start || ((r.action === "ingreso" || r.action === "fijo") && shifts(r.line_id)))
    .sort((a, b) => b.date.localeCompare(a.date));
  const [saved, pend] = (sp.sync ?? "").split("|").map(Number);
  const cats = categories.data ?? [];
  const ls = lines.data ?? [];
  const target = (r: { action: string; category_id: string | null; line_id: string | null }) =>
    r.category_id ? cats.find((c) => c.id === r.category_id)?.name : r.line_id ? ls.find((l) => l.id === r.line_id)?.name : null;

  return (
    <div className="space-y-4">
      <Hero kicker="Bancos" title="Conexiones y movimientos" sub="Los movimientos llegan solos del banco. Los gastos con tarjeta van a su categoría, los recibos e ingresos marcan su concepto como pagado o recibido, y los traspasos no cuentan dos veces." />

      {sp.error && (
        <p className="card border-bad/40 bg-bad/10 text-sm text-bad">
          {sp.error === "config" ? "Falta configurar Enable Banking en Vercel." : sp.error === "banco" ? "Escribe el nombre del banco." : sp.error}
        </p>
      )}
      {sp.conectado && (
        <p className="card border-good/40 bg-good/10 text-sm text-good">
          {sp.cuentas ? "✓ Banco conectado. Elige abajo qué cuentas quieres sincronizar." : "✓ Banco conectado. Pulsa «Sincronizar ahora» para traer los movimientos."}
        </p>
      )}
      {sp.cuentas_ok && (
        <p className="card border-good/40 bg-good/10 text-sm text-good">
          ✓ Guardado: se sincronizarán {sp.cuentas_ok} {sp.cuentas_ok === "1" ? "cuenta" : "cuentas"}. Pulsa «Sincronizar ahora» para traer sus movimientos.
        </p>
      )}
      {sp.sync && !sp.error && (
        <p className="card border-good/40 bg-good/10 text-sm text-good">✓ Sincronizado: {saved || 0} guardados automáticamente, {pend || 0} nuevos por revisar.</p>
      )}

      <BankConnections connections={conns.data ?? []} openId={sp.cuentas} lines={ls.filter((l) => l.section === "fijo")} />

      {pendingRows.length > 0 && <BankImport key={pendingRows.length} pendingMode initialRows={pendingRows} categories={cats} lines={ls} />}


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
