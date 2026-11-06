"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Dashboard", icon: "M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" },
  { href: "/gastos", label: "Gastos", icon: "M4 6h16M4 12h16M4 18h10" },
  { href: "/ingresos", label: "Ingresos", icon: "M12 3v18M17 7.5C17 5.6 14.8 4.5 12 4.5S7 5.6 7 7.5s2 2.6 5 3.3 5 1.6 5 3.6-2.2 3.1-5 3.1-5-1.1-5-3" },
  { href: "/presupuesto", label: "Presupuesto", icon: "M4 4h16v16H4zM4 10h16M10 4v16" },
  { href: "/anuales", label: "Anuales", icon: "M7 3v3m10-3v3M4 8h16M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z" },
  { href: "/inversion", label: "Inversión", icon: "M3 17l6-6 4 4 8-8M14 7h7v7" },
  { href: "/patrimonio", label: "Patrimonio", icon: "M3 10l9-6 9 6M5 10v9h14v-9M9 19v-5h6v5" },
  { href: "/ajustes", label: "Ajustes", icon: "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" },
];

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

export default function Nav() {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <>
      {/* Escritorio */}
      <nav className="hidden w-56 shrink-0 flex-col gap-1 border-r border-line bg-surface p-3 md:flex">
        <div className="mb-4 flex items-center gap-2 px-2 pt-2">
          <img src="/icon.svg" alt="" className="h-7 w-7" />
          <span className="font-semibold">Mis Finanzas</span>
        </div>
        {items.map((it) => (
          <Link key={it.href} href={it.href}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${active(it.href) ? "bg-accent/10 font-medium text-accent" : "text-ink2 hover:bg-line/40"}`}>
            <Icon d={it.icon} /> {it.label}
          </Link>
        ))}
      </nav>
      {/* Móvil */}
      <nav className="fixed inset-x-0 bottom-0 z-20 flex justify-around border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
        {items.filter((it) => ["/", "/gastos", "/ingresos", "/presupuesto", "/patrimonio"].includes(it.href)).map((it) => (
          <Link key={it.href} href={it.href}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] ${active(it.href) ? "text-accent" : "text-muted"}`}>
            <Icon d={it.icon} /> {it.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
