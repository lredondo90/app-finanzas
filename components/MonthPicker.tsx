import Link from "next/link";
import { MONTHS, MONTHS_SHORT } from "@/lib/finance";

/** Selector de mes para la cabecera azul (los meses anteriores al inicio de la app no se muestran) */
export default function MonthPicker({ month, year, base = "/", min = 1 }: { month: number; year: number; base?: string; min?: number }) {
  const href = (m: number) => `${base}?m=${m}`;
  const first = Math.min(min, 12);
  const months = MONTHS_SHORT.map((m, i) => ({ m, n: i + 1 })).filter((x) => x.n >= first);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Link aria-label="Mes anterior" href={href(Math.max(first, month - 1))} className={`hero-chip px-2.5 ${month <= first ? "pointer-events-none opacity-40" : ""}`}>‹</Link>
        <div className="text-lg font-semibold">{MONTHS[month - 1]} <span className="font-normal text-white/60">{year}</span></div>
        <Link aria-label="Mes siguiente" href={href(Math.min(12, month + 1))} className={`hero-chip px-2.5 ${month >= 12 ? "pointer-events-none opacity-40" : ""}`}>›</Link>
      </div>
      {months.length > 1 && (
        <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
          {months.map(({ m, n }) => (
            <Link key={m} href={href(n)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs ${n === month ? "bg-white font-semibold text-[rgb(var(--hero-from))]" : "bg-white/10 text-white/80 hover:bg-white/20"}`}>
              {m}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function currentMonth(param: string | string[] | undefined, year: number, min = 1) {
  const m = Number(Array.isArray(param) ? param[0] : param);
  if (m >= 1 && m <= 12) return Math.max(m, Math.min(min, 12));
  const now = new Date();
  return Math.max(now.getFullYear() === year ? now.getMonth() + 1 : 1, Math.min(min, 12));
}
