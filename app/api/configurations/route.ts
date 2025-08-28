// app/api/configurations/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function unauth(msg = "Not authenticated") {
  // Normalize all auth failures to 401 instead of 500
  return NextResponse.json({ error: msg }, { status: 401 });
}

/**
 * GET /api/configurations
 * Returns all configuration rows for the authenticated user (newest first).
 */
export async function GET() {
  try {
    const supabase = createClient();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    // Treat "Auth session missing!" and any auth error as 401
    if (userErr) {
      console.error("[/api/configurations][GET] auth error:", userErr.message);
      return unauth(userErr.message);
    }
    if (!user) {
      console.warn("[/api/configurations][GET] no user in session");
      return unauth();
    }

    const { data, error } = await supabase
      .from("configurations")
      .select("*")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("[/api/configurations][GET] db error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data ?? []);
  } catch (err: any) {
    console.error("[/api/configurations][GET] unexpected:", err?.message || err);
    return NextResponse.json({ error: err?.message ?? "Unexpected error" }, { status: 500 });
  }
}

/**
 * POST /api/configurations
 * Upserts a named configuration for the authenticated user.
 * Body: { name?: string, description?: string, data: any, modified_by?: string }
 */
export async function POST(req: Request) {
  try {
    const supabase = createClient();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr) {
      console.error("[/api/configurations][POST] auth error:", userErr.message);
      return unauth(userErr.message);
    }
    if (!user) {
      console.warn("[/api/configurations][POST] no user in session");
      return unauth();
    }

    const body = await req.json();

    const payload = {
      user_id: user.id,
      name: String(body.name ?? "ScaleUp-Dashboard-Config"),
      description: body.description ?? null,
      data: body.data ?? {},
      modified_by: body.modified_by ?? user.email ?? "user",
    };

    const { data, error } = await supabase
      .from("configurations")
      .upsert(payload, { onConflict: "user_id,name" })
      .select()
      .single();

    if (error) {
      console.error("[/api/configurations][POST] db error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err: any) {
    console.error("[/api/configurations][POST] unexpected:", err?.message || err);
    return NextResponse.json({ error: err?.message ?? "Unexpected error" }, { status: 500 });
  }
}
