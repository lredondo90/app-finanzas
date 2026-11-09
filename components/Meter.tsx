/** Barra de progreso con marca opcional de «lo que tocaría llevar hoy» */
export default function Meter({ value, mark, tone = "accent", light }: { value: number; mark?: number | null; tone?: "accent" | "bad" | "good" | "warn"; light?: boolean }) {
  const bg = light ? "bg-white" : tone === "bad" ? "bg-bad" : tone === "good" ? "bg-good" : tone === "warn" ? "bg-warn" : "bg-accent";
  return (
    <div className={`relative h-2.5 rounded-full ${light ? "bg-white/25" : "bg-line/70"}`}>
      <div className={`h-2.5 rounded-full ${bg}`} style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }} />
      {mark != null && (
        <div className={`absolute -top-1 h-[18px] w-0.5 rounded ${light ? "bg-amber-300" : "bg-ink"}`}
          style={{ left: `${Math.min(100, Math.max(0, mark * 100))}%` }} title="Lo que tocaría llevar hoy" />
      )}
    </div>
  );
}
