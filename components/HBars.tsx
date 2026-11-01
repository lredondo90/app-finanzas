// Barras horizontales simples (una sola serie) con etiqueta directa del importe
export default function HBars({ rows, format, max }: { rows: { label: string; value: number; hint?: string; href?: string }[]; format: (v: number) => string; max?: number }) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label} title={`${r.label}: ${format(r.value)}${r.hint ? ` · ${r.hint}` : ""}`} className="group">
          <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
            <span className="truncate text-ink2 group-hover:text-ink">{r.label}</span>
            <span className="tnum shrink-0 font-medium">{format(r.value)}</span>
          </div>
          <div className="h-2 rounded-full bg-line/60">
            <div className="h-2 rounded-full bg-accent" style={{ width: `${Math.max(r.value > 0 ? 2 : 0, (r.value / top) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
