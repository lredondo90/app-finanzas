import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { type StoredAccount, createSession } from "@/lib/enableBanking";
import { createClient } from "@/lib/supabase/server";

// Vuelta desde la web del banco tras dar permiso
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const back = (q: string) => NextResponse.redirect(`${origin}/importar?${q}`);
  const jar = await cookies();
  const saved = jar.get("eb_state")?.value;
  jar.delete("eb_state");

  const err = searchParams.get("error");
  if (err) return back(`error=${encodeURIComponent(searchParams.get("error_description") ?? err)}`);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  let expected: { state: string; name: string } | null = null;
  try { expected = saved ? JSON.parse(saved) : null; } catch {}
  if (!code || !expected || expected.state !== state) return back("error=" + encodeURIComponent("La conexión ha caducado o no es válida. Vuelve a intentarlo."));

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login`);

  try {
    const s = await createSession(code);
    const list = s.accounts ?? [];
    // Con una sola cuenta se sincroniza directamente; con varias (p. ej. cuentas en las que eres autorizado) eliges antes cuáles
    const accounts: StoredAccount[] = list.map((a) => ({
      uid: a.uid, iban: a.account_id?.iban ?? null, name: a.name ?? a.details ?? null, product: a.product ?? null, currency: a.currency ?? null,
      ...(list.length === 1 ? { sync: true } : {}),
    }));
    const { data: created, error } = await supabase.from("bank_connections").insert({
      aspsp_name: s.aspsp?.name ?? expected.name,
      aspsp_country: s.aspsp?.country ?? "ES",
      session_id: s.session_id,
      accounts,
      valid_until: s.access?.valid_until ?? null,
    }).select("id").single();
    if (error) throw new Error(error.message);
    return back(accounts.length > 1 ? `conectado=1&cuentas=${created.id}` : "conectado=1");
  } catch (e) {
    return back("error=" + encodeURIComponent(e instanceof Error ? e.message : "No se pudo crear la conexión"));
  }
}
