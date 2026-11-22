import Hero from "@/components/Hero";
import TrStatement from "@/components/TrStatement";

export const dynamic = "force-dynamic";
// Cuadrar un mes entero puede tocar unas decenas de movimientos
export const maxDuration = 60;

export default function CuadrarPage() {
  return (
    <div className="space-y-4">
      <Hero kicker="Trade Republic" title="Cuadrar con el extracto"
        sub="El banco solo manda fecha e importe. Sube el extracto del mes y cada movimiento tendrá su nombre; te digo si falta o sobra algo." />
      <TrStatement />
    </div>
  );
}
