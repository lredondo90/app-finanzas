"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { syncBanks } from "@/app/bankSyncActions";

/** Al abrir la app, si hace más de 8 horas de la última sincronización, trae los movimientos nuevos del banco */
export default function SyncOnOpen() {
  const router = useRouter();
  const done = useRef(false);
  const [state, setState] = useState<"idle" | "syncing" | "done">("idle");
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    setState("syncing");
    syncBanks({ onlyIfStaleHours: 8 })
      .then((r) => { if (r.synced) router.refresh(); })
      .catch(() => {})
      .finally(() => setState("done"));
  }, [router]);
  if (state !== "syncing") return null;
  return <span className="text-xs opacity-80">↻ Sincronizando…</span>;
}
