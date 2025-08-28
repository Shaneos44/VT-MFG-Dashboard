export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

const ALLOWED_DOMAIN = process.env.ALLOWED_EMAIL_DOMAIN || "vitaltrace.com.au";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  if (code) {
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: CookieOptions) {
            cookieStore.set({ name, value, ...options });
          },
          remove(name: string, options: CookieOptions) {
            cookieStore.set({ name, value: "", ...options, expires: new Date(0) });
          },
        },
      }
    );

    // Exchange the code for a session so we can read the user
    await supabase.auth.exchangeCodeForSession(code);

    // Fetch the authenticated user
    const { data: { user } } = await supabase.auth.getUser();

    // If user exists but email domain is not allowed, sign them out immediately
    const email = user?.email || "";
    const domain = email.split("@")[1] || "";
    const allowed = domain.toLowerCase() === ALLOWED_DOMAIN.toLowerCase();

    if (!allowed) {
      await supabase.auth.signOut();
      return NextResponse.redirect(new URL(`/login?error=not_allowed&domain=${domain}`, requestUrl.origin));
    }
  }

  return NextResponse.redirect(new URL("/", requestUrl.origin));
}
