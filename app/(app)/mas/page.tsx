import Link from "next/link";
import Hero from "@/components/Hero";
import { Icon, MORE } from "@/components/navItems";
import { signOut } from "@/app/actions";
import { getUser } from "@/lib/data";

export const dynamic = "force-dynamic";

const HINT: Record<string, string> = {
  "/ano": "Cómo vas a acabar el año frente a tu plan",
  "/patrimonio": "Cuentas, fondos y evolución",
  "/inquilino": "Lo que te debe, lo que te paga y la lista para enviársela",
  "/anuales": "Cuáles has pagado este año y cuáles faltan",
  "/plan": "Tu plan del año, cambios puntuales y recibos anuales",
  "/casa": "Cuentas conjuntas: aportaciones, gastos de casa y presupuesto",
  "/ingresos": "Nómina, alquileres y recibos del mes",
  "/inversion": "Aportaciones a planes y operaciones",
  "/importar": "Conexiones, cuentas y movimientos por revisar",
  "/ajustes": "Año, día de corte, categorías",
};

export default async function MasPage() {
  const { user } = await getUser();
  const items = MORE;
  return (
    <div className="space-y-4">
      <Hero kicker="Mis Finanzas" title="Más opciones" sub={user.email} />
      <ul className="card divide-y divide-line p-0 sm:p-0">
        {items.map((it) => (
          <li key={it.href}>
            <Link href={it.href} className="flex items-center gap-3 px-4 py-3.5 hover:bg-line/30">
              <span className="icon-tile bg-accent/10 text-accent"><Icon d={it.icon} /></span>
              <span className="min-w-0 flex-1"><span className="block font-medium">{it.label}</span><span className="block truncate text-xs text-muted">{HINT[it.href]}</span></span>
              <span className="text-muted">›</span>
            </Link>
          </li>
        ))}
      </ul>
      <form action={signOut}><button className="btn-ghost w-full">Cerrar sesión</button></form>
    </div>
  );
}
