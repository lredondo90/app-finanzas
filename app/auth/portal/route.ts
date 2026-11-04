import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Entrada desde el portal "Mis apps": si ya hay sesión entra directo; si no, inicia sesión con Google
// sin pedir nada más (Google reconoce la cuenta con login_hint y vuelve sola).
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? url.host;
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const origin = `${proto}://${host}`;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) return NextResponse.redirect(`${origin}/`);

  const email = url.searchParams.get("email") ?? "";
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback`,
      queryParams: /^[^\s@]+@[^\s@]+$/.test(email) ? { login_hint: email } : undefined,
    },
  });
  if (error || !data.url) return NextResponse.redirect(`${origin}/login?error=google`);
  return NextResponse.redirect(data.url);
}
