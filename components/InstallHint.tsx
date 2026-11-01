"use client";

import { useEffect, useState } from "react";

/** Aviso para instalar la app en iPhone (Safari no muestra botón de instalar) */
export default function InstallHint() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone;
      setShow(ios && !standalone && localStorage.getItem("installHint") !== "off");
    } catch {
      /* sin localStorage */
    }
  }, []);
  if (!show) return null;
  return (
    <div className="mb-3 flex items-start gap-3 rounded-xl border border-accent/30 bg-accent/10 p-3 text-sm">
      <svg viewBox="0 0 24 24" className="mt-0.5 h-5 w-5 shrink-0 text-accent" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
      </svg>
      <p className="flex-1 text-ink2">
        <b className="text-ink">Instálala en tu iPhone:</b> en Safari pulsa <b>Compartir</b> y luego <b>«Añadir a pantalla de inicio»</b>.
      </p>
      <button className="text-muted" aria-label="Cerrar" onClick={() => { try { localStorage.setItem("installHint", "off"); } catch {} setShow(false); }}>×</button>
    </div>
  );
}
