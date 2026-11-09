"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, NAV_ALL, TABS } from "./navItems";


export default function Nav() {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <>
      {/* Escritorio: barra lateral azul */}
      <nav className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-1 p-3 text-white md:flex"
        style={{ background: "linear-gradient(180deg, rgb(var(--hero-from)), rgb(var(--hero-to)))" }}>
        <div className="mb-5 flex items-center gap-2 px-2 pt-3">
          <img src="/icon.svg" alt="" className="h-8 w-8 rounded-xl" />
          <span className="text-lg font-semibold">Mis Finanzas</span>
        </div>
        {NAV_ALL.map((it) => (
          <Link key={it.href} href={it.href}
            className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm ${active(it.href) ? "bg-white/15 font-semibold" : "text-white/75 hover:bg-white/10"}`}>
            <Icon d={it.icon} /> {it.label}
          </Link>
        ))}
      </nav>
      {/* Móvil: barra inferior */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line/70 bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
        <div className="flex">
          {TABS.map((it) => {
            const on = active(it.href);
            return (
              <Link key={it.href} href={it.href}
                className={`flex flex-1 flex-col items-center gap-1 pb-1.5 pt-2 text-[10px] ${on ? "font-semibold text-accent" : "text-muted"}`}>
                <span className={`rounded-full px-4 py-0.5 ${on ? "bg-accent/10" : ""}`}><Icon d={it.icon} /></span>
                {it.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
