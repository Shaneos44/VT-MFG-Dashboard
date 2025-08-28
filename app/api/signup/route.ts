// app/api/signup/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

function parseAllowedDomains(raw: string | undefined) {
  // Accept comma/space/newline-separated list; trim each
  const s = (raw ?? "vitaltrace.com.au").trim().toLowerCase();
  return s
    .split(/[, \n\r\t;]+/)
    .map((d) => d.trim())
    .filter(Boolean);
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const email: string = String(body.email || "").trim().toLowerCase();
    const password: string = String(body.password || "");

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password required" }, { status: 400 });
    }

    const domain = (email.split("@")[1] || "").trim().toLowerCase();
    const allowedDomains = parseAllowedDomains(process.env.ALLOWED_EMAIL_DOMAIN);

    if (!domain || !allowedDomains.includes(domain)) {
      return NextResponse.json(
        { error: `Email domain not allowed: ${domain}`, allowedDomains },
        { status: 403 }
      );
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!url || !serviceKey) {
      return NextResponse.json({ error: "Server not configured for signup" }, { status: 500 });
    }

    const admin = createAdminClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Create user as confirmed so they can sign in immediately
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { created_via: "domain_signup_api" },
      app_metadata: { domain },
    });

    if (error) {
      // If user already exists, allow client to proceed to sign-in
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
