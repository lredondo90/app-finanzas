"use client";

import { useState } from "react";

/** Botón para enviar un texto (WhatsApp, correo…) o copiarlo si el dispositivo no puede compartir */
export default function ShareList({ text, title }: { text: string; title: string }) {
  const [msg, setMsg] = useState("");
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setMsg("✓ Copiado"); } catch { setMsg("No se ha podido copiar"); }
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className="btn min-h-[2.75rem]" onClick={async () => {
        if (navigator.share) { try { await navigator.share({ title, text }); } catch { /* cancelado */ } }
        else await copy();
      }}>Enviar la lista</button>
      <button type="button" className="btn-ghost min-h-[2.75rem]" onClick={copy}>Copiar</button>
      <span className="text-xs font-semibold text-good" aria-live="polite">{msg}</span>
    </div>
  );
}
