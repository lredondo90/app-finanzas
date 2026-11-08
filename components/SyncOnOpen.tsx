"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { syncBanks } from "@/app/bankSyncActions";

/** La primera vez que abres la app cada día trae los movimientos nuevos del banco (el resto del día, con el botón) */
export default function SyncOnOpen() {
  const router = useRouter();
  const done = useRef(false);
  const [state, setState] = useState<"idle" | "syncing" | "done">("idle");
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    // Solo una vez al día por dispositivo: así volver a Inicio no lanza nada (la app va más ágil)
    const today = new Date().toLocaleDateString("en-CA");
    try {
      if (localStorage.getItem("autoSync") === today) return;
      localStorage.setItem("autoSync", today);
    } catch { /* sin almacenamiento: el servidor ya limita a una vez al día */ }
    setState("syncing");
    syncBanks({ oncePerDay: true })
      .then((r) => { if (r.synced) router.refresh(); })
      .catch(() => {})
      .finally(() => setState("done"));
  }, [router]);
  if (state !== "syncing") return null;
  return <span className="text-xs opacity-80">↻ Sincronizando…</span>;
}
