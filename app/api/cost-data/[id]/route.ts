import { createClient } from "@/lib/supabase"
import { type NextRequest, NextResponse } from "next/server"

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient()
    const body = await request.json()

    // Track the modification
    const { data: currentCostData } = await supabase.from("cost_data").select("*").eq("id", params.id).single()

    // Update the cost data
    const { data: updatedCostData, error } = await supabase
      .from("cost_data")
      .update({
        capex: body.capex,
        opex: body.opex,
        cost_per_unit: body.cost_per_unit,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.id)
      .select()
      .single()

    if (error) {
      console.error("Error updating cost data:", error)
      return NextResponse.json({ error: "Failed to update cost data" }, { status: 500 })
    }

    // Log the modification
    if (currentCostData) {
      await supabase.from("user_modifications").insert({
        table_name: "cost_data",
        record_id: params.id,
        field_name: "cost_values",
        old_value: JSON.stringify({
          capex: currentCostData.capex,
          opex: currentCostData.opex,
          cost_per_unit: currentCostData.cost_per_unit,
        }),
        new_value: JSON.stringify({
          capex: body.capex,
          opex: body.opex,
          cost_per_unit: body.cost_per_unit,
        }),
        modified_by: body.modified_by || "anonymous",
      })
    }

    return NextResponse.json(updatedCostData)
  } catch (error) {
    console.error("Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
