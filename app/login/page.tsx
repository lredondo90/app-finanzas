"use client";

import { useActionState, useState } from "react";
import { signIn, signInWithGoogle, signUp } from "../actions";

export default function LoginPage() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [inState, inAction, inPending] = useActionState(signIn, null);
  const [upState, upAction, upPending] = useActionState(signUp, null);
  const state = (mode === "in" ? inState : upState) as { error?: string; info?: string } | null;

  return (
    <main className="flex min-h-screen items-center justify-center p-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="card w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <img src="/icon.svg" alt="" className="h-10 w-10" />
          <div>
            <h1 className="text-lg font-semibold">Mis Finanzas</h1>
            <p className="text-sm text-ink2">{mode === "in" ? "Inicia sesión" : "Crea tu cuenta"}</p>
          </div>
        </div>
        <form action={signInWithGoogle}>
          <button className="btn-ghost w-full gap-2 py-2.5 text-ink">
            <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden="true">
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.4-.4-3.5z" />
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
              <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
            </svg>
            Entrar con Google
          </button>
        </form>
        <div className="my-4 flex items-center gap-3 text-xs text-muted">
          <span className="h-px flex-1 bg-line" />o con email<span className="h-px flex-1 bg-line" />
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
