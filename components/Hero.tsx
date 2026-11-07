/** Cabecera azul de cada pantalla: título pequeño, cifra grande y lo que se quiera debajo */
export default function Hero({ title, kicker, value, sub, children, right, top }: {
  title?: React.ReactNode; kicker?: React.ReactNode; value?: React.ReactNode; sub?: React.ReactNode; children?: React.ReactNode; right?: React.ReactNode;
  /** Va encima de todo (p. ej. el selector de mes) */
  top?: React.ReactNode;
}) {
  return (
    <section className="hero">
      {top && <div className="mb-4">{top}</div>}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {kicker && <div className="text-xs font-medium uppercase tracking-wider text-white/60">{kicker}</div>}
          {title && <h1 className="mt-0.5 text-xl font-semibold sm:text-2xl">{title}</h1>}
        </div>
        {right}
      </div>
      {value != null && <div className="tnum mt-3 text-[2.4rem] font-semibold leading-none tracking-tight sm:text-5xl">{value}</div>}
      {sub && <div className="mt-2 text-sm text-white/75">{sub}</div>}
      {children && <div className="mt-4">{children}</div>}
    </section>
  );
}
