import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = await createClient()
    const body = await request.json()

    console.log("[v0] KPI update request for ID:", params.id, "with data:", body)

    // Track the modification
    const { data: currentKpi } = await supabase.from("kpis").select("*").eq("id", params.id).single()

    const updateData: any = {
      updated_at: new Date().toISOString(),
    }

    // Only update fields that are provided in the request
    if (body.name !== undefined) updateData.name = body.name
    if (body.target_value !== undefined) updateData.target_value = body.target_value
    if (body.current_value !== undefined) updateData.current_value = body.current_value
    if (body.unit !== undefined) updateData.unit = body.unit
    if (body.owner !== undefined) updateData.owner = body.owner

    console.log("[v0] Updating KPI with data:", updateData)

    // Update the KPI
    const { data: updatedKpi, error } = await supabase
      .from("kpis")
      .update(updateData)
      .eq("id", params.id)
      .select()
      .single()

    if (error) {
      console.error("[v0] Error updating KPI:", error)
      return NextResponse.json({ error: "Failed to update KPI" }, { status: 500 })
    }

    console.log("[v0] Successfully updated KPI:", updatedKpi)

    // Log the modification
    if (currentKpi) {
      const modifications = []

      if (body.name !== undefined && currentKpi.name !== body.name) {
        modifications.push({
          table_name: "kpis",
          record_id: params.id,
          field_name: "name",
          old_value: currentKpi.name,
          new_value: body.name,
          modified_by: body.modified_by || "anonymous",
        })
      }

      if (body.target_value !== undefined && currentKpi.target_value !== body.target_value) {
        modifications.push({
          table_name: "kpis",
          record_id: params.id,
          field_name: "target_value",
          old_value: currentKpi.target_value?.toString(),
          new_value: body.target_value?.toString(),
          modified_by: body.modified_by || "anonymous",
        })
      }

      if (body.current_value !== undefined && currentKpi.current_value !== body.current_value) {
        modifications.push({
          table_name: "kpis",
          record_id: params.id,
          field_name: "current_value",
          old_value: currentKpi.current_value?.toString(),
          new_value: body.current_value?.toString(),
          modified_by: body.modified_by || "anonymous",
        })
      }

      if (modifications.length > 0) {
        await supabase.from("user_modifications").insert(modifications)
      }

      // Save to KPI history table for trend analysis (only for value changes)
      if (body.target_value !== undefined && currentKpi.target_value !== body.target_value) {
        try {
          await supabase.from("kpi_history").insert({
            kpi_id: Number.parseInt(params.id),
            scenario_id: currentKpi.scenario_id,
            old_value: currentKpi.target_value,
            new_value: body.target_value,
            changed_by: body.modified_by || "anonymous",
            change_reason: body.change_reason || "Manual update",
          })
        } catch (historyError) {
          console.log("[v0] KPI history table not available, skipping history insert")
        }
      }
    }

    return NextResponse.json(updatedKpi)
  } catch (error) {
    console.error("[v0] Unexpected error updating KPI:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
