import { createClient } from "@/lib/supabase"
import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient()

    const { data: costData, error } = await supabase.from("cost_data").select("*").eq("scenario_id", params.id).single()

    if (error) {
      console.error("Error fetching cost data:", error)
      return NextResponse.json({ error: "Failed to fetch cost data" }, { status: 500 })
    }

    return NextResponse.json(costData)
  } catch (error) {
    console.error("Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
