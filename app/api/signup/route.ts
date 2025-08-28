export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

/**
 * Server-only signup. Creates a user instantly with email+password,
 * but ONLY if the email domain is allowed.
 *
 * Required env (server only, NOT public):
 * - SUPABASE_SERVICE_ROLE_KEY
 * - NEXT_PUBLIC_SUPABASE_URL
 * - ALLOWED_EMAIL_DOMAIN  (e.g. vitaltrace.com.au)
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password required" }, { status: 400 });
    }

    const allowed = (process.env.ALLOWED_EMAIL_DOMAIN || "vitaltrace.com.au").toLowerCase();
    const domain = (email.split("@")[1] || "").toLowerCase();
    if (domain !== allowed) {
      return NextResponse.json({ error: `Email domain not allowed: ${domain}` }, { status: 403 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!url || !serviceKey) {
      return NextResponse.json({ error: "Server not configured for signup" }, { status: 500 });
    }

    const admin = createAdminClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

    // Create user as confirmed so they can sign in immediately.
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { created_via: "domain_signup_api" },
      app_metadata: { domain },
    });

    if (error) {
      // If the user already exists, return 200 so client can proceed to sign-in.
      if (String(error.message).toLowerCase().includes("already registered")) {
        return NextResponse.json({ ok: true, alreadyExists: true });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, userId: data.user?.id });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
