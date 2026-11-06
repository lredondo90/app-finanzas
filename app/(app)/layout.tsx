import Link from "next/link";
import Nav from "@/components/Nav";
import InstallHint from "@/components/InstallHint";
import { signOut } from "../actions";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Nav />
      <div className="min-w-0 flex-1">
        <header className="flex items-center justify-end gap-2 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6">
          <Link href="/anuales" className="text-xs text-muted hover:text-ink md:hidden">Anuales</Link>
          <Link href="/inversion" className="text-xs text-muted hover:text-ink md:hidden">Inversión</Link>
          <Link href="/ajustes" className="text-xs text-muted hover:text-ink md:hidden">Ajustes</Link>
          <form action={signOut}>
            <button className="text-xs text-muted hover:text-ink">Cerrar sesión</button>
          </form>
        </header>
        <main className="mx-auto max-w-6xl px-4 pb-28 pt-2 sm:px-6 md:pb-10">
          <InstallHint />
          {children}
        </main>
      </div>
    </div>
  );
}
