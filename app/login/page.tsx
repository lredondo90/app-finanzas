"use client";

import { useActionState, useState } from "react";
import { signIn, signUp } from "../actions";

export default function LoginPage() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [inState, inAction, inPending] = useActionState(signIn, null);
  const [upState, upAction, upPending] = useActionState(signUp, null);
  const state = (mode === "in" ? inState : upState) as { error?: string; info?: string } | null;

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="card w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <img src="/icon.svg" alt="" className="h-10 w-10" />
          <div>
            <h1 className="text-lg font-semibold">Mis Finanzas</h1>
            <p className="text-sm text-ink2">{mode === "in" ? "Inicia sesión" : "Crea tu cuenta"}</p>
          </div>
        </div>
        <form action={mode === "in" ? inAction : upAction} className="space-y-3">
          <input className="input" name="email" type="email" placeholder="Email" required autoComplete="email" />
          <input className="input" name="password" type="password" placeholder="Contraseña" required minLength={6}
            autoComplete={mode === "in" ? "current-password" : "new-password"} />
          {state?.error && <p className="text-sm text-bad">{state.error}</p>}
          {state?.info && <p className="text-sm text-good">{state.info}</p>}
          <button className="btn w-full" disabled={inPending || upPending}>
            {mode === "in" ? "Entrar" : "Crear cuenta"}
          </button>
        </form>
        <button className="mt-4 w-full text-center text-sm text-accent" onClick={() => setMode(mode === "in" ? "up" : "in")}>
          {mode === "in" ? "¿No tienes cuenta? Regístrate" : "¿Ya tienes cuenta? Inicia sesión"}
        </button>
      </div>
    </main>
  );
}
