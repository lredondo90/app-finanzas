import BankImport from "@/components/BankImport";
import { deleteImportRule } from "@/app/importActions";
import { getUser } from "@/lib/data";

export const dynamic = "force-dynamic";

const ACTION_LABEL: Record<string, string> = {
  variable: "Gasto variable", fijo: "Gasto fijo", ingreso: "Ingreso fijo", puntual: "Ingreso puntual", inversion: "Inversión", ignorar: "No contar",
};

export default async function ImportarPage() {
  const { supabase } = await getUser();
  const [categories, lines, rules] = await Promise.all([
    supabase.from("categories").select("*").order("sort_order"),
    supabase.from("budget_lines").select("*").order("sort_order"),
    supabase.from("import_rules").select("*").order("updated_at", { ascending: false }),
  ]);
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

      <BankImport categories={cats} lines={ls} />

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
