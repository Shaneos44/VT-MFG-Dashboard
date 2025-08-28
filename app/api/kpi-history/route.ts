import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const kpiId = searchParams.get("kpi_id")
    const scenarioId = searchParams.get("scenario_id")
    const limit = searchParams.get("limit") || "50"

    let query = supabase
      .from("kpi_history")
      .select(`
        *,
        kpis:kpi_id (name, unit),
        scenarios:scenario_id (name)
      `)
      .order("changed_at", { ascending: false })
      .limit(Number.parseInt(limit))

    if (kpiId) {
      query = query.eq("kpi_id", kpiId)
    }
    if (scenarioId) {
      query = query.eq("scenario_id", scenarioId)
    }

    const { data, error } = await query

    if (error) {
      console.error("[v0] Error fetching KPI history:", error)
      if (error.message.includes("Could not find the table") || error.message.includes("schema cache")) {
        console.log("[v0] KPI history table not found - returning empty array")
        return NextResponse.json([])
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data || [])
  } catch (error) {
    console.error("[v0] Unexpected error in KPI history API:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const body = await request.json()

    const { kpi_id, scenario_id, old_value, new_value, changed_by, change_reason } = body

    const { data, error } = await supabase
      .from("kpi_history")
      .insert({
        kpi_id,
        scenario_id,
        old_value,
        new_value,
        changed_by: changed_by || "user",
        change_reason: change_reason || "Manual update",
      })
      .select()

    if (error) {
      console.error("[v0] Error creating KPI history record:", error)
      if (error.message.includes("Could not find the table") || error.message.includes("schema cache")) {
        console.log("[v0] KPI history table not found - cannot save history")
        return NextResponse.json({ message: "KPI history table not available" }, { status: 200 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data[0])
  } catch (error) {
    console.error("[v0] Unexpected error creating KPI history:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
