import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    console.log("[v0] Fetching KPIs for scenario ID:", params.id)
    const supabase = await createClient()

    const { data: kpis, error } = await supabase.from("kpis").select("*").eq("scenario_id", params.id).order("name")

    if (error) {
      console.error("[v0] Error fetching KPIs:", error)
      return NextResponse.json({ error: "Failed to fetch KPIs" }, { status: 500 })
    }

    console.log("[v0] Successfully fetched KPIs:", kpis?.length || 0, "KPIs found")
    return NextResponse.json(kpis || [])
  } catch (error) {
    console.error("[v0] Unexpected error fetching KPIs:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
