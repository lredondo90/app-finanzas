// Menú de la app (sirve en servidor y cliente)
export const I = {
  home: "M3 11.5 12 4l9 7.5M5.5 9.5V20h13V9.5M10 20v-5h4v5",
  list: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01",
  budget: "M4 19V9m5.5 10V5M15 19v-7m5.5 7V8",
  wealth: "M3 7h18v12H3zM3 11h18M7 15h3",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  income: "M12 3v18M17 7.5C17 5.6 14.8 4.5 12 4.5S7 5.6 7 7.5s2 2.6 5 3.3 5 1.6 5 3.6-2.2 3.1-5 3.1-5-1.1-5-3",
  annual: "M7 3v3m10-3v3M4 8h16M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z",
  invest: "M3 17l6-6 4 4 8-8M14 7h7v7",
  house: "M4 10.5 12 4l8 6.5V20H4zM9.5 14.2c0-1 .8-1.7 1.6-1.7.4 0 .7.2.9.4.2-.2.5-.4.9-.4.9 0 1.6.7 1.6 1.7 0 1.6-2.5 3.1-2.5 3.1s-2.5-1.5-2.5-3.1z",
  bank: "M3 10l9-6 9 6M5 10v8m4.7-8v8m4.6-8v8M19 10v8M3 20h18",
  gear: "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z",
};

export const NAV_ALL = [
  { href: "/", label: "Inicio", icon: I.home },
  { href: "/gastos", label: "Movimientos", icon: I.list },
  { href: "/ingresos", label: "Ingresos y recibos", icon: I.income },
  { href: "/presupuesto", label: "Presupuesto", icon: I.budget },
  { href: "/anuales", label: "Anuales", icon: I.annual },
  { href: "/patrimonio", label: "Patrimonio", icon: I.wealth },
  { href: "/casa", label: "Casa", icon: I.house },
  { href: "/inversion", label: "Planes e inversión", icon: I.invest },
  { href: "/importar", label: "Bancos", icon: I.bank },
  { href: "/ajustes", label: "Ajustes", icon: I.gear },
];


export function Icon({ d, className = "h-5 w-5" }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

