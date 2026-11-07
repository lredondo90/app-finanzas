import { createNextYear, setActiveYear } from "@/app/actions";

/** Elegir año y crear el siguiente copiando el presupuesto */
export default function YearSwitcher({ year, years, dark }: { year: number; years: number[]; dark?: boolean }) {
  const all = Array.from(new Set([...years, year])).sort();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className={`flex rounded-full p-0.5 text-sm ${dark ? "bg-white/10" : "bg-line/50"}`}>
        {all.map((y) => (
          <form key={y} action={setActiveYear}>
            <input type="hidden" name="year" value={y} />
            <button className={`rounded-full px-3 py-1 ${y === year ? (dark ? "bg-white font-semibold text-[rgb(var(--hero-from))]" : "bg-accent text-white shadow-sm") : dark ? "text-white/80" : "text-ink2"}`}>{y}</button>
          </form>
        ))}
      </div>
      {!all.includes(year + 1) && (
        <form action={createNextYear}>
          <button className={dark ? "hero-chip py-1.5" : "btn-ghost py-1"} title={`Copia lo previsto de ${year} a ${year + 1}`}>+ Crear {year + 1}</button>
        </form>
      )}
    </div>
  );
}
