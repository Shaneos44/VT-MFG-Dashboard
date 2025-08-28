import { createClient } from "@/lib/supabase"
import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient()
    const { searchParams } = new URL(request.url)
    const limit = Number.parseInt(searchParams.get("limit") || "50")

    const { data: modifications, error } = await supabase
      .from("user_modifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit)

    if (error) {
      console.error("Error fetching modifications:", error)
      return NextResponse.json({ error: "Failed to fetch modifications" }, { status: 500 })
    }

    return NextResponse.json(modifications)
  } catch (error) {
    console.error("Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const body = await request.json()

    const { data: modification, error } = await supabase
      .from("user_modifications")
      .insert({
        table_name: body.table_name,
        record_id: body.record_id,
        field_name: body.field_name,
        old_value: body.old_value,
        new_value: body.new_value,
        modified_by: body.modified_by || "anonymous",
      })
      .select()
      .single()

    if (error) {
      console.error("Error creating modification:", error)
      return NextResponse.json({ error: "Failed to create modification" }, { status: 500 })
    }

    return NextResponse.json(modification)
  } catch (error) {
    console.error("Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
