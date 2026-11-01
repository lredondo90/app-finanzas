import Link from "next/link";
import Nav from "@/components/Nav";
import { signOut } from "../actions";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Nav />
      <div className="min-w-0 flex-1">
        <header className="flex items-center justify-end gap-2 px-4 pt-3 sm:px-6">
          <Link href="/ajustes" className="text-xs text-muted hover:text-ink md:hidden">Ajustes</Link>
          <form action={signOut}>
            <button className="text-xs text-muted hover:text-ink">Cerrar sesión</button>
          </form>
        </header>
        <main className="mx-auto max-w-6xl px-4 pb-24 pt-2 sm:px-6 md:pb-10">{children}</main>
      </div>
    </div>
  );
}
