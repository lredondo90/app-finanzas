import Link from "next/link";
import { MONTHS, MONTHS_SHORT } from "@/lib/finance";

export default function MonthPicker({ month, year, base = "/" }: { month: number; year: number; base?: string }) {
  const href = (m: number) => `${base}?m=${m}`;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1">
        <Link aria-label="Mes anterior" href={href(Math.max(1, month - 1))} className="btn-ghost px-2 py-1">‹</Link>
        <h1 className="min-w-[10rem] text-center text-xl font-semibold sm:text-2xl">
          {MONTHS[month - 1]} <span className="text-muted">{year}</span>
        </h1>
        <Link aria-label="Mes siguiente" href={href(Math.min(12, month + 1))} className="btn-ghost px-2 py-1">›</Link>
      </div>
      <div className="flex max-w-full gap-1 overflow-x-auto">
        {MONTHS_SHORT.map((m, i) => (
          <Link key={m} href={href(i + 1)}
            className={`rounded-md px-2 py-1 text-xs ${i + 1 === month ? "bg-accent text-white" : "text-ink2 hover:bg-line/50"}`}>
            {m}
          </Link>
        ))}
      </div>
    </div>
  );
}

export function currentMonth(param: string | string[] | undefined, year: number) {
  const m = Number(Array.isArray(param) ? param[0] : param);
  if (m >= 1 && m <= 12) return m;
  const now = new Date();
  return now.getFullYear() === year ? now.getMonth() + 1 : 1;
}
