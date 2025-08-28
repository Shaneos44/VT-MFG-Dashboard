import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    console.log("[v0] Fetching cost data from database")
    const supabase = await createClient()

    const { data: costData, error } = await supabase
      .from("cost_data")
      .select("*")
      .order("created_at", { ascending: true })

    if (error) {
      console.error("[v0] Error fetching cost data:", error)
      return NextResponse.json({ error: "Failed to fetch cost data" }, { status: 500 })
    }

    console.log("[v0] Successfully fetched cost data:", costData?.length || 0, "records")
    return NextResponse.json(costData || [])
  } catch (error) {
    console.error("[v0] Unexpected error fetching cost data:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
