import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const supabase = await createClient()

    console.log("[v0] Attempting to fetch scenarios from database")

    const { data: scenarios, error } = await supabase
      .from("scenarios")
      .select("*")
      .order("target_units", { ascending: true })

    console.log("[v0] Supabase response - data:", scenarios, "error:", error)

    if (error) {
      console.error("Error fetching scenarios:", error)
      return NextResponse.json({ error: "Failed to fetch scenarios" }, { status: 500 })
    }

    console.log("[v0] Successfully fetched", scenarios?.length || 0, "scenarios")

    return NextResponse.json(scenarios)
  } catch (error) {
    console.error("Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
