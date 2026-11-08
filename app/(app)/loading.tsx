// Se ve al instante al pulsar una pestaña, mientras llegan los datos
export default function Loading() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Cargando">
      <section className="hero">
        <div className="h-4 w-32 rounded-full bg-white/15" />
        <div className="mt-4 h-10 w-44 rounded-xl bg-white/20" />
        <div className="mt-3 h-3 w-56 rounded-full bg-white/10" />
        <div className="mt-5 grid grid-cols-3 gap-2">
          {[0, 1, 2].map((i) => <div key={i} className="h-14 rounded-2xl bg-white/10" />)}
        </div>
      </section>
      <div className="grid grid-cols-2 gap-3">
        <div className="card h-28" />
        <div className="card h-28" />
      </div>
      <div className="card h-48" />
      <div className="card h-64" />
    </div>
  );
}
