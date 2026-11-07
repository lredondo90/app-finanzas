import Nav from "@/components/Nav";
import InstallHint from "@/components/InstallHint";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Nav />
      <div className="min-w-0 flex-1">
        <main className="mx-auto max-w-6xl px-4 pb-28 sm:px-6 md:pb-10">
          {children}
          <div className="mt-4"><InstallHint /></div>
        </main>
      </div>
    </div>
  );
}
