import { createNextYear, setActiveYear } from "@/app/actions";

/** Elegir año y crear el siguiente copiando el presupuesto */
export default function YearSwitcher({ year, years }: { year: number; years: number[] }) {
  const all = Array.from(new Set([...years, year])).sort();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex rounded-full bg-line/50 p-0.5 text-sm">
        {all.map((y) => (
          <form key={y} action={setActiveYear}>
            <input type="hidden" name="year" value={y} />
            <button className={`rounded-full px-3 py-1 ${y === year ? "bg-accent text-white shadow-sm" : "text-ink2"}`}>{y}</button>
          </form>
        ))}
      </div>
      {!all.includes(year + 1) && (
        <form action={createNextYear}>
          <button className="btn-ghost rounded-full py-1" title={`Copia lo previsto de ${year} a ${year + 1}`}>+ Crear {year + 1}</button>
        </form>
      )}
    </div>
  );
}
