export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const ORG_KEY = process.env.ORG_KEY || "vitaltrace.com.au";

/**
 * GET /api/configurations
 * Return all configurations for this org (newest first).
 */
export async function GET() {
  try {
    const supabase = await createClient();

    // Require an authenticated user (so RLS 'authenticated' applies)
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr) {
      return NextResponse.json({ error: userErr.message }, { status: 500 });
    }
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("configurations")
      .select("*")
      .eq("org_key", ORG_KEY)
      .order("updated_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data ?? []);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Unexpected error" }, { status: 500 });
  }
}

/**
 * POST /api/configurations
 * Upsert a configuration by (org_key, name)
 * Body: { name: string, description?: string, data: any, modified_by?: string }
 */
export async function POST(req: Request) {
  try {
    const supabase = await createClient();

    // Require an authenticated user
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr) {
      return NextResponse.json({ error: userErr.message }, { status: 500 });
    }
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const cleanName = String(body.name ?? "ScaleUp-Dashboard-Config").trim();

    const payload = {
      org_key: ORG_KEY,
      name: cleanName,
      description: body.description ?? null,
      data: body.data ?? {},
      modified_by: body.modified_by ?? user.email ?? "user",
      // updated_at will be set by DB default/trigger if you have one; otherwise:
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("configurations")
      .upsert(payload, { onConflict: "org_key,name" })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Unexpected error" }, { status: 500 });
  }
}
