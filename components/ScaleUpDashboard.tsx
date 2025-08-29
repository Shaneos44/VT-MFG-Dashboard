"use client"

import React, { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Loader2, TrendingUp } from "lucide-react"
import { jsPDF } from "jspdf"
import { generateWeeklySummary } from "@/lib/utils"
import { clone, SEED_PLAN } from "@/lib/constants"

interface Scenario {
  id: string
  name: string
  description?: string
  target_units?: number
  created_at?: string
  updated_at?: string
}

interface KPI {
  id: string
  scenario_id: string
  name: string
  target_value: number
  current_value: number
  unit: string
  owner: string
  created_at: string
  updated_at: string
}

interface CostData {
  id: string
  scenario_id: string
  capex: number
  opex: number
  cost_per_unit: number
  created_at?: string
  updated_at?: string
}

type Variant = "Recess Nanodispensing" | "Dipcoating"

interface SyncStatus {
  isOnline: boolean
  lastSync: Date
  pendingChanges: number
  connectedUsers: number
}

function SyncStatusIndicator({ syncStatus }: { syncStatus: SyncStatus }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <div className={`w-2 h-2 rounded-full ${syncStatus.isOnline ? "bg-green-500" : "bg-red-500"}`} />
      <span className="text-slate-600">
        {syncStatus.isOnline ? "Online" : "Offline"} • {syncStatus.connectedUsers} users •{" "}
        {syncStatus.pendingChanges > 0 ? `${syncStatus.pendingChanges} pending` : "no pending"}
      </span>
      <span className="text-xs text-slate-500">Last sync: {syncStatus.lastSync.toLocaleTimeString()}</span>
    </div>
  )
}

const ScaleUpDashboard: React.FC = () => {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [activeTab, setActiveTab] = useState<
    "overview" | "projects" | "manufacturing" | "resources" | "risks" | "meetings" | "kpis" | "financials" | "glossary" | "config"
  >("projects")

  const [scenario, setScenario] = useState<"50k" | "200k">("50k")
  const [variant, setVariant] = useState<Variant>("Recess Nanodispensing")

  const [plan, setPlan] = useState(() => {
    const initial = clone(SEED_PLAN)
    if (!initial.scenarios) {
      initial.scenarios = {
        "50k": { unitsPerYear: 50000, hoursPerDay: 8, shifts: 1 },
        "200k": { unitsPerYear: 200000, hoursPerDay: 16, shifts: 2 },
      }
    }
    return initial
  })

  const [currentScenario, setCurrentScenario] = useState<Scenario | null>(null)
  const [_scenarios, _setScenarios] = useState<Scenario[]>([])
  const [costData, setCostData] = useState<CostData[]>([])

  const [kpis, setKpis] = useState<KPI[]>([
    {
      id: "kpi-1",
      scenario_id: "default",
      name: "Production Efficiency",
      target_value: 95,
      current_value: 87,
      unit: "%",
      owner: "Production Manager",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "kpi-2",
      scenario_id: "default",
      name: "Quality Score",
      target_value: 98,
      current_value: 94,
      unit: "%",
      owner: "Quality Engineer",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "kpi-3",
      scenario_id: "default",
      name: "Cost Reduction",
      target_value: 15,
      current_value: 12,
      unit: "%",
      owner: "Operations Lead",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "kpi-4",
      scenario_id: "default",
      name: "Time to Market",
      target_value: 180,
      current_value: 195,
      unit: "days",
      owner: "Project Manager",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ])

  const [analysis, setAnalysis] = useState<{ summary: string; tldr: string }>({ summary: "", tldr: "" })

  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    isOnline: true,
    lastSync: new Date(),
    pendingChanges: 0,
    connectedUsers: 1,
  })

  const [manufacturingProcesses, setManufacturingProcesses] = useState<any[][]>([
    ["Receive Needles", 0, 1, 100, 0, "Manual Station", "Manual", "Validated", "Operator1"],
    ["Mount Needles to VS & Run Inspection", 2, 1, 98, 120, "Vision System", "Semi-Auto", "Validated", "Operator1"],
    ["Unmount", 0.1, 1, 100, 6, "Manual Station", "Manual", "Validated", "Operator1"],
    ["Sort into Vials", 0.25, 90, 100, 15, "Manual Station", "Manual", "Validated", "Operator1"],
    ["Solvent Clean 1", 0.1, 90, 99, 6, "Cleaning Station", "Manual", "Validated", "Operator2"],
    ["Rinse 1", 0.1, 90, 100, 6, "Cleaning Station", "Manual", "Validated", "Operator2"],
    ["Solvent Clean 2", 0.1, 90, 99, 6, "Cleaning Station", "Manual", "Validated", "Operator2"],
    ["Rinse 2", 0.1, 90, 100, 6, "Cleaning Station", "Manual", "Validated", "Operator2"],
    ["Solvent Clean 3", 0.1, 90, 99, 6, "Cleaning Station", "Manual", "Validated", "Operator2"],
    ["Rinse 3", 0.1, 90, 100, 6, "Cleaning Station", "Manual", "Validated", "Operator2"],
    ["Dry", 0.1, 90, 100, 6, "Drying Station", "Manual", "Validated", "Operator2"],
    ["IHCL", 5, 90, 95, 300, "IHCL System", "Auto", "Validated", "Operator3"],
    ["Plasma", 10, 90, 98, 600, "Plasma System", "Auto", "Validated", "Operator3"],
    ["Monolayer", 15, 90, 97, 900, "Coating System", "Auto", "Validated", "Operator4"],
    ["OCP", 8, 90, 99, 480, "OCP System", "Auto", "Validated", "Operator4"],
    ["Enzyme Dipcoating", 20, 90, 96, 1200, "Dipcoating System", "Auto", "Validated", "Operator5"],
    ["Tubing QC", 1, 1, 100, 60, "QC Station", "Manual", "Validated", "QC1"],
    ["Outer Membrane Dipcoating", 25, 90, 95, 1500, "Dipcoating System", "Auto", "Validated", "Operator5"],
    ["Cable QC", 0.5, 1, 100, 30, "QC Station", "Manual", "Validated", "QC1"],
    ["Assembly", 3, 1, 99, 180, "Assembly Station", "Manual", "Validated", "Operator6"],
    ["Precal QC", 2, 1, 98, 120, "QC Station", "Manual", "Validated", "Operator2"],
    ["Final QC", 1.5, 1, 99, 90, "QC Station", "Manual", "Validated", "Operator2"],
    ["Packaging", 0.5, 1, 100, 30, "Packaging Station", "Manual", "Validated", "Operator7"],
  ])

  const [resourcesData, setResourcesData] = useState<any[][]>([
    ["Production Manager", "Personnel", 1, 95000, "Manufacturing", "Full-time position"],
    ["Quality Engineer", "Personnel", 2, 75000, "Quality", "QC oversight"],
    ["Manufacturing Equipment", "Equipment", 5, 150000, "Production", "Core production line"],
    ["Testing Equipment", "Equipment", 3, 85000, "Quality", "QC testing systems"],
  ])

  const [risksData, setRisksData] = useState<any[][]>([
    ["Supply Chain Disruption", "H", "M", "Diversify suppliers", "Operations", "Monitoring"],
    ["Regulatory Changes", "M", "L", "Stay updated on regulations", "Compliance", "Active"],
    ["Equipment Failure", "H", "L", "Preventive maintenance", "Engineering", "Mitigated"],
    ["Quality Issues", "H", "M", "Enhanced QC processes", "Quality", "Active"],
  ])

  const [meetingsData, setMeetingsData] = useState<any[][]>([
    ["Weekly Status", "2025-08-26", "10:00", "60 min", "Project Team", "Conference Room A", "Scheduled"],
    ["Monthly Review", "2025-09-02", "14:00", "90 min", "Leadership", "Boardroom", "Scheduled"],
  ])

  const [financialData, setFinancialData] = useState<any[][]>([
    ["Revenue", "Product Sales", 2250000, "Income", "Projected annual revenue"],
    ["COGS", "Manufacturing Costs", 1350000, "Expense", "Direct production costs"],
    ["OpEx", "Operating Expenses", 450000, "Expense", "Ongoing operational costs"],
    ["CapEx", "Equipment Investment", 750000, "Investment", "Initial capital expenditure"],
  ])

  const [glossaryTerms, setGlossaryTerms] = useState<any[][]>([
    ["IHCL", "Ion-Implanted Hydrophilic Coating Layer - Surface treatment process"],
    ["OCP", "Open Circuit Potential - Electrochemical measurement technique"],
    ["Plasma", "Plasma surface treatment for enhanced adhesion"],
    ["Monolayer", "Single molecular layer coating application"],
    ["Dipcoating", "Controlled immersion coating process"],
  ])

  const projectsHeaders = [
    "id",
    "name",
    "type",
    "moscow",
    "owner",
    "start",
    "finish",
    "dependencies",
    "deliverables",
    "goal",
    "R",
    "A",
    "C",
    "I",
    "needs",
    "barriers",
    "risks",
    "budget_capex",
    "budget_opex",
    "percent_complete",
    "process_link",
    "critical",
    "status",
    "slack_days",
  ]

  // Wider long-text columns + narrow centered R/A/C/I
  const projectsWidths = [
    140, // id
    320, // name
    160, // type
    140, // moscow
    170, // owner
    150, // start
    150, // finish
    140, // dependencies
    440, // deliverables
    440, // goal
    80,  // R
    80,  // A
    80,  // C
    80,  // I
    400, // needs
    400, // barriers
    400, // risks
    160, // budget_capex
    160, // budget_opex
    160, // percent_complete
    200, // process_link
    120, // critical
    150, // status
    130, // slack_days
  ]

  const projectsTableMinW = useMemo(() => projectsWidths.reduce((a, b) => a + b, 0) + 60, [projectsWidths])

  const manufacturingHeaders = [
    "Process",
    "Time (min)",
    "Batch Size",
    "Yield (%)",
    "Cycle Time (s)",
    "Equipment",
    "Type",
    "Status",
    "Operator",
  ]
  const resourcesHeaders = ["Resource", "Type", "Quantity", "Cost", "Department", "Notes"]
  const risksHeaders = ["Risk", "Impact", "Probability", "Mitigation", "Owner", "Status"]
  const meetingsHeaders = ["Title", "Date", "Time", "Duration", "Attendees", "Location", "Status"]
  const financialHeaders = ["Category", "Item", "Amount", "Type", "Notes"]
  const glossaryHeaders = ["Term", "Definition"]

  const ensureArray = (v: any): any[] => {
    if (Array.isArray(v)) return v
    if (v && typeof v === "object" && Array.isArray((v as any).rows)) return (v as any).rows
    if (v == null) return []
    return [v]
  }

  const currentVariantData = useMemo(() => {
    const base =
      (plan.products && plan.products[scenario]) || {
        projects: [],
        equipment: [],
        capex50k: [],
        capex200k: [],
        opex50k: [],
        opex200k: [],
        resources: [],
        hiring: [],
        risks: [],
        actions: [],
        processes: [],
        manufacturing: [],
        meetings: [],
        launch: {
          fiftyK: new Date().toISOString(),
          twoHundredK: new Date().toISOString(),
        },
      }
    return {
      ...base,
      projects: ensureArray(base.projects),
      manufacturing: ensureArray(base.manufacturing),
      resources: ensureArray(base.resources),
      risks: ensureArray(base.risks),
      meetings: ensureArray(base.meetings),
    }
  }, [plan, scenario])

  const projectRows = useMemo(() => {
    const rows = ensureArray(currentVariantData.projects).map((p: any, idx: number) => {
      if (Array.isArray(p)) return p
      if (!p || typeof p !== "object") {
        return [
          `PROJ-${Date.now()}-${idx}`,
          "New Project",
          "Development",
          "Must",
          "Project Manager",
          "",
          "",
          0,
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          0,
          0,
          0,
          "",
          "false",
          "GREEN",
          0,
        ]
      }
      return [
        p.id || `PROJ-${Date.now()}-${idx}`,
        p.name || "",
        p.type || p.phase || "Planning",
        p.moscow || p.priority || "Medium",
        p.owner || p.assignee || "",
        p.start || p.startDate || "",
        p.finish || p.endDate || "",
        p.dependencies || 0,
        p.deliverables || "",
        p.goal || p.objectives || p.description || "",
        p.raciR || "",
        p.raciA || "",
        p.raciC || "",
        p.raciI || "",
        p.needs || "",
        p.barriers || "",
        p.risks || "",
        p.budget_capex ?? p.budget ?? 0,
        p.budget_opex ?? 0,
        p.percent_complete ?? p.progress ?? 0,
        p.process_link || "",
        String(p.critical ?? false),
        p.status || "Planning",
        p.slack_days ?? 0,
      ]
    })
    return rows
  }, [currentVariantData.projects])

  const handleProjectCellChange = (rowIndex: number, colIndex: number, value: any) => {
    const updated = projectRows.map((r) => [...r])
    if (updated[rowIndex]) updated[rowIndex][colIndex] = value
    setPlan((prev) => ({
      ...prev,
      products: {
        ...prev.products,
        [scenario]: {
          ...prev.products?.[scenario],
          projects: updated,
        },
      },
    }))
    setSyncStatus((s) => ({ ...s, pendingChanges: s.pendingChanges + 1, lastSync: new Date() }))
  }

  const overviewMetrics = useMemo(() => {
    const scenarioData =
      plan.scenarios && plan.scenarios[scenario]
        ? plan.scenarios[scenario]
        : { unitsPerYear: scenario === "50k" ? 50000 : 200000 }

    const projectsCount = projectRows.length
    const completedProjects = Math.floor(projectsCount * 0.2)
    const activeProjects = Math.floor(projectsCount * 0.7)
    const highRisks = Math.floor(risksData.length * 0.3)

    const currentCostData = costData.find((c) => c.scenario_id === currentScenario?.id)

    return {
      targetProduction: scenarioData.unitsPerYear,
      capacityUtilization: ((scenarioData.unitsPerYear / (scenario === "50k" ? 60000 : 250000)) * 100).toFixed(0),
      annualRevenue: currentCostData ? scenarioData.unitsPerYear * 45 : 2250000,
      profitMargin: currentCostData
        ? (
            ((scenarioData.unitsPerYear * 45 - currentCostData.capex - currentCostData.opex) /
              (scenarioData.unitsPerYear * 45)) *
            100
          ).toFixed(1)
        : "28.7",
      costPerUnit: currentCostData ? currentCostData.cost_per_unit : 32.06,
      totalProjects: projectsCount,
      completedProjects,
      activeProjects,
      highPriorityRisks: highRisks,
    }
  }, [plan, scenario, projectRows.length, risksData.length, costData, currentScenario])

  const saveProjectDataToDatabase = async () => {
    try {
      setSaving(true)
      setError(null)
      const projectData = { plan, scenario, variant, currentVariantData, lastSaved: new Date().toISOString() }
      const res = await fetch("/api/configurations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "ScaleUp-Dashboard-Config",
          description: "ScaleUp Dashboard Configuration",
          data: projectData,
          modified_by: "user",
          upsert: true,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j?.error || `Save failed with status ${res.status}`)
      }
      setSyncStatus((s) => ({ ...s, pendingChanges: 0, lastSync: new Date(), isOnline: true }))
    } catch (e: any) {
      setError(e?.message || "Failed to save data.")
      setSyncStatus((s) => ({ ...s, isOnline: false }))
    } finally {
      setSaving(false)
    }
  }

  const loadProjectDataFromDatabase = async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch("/api/configurations")
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j?.error || `Load failed with status ${res.status}`)
      }
      const configs = await res.json()
      let latest =
        Array.isArray(configs)
          ? configs.find((c: any) => c.name === "ScaleUp-Dashboard-Config") ||
            configs.sort((a: any, b: any) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0]
          : null

      if (latest && latest.data) {
        const { plan: loadedPlan, scenario: loadedScenario, variant: loadedVariant } = latest.data
        if (loadedPlan && Object.keys(loadedPlan).length > 0) setPlan(loadedPlan)
        if (loadedScenario) setScenario(loadedScenario)
        if (loadedVariant) setVariant(loadedVariant)
      }
    } catch (e: any) {
      setError(e?.message || "Failed to load data.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadProjectDataFromDatabase().finally(() => setLoading(false))
  }, [])

  const exportWeeklySummary = () => {
    const summary = generateWeeklySummary()
    const reportContent = `
WEEKLY PROJECT SUMMARY - ${summary.week}
VitalTrace Manufacturing Scale-Up Dashboard
Scenario: ${scenario} | Variant: ${variant}

═══════════════════════════════════════════════════════════════

📊 PROJECT STATUS OVERVIEW
• Projects Completed: ${summary.projectsCompleted}
• Projects On Track: ${summary.projectsOnTrack}
• Projects At Risk: ${summary.projectsAtRisk}
• Total Active Projects: ${summary.projectsCompleted + summary.projectsOnTrack + summary.projectsAtRisk}

🎯 KEY MILESTONES ACHIEVED
${summary.keyMilestones.map((m: string) => `• ${m}`).join("\n")}

⚠️ CRITICAL ISSUES REQUIRING ATTENTION
${summary.criticalIssues.length > 0 ? summary.criticalIssues.map((i: string) => `• ${i}`).join("\n") : "• No critical issues identified"}

📈 KPI PERFORMANCE SUMMARY
${summary.kpiSummary
  .map((k: any) => `• ${k.name}: ${k.current}/${k.target} ${k.trend === "up" ? "↗️" : k.trend === "down" ? "↘️" : "→"}`)
  .join("\n")}

🚀 NEXT WEEK PRIORITIES
${summary.nextWeekPriorities.map((p: string) => `• ${p}`).join("\n")}

═══════════════════════════════════════════════════════════════

📋 EXECUTIVE SUMMARY
${analysis.tldr || "Analysis pending..."}

🔍 DETAILED ANALYSIS
${analysis.summary || "Detailed analysis will be available after CEO analysis is generated."}

═══════════════════════════════════════════════════════════════
Generated: ${new Date().toLocaleString()}
Dashboard Version: v64
`.trim()

    const blob = new Blob([reportContent], { type: "text/plain;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `Weekly_Summary_${summary.week}_${variant}_${scenario}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  // PDF generator with extra spacing and strict page breaks
  const generateComprehensiveReportPDF = async () => {
    const PAGE_W = 595
    const PAGE_H = 842
    const M = 40
    const LINE = 16
    const GAP = 10

    const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" })
    let y = M

    const ensureSpace = (needed: number) => {
      if (y + needed > PAGE_H - M) {
        doc.addPage()
        y = M
      }
    }

    const header = () => {
      doc.setFont("helvetica", "bold")
      doc.setFontSize(16)
      doc.text("VitalTrace – Comprehensive Scale-Up Report", M, y)
      y += 22
      doc.setFont("helvetica", "normal")
      doc.setFontSize(11)
      doc.text(`Generated: ${new Date().toLocaleString()}`, M, y)
      y += 16
      doc.text(`Scenario: ${scenario}  •  Variant: ${variant}`, M, y)
      y += 16
      doc.setDrawColor(200, 200, 200)
      doc.line(M, y, PAGE_W - M, y)
      y += 14
    }

    const title = (t: string) => {
      ensureSpace(28)
      doc.setFont("helvetica", "bold")
      doc.setFontSize(13)
      doc.text(t, M, y)
      y += 18
      doc.setFont("helvetica", "normal")
      doc.setFontSize(10)
    }

    const bullets = (arr: string[]) => {
      const maxW = PAGE_W - 2 * M
      arr.forEach((s) => {
        const lines = doc.splitTextToSize(s, maxW)
        lines.forEach((ln) => {
          ensureSpace(LINE)
          doc.text(ln, M, y)
          y += LINE
        })
      })
      y += GAP
    }

    const projects = ensureArray(currentVariantData.projects).map((r: any[]) => ({
      id: r?.[0] ?? "",
      name: r?.[1] ?? "",
      phase: r?.[2] ?? "",
      priority: r?.[3] ?? "",
      owner: r?.[4] ?? "",
      start: r?.[5] ?? "",
      end: r?.[6] ?? "",
      deliverables: r?.[8] ?? "",
      goal: r?.[9] ?? "",
      capex: r?.[17] ?? 0,
      opex: r?.[18] ?? 0,
      percent: r?.[19] ?? 0,
      status: r?.[22] ?? "",
    }))

    const resources = ensureArray(currentVariantData.resources).map((r: any[]) => ({
      role: r?.[0] ?? "",
      type: r?.[1] ?? "",
      qty: r?.[2] ?? 0,
      cost: r?.[3] ?? 0,
      dept: r?.[4] ?? "",
      notes: r?.[5] ?? "",
    }))

    const risks = ensureArray(currentVariantData.risks).map((r: any[]) => ({
      id: r?.[0] ?? "",
      risk: r?.[1] ?? "",
      impact: r?.[2] ?? "",
      prob: r?.[3] ?? "",
      mitigation: r?.[4] ?? "",
      owner: r?.[5] ?? "",
      due: r?.[6] ?? "",
      status: r?.[7] ?? "",
    }))

    const meetings = ensureArray(currentVariantData.meetings).map((m: any[]) => ({
      title: m?.[0] ?? m?.[1] ?? "",
      date: m?.[1] ?? m?.[2] ?? "",
      time: m?.[2] ?? "—",
      duration: m?.[3] ?? "—",
      attendees: m?.[4] ?? "—",
      location: m?.[5] ?? "—",
      status: m?.[6] ?? "—",
    }))

    const kpiRows = ensureArray(kpis).map((k: KPI) => ({
      name: k.name,
      current: k.current_value,
      target: k.target_value,
      unit: k.unit,
      owner: k.owner,
    }))

    header()

    title("Projects")
    bullets(
      projects.length
        ? projects.map(
            (p) =>
              `• [${p.status}] ${p.name} (${p.phase}, ${p.priority}) — Owner: ${p.owner} — ${p.start} → ${p.end} — CapEx $${p.capex} / OpEx $${p.opex} — ${p.percent}%`,
          )
        : ["• No projects found."],
    )

    title("Resources")
    bullets(
      resources.length
        ? resources.map((r) => `• ${r.role} — ${r.type} — Qty ${r.qty} — $${r.cost} — ${r.dept}`)
        : ["• No resources found."],
    )

    title("Risks")
    bullets(
      risks.length
        ? risks.map(
            (r) =>
              `• (${r.id}) ${r.risk} — Impact ${r.impact}, Prob ${r.prob} — Mitigation: ${r.mitigation} — Owner: ${r.owner} — Due: ${r.due} — ${r.status}`,
          )
        : ["• No risks found."],
    )

    title("Meetings")
    bullets(
      meetings.length
        ? meetings.map((m) => `• ${m.title} — ${m.date} ${m.time} — ${m.attendees} — ${m.duration} — ${m.status} — ${m.location}`)
        : ["• No meetings found."],
    )

    title("KPIs")
    bullets(
      kpiRows.length
        ? kpiRows.map((k) => `• ${k.name}: ${k.current}${k.unit} / ${k.target}${k.unit} — Owner: ${k.owner}`)
        : ["• No KPIs defined."],
    )

    ensureSpace(30)
    doc.setDrawColor(200, 200, 200)
    doc.line(M, y, PAGE_W - M, y)
    y += 14
    doc.setFontSize(9)
    doc.text(`End of report • Scenario ${scenario} • Variant ${variant}`, M, y)

    doc.save(`VitalTrace_Comprehensive_Report_${variant}_${scenario}.pdf`)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center space-x-2">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="text-lg font-medium">Loading Your Project…</span>
          </div>
          <p className="text-sm text-muted-foreground">Retrieving your latest data from the database…</p>
          <Button variant="outline" onClick={() => setLoading(false)} className="mt-4">
            Skip Loading
          </Button>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center space-x-2">
            <Loader2 className="h-6 w-6" />
            <span className="text-lg font-medium">Dashboard</span>
          </div>
          <p className="text-red-600 text-sm">{error}</p>
          <Button variant="outline" onClick={() => setError(null)}>
            Dismiss
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex gap-2 flex-wrap">
          <Button variant={activeTab === "overview" ? "default" : "outline"} onClick={() => setActiveTab("overview")}>
            Overview
          </Button>
          <Button variant={activeTab === "projects" ? "default" : "outline"} onClick={() => setActiveTab("projects")}>
            Projects
          </Button>
          <Button variant={activeTab === "manufacturing" ? "default" : "outline"} onClick={() => setActiveTab("manufacturing")}>
            Manufacturing
          </Button>
          <Button variant={activeTab === "resources" ? "default" : "outline"} onClick={() => setActiveTab("resources")}>
            Resources
          </Button>
          <Button variant={activeTab === "risks" ? "default" : "outline"} onClick={() => setActiveTab("risks")}>
            Risks
          </Button>
          <Button variant={activeTab === "meetings" ? "default" : "outline"} onClick={() => setActiveTab("meetings")}>
            Meetings
          </Button>
          <Button variant={activeTab === "kpis" ? "default" : "outline"} onClick={() => setActiveTab("kpis")}>
            KPIs
          </Button>
          <Button variant={activeTab === "financials" ? "default" : "outline"} onClick={() => setActiveTab("financials")}>
            Financials
          </Button>
          <Button variant={activeTab === "glossary" ? "default" : "outline"} onClick={() => setActiveTab("glossary")}>
            Glossary
          </Button>
          <Button variant={activeTab === "config" ? "default" : "outline"} onClick={() => setActiveTab("config")}>
            Config
          </Button>
        </div>

        <div className="flex gap-2">
          <Button onClick={exportWeeklySummary}>Weekly Summary (TXT)</Button>
          <Button onClick={generateComprehensiveReportPDF} className="gap-2">
            <TrendingUp className="h-4 w-4" />
            Comprehensive Report (PDF)
          </Button>
        </div>
      </div>

      {activeTab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="rounded-xl border p-4 bg-card">
            <div className="text-sm text-muted-foreground">Production Target</div>
            <div className="text-2xl font-semibold">{overviewMetrics.targetProduction.toLocaleString()} units/yr</div>
            <div className="text-xs mt-1">Capacity Utilization: {overviewMetrics.capacityUtilization}%</div>
          </div>
          <div className="rounded-xl border p-4 bg-card">
            <div className="text-sm text-muted-foreground">Financials</div>
            <div className="text-2xl font-semibold">${(overviewMetrics.annualRevenue / 1_000_000).toFixed(1)}M revenue</div>
            <div className="text-xs mt-1">
              Profit margin: {overviewMetrics.profitMargin}% • CPU ${Number(overviewMetrics.costPerUnit).toFixed(2)}
            </div>
          </div>
          <div className="rounded-xl border p-4 bg-card">
            <div className="text-sm text-muted-foreground">Portfolio</div>
            <div className="text-2xl font-semibold">{overviewMetrics.totalProjects} projects</div>
            <div className="text-xs mt-1">
              {overviewMetrics.completedProjects} completed • {overviewMetrics.highPriorityRisks} high risks
            </div>
          </div>
        </div>
      )}

      {activeTab === "projects" && (
        <div className="overflow-x-auto rounded-xl border">
          <table className="table-fixed w-full text-sm" style={{ minWidth: `${projectsTableMinW}px` }}>
            <colgroup>
              {projectsWidths.map((w, i) => (
                <col key={`col-${i}`} style={{ width: `${w}px` }} />
              ))}
            </colgroup>
            <thead className="sticky top-0 bg-background z-10">
              <tr className="[&>th]:px-3 [&>th]:py-2 text-left">
                {projectsHeaders.map((h, idx) => (
                  <th key={h} className={`whitespace-nowrap ${idx >= 10 && idx <= 13 ? "text-center" : ""}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="[&>tr>td]:px-3 [&>tr>td]:py-2 align-top">
              {projectRows.map((row, rIdx) => (
                <tr key={rIdx} className="border-t align-top">
                  {row.map((cell: any, cIdx: number) => {
                    const isLongText = [8, 9, 14, 15, 16].includes(cIdx)
                    const isRACI = cIdx >= 10 && cIdx <= 13
                    return (
                      <td key={`${rIdx}-${cIdx}`} className={`align-top ${isRACI ? "text-center" : ""}`}>
                        {isLongText ? (
                          <textarea
                            className="block w-full rounded-md border px-2 py-1 text-sm resize-none whitespace-pre-wrap break-words leading-snug min-h-[84px]"
                            value={cell ?? ""}
                            onChange={(e) => handleProjectCellChange(rIdx, cIdx, e.target.value)}
                          />
                        ) : (
                          <input
                            className={`block w-full rounded-md border px-2 py-1 text-sm leading-tight h-9 ${isRACI ? "text-center" : ""}`}
                            value={cell ?? ""}
                            onChange={(e) => handleProjectCellChange(rIdx, cIdx, e.target.value)}
                          />
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "manufacturing" && (
        <div className="overflow-x-auto rounded-xl border">
          <table className="table-fixed w-full min-w-[1400px] text-sm">
            <thead className="sticky top-0 bg-background z-10">
              <tr className="[&>th]:px-3 [&>th]:py-2 text-left">
                {manufacturingHeaders.map((h) => (
                  <th key={h} className="whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="[&>tr>td]:px-3 [&>tr>td]:py-2 align-top">
              {manufacturingProcesses.map((row, rIdx) => (
                <tr key={rIdx} className="border-t">
                  {row.map((cell: any, cIdx: number) => (
                    <td key={`${rIdx}-${cIdx}`}>
                      <input
                        className="block w-full min-w-[140px] rounded-md border px-2 py-1 text-sm h-9"
                        value={cell ?? ""}
                        onChange={(e) =>
                          setManufacturingProcesses((prev) => {
                            const copy = prev.map((r) => [...r])
                            copy[rIdx][cIdx] = e.target.value
                            return copy
                          })
                        }
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="p-3">
            <Button
              variant="outline"
              onClick={() =>
                setManufacturingProcesses((prev) => [
                  ...prev,
                  ["New Process", 0, 1, 100, 0, "Manual Station", "Manual", "Planning", "Owner"],
                ])
              }
            >
              Add Manufacturing Item
            </Button>
          </div>
        </div>
      )}

      {activeTab === "resources" && (
        <div className="overflow-x-auto rounded-xl border">
          <table className="table-fixed w-full min-w-[1100px] text-sm">
            <thead className="sticky top-0 bg-background z-10">
              <tr className="[&>th]:px-3 [&>th]:py-2 text-left">
                {resourcesHeaders.map((h) => (
                  <th key={h} className="whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="[&>tr>td]:px-3 [&>tr>td]:py-2 align-top">
              {resourcesData.map((row, rIdx) => (
                <tr key={rIdx} className="border-t">
                  {row.map((cell: any, cIdx: number) => (
                    <td key={`${rIdx}-${cIdx}`}>
                      <input
                        className="block w-full min-w-[160px] rounded-md border px-2 py-1 text-sm h-9"
                        value={cell ?? ""}
                        onChange={(e) =>
                          setResourcesData((prev) => {
                            const copy = prev.map((r) => [...r])
                            copy[rIdx][cIdx] = e.target.value
                            return copy
                          })
                        }
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "risks" && (
        <div className="overflow-x-auto rounded-xl border">
          <table className="table-fixed w-full min-w-[1200px] text-sm">
            <thead className="sticky top-0 bg-background z-10">
              <tr className="[&>th]:px-3 [&>th]:py-2 text-left">
                {risksHeaders.map((h) => (
                  <th key={h} className="whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="[&>tr>td]:px-3 [&>tr>td]:py-2 align-top">
              {risksData.map((row, rIdx) => (
                <tr key={rIdx} className="border-t">
                  {row.map((cell: any, cIdx: number) => (
                    <td key={`${rIdx}-${cIdx}`}>
                      <input
                        className="block w-full min-w-[160px] rounded-md border px-2 py-1 text-sm h-9"
                        value={cell ?? ""}
                        onChange={(e) =>
                          setRisksData((prev) => {
                            const copy = prev.map((r) => [...r])
                            copy[rIdx][cIdx] = e.target.value
                            return copy
                          })
                        }
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "meetings" && (
        <div className="overflow-x-auto rounded-xl border">
          <table className="table-fixed w-full min-w-[1200px] text-sm">
            <thead className="sticky top-0 bg-background z-10">
              <tr className="[&>th]:px-3 [&>th]:py-2 text-left">
                {meetingsHeaders.map((h) => (
                  <th key={h} className="whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="[&>tr>td]:px-3 [&>tr>td]:py-2 align-top">
              {meetingsData.map((row, rIdx) => (
                <tr key={rIdx} className="border-t">
                  {row.map((cell: any, cIdx: number) => (
                    <td key={`${rIdx}-${cIdx}`}>
                      <input
                        className="block w-full min-w-[180px] rounded-md border px-2 py-1 text-sm h-9"
                        value={cell ?? ""}
                        onChange={(e) =>
                          setMeetingsData((prev) => {
                            const copy = prev.map((r) => [...r])
                            copy[rIdx][cIdx] = e.target.value
                            return copy
                          })
                        }
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="p-3">
            <Button
              variant="outline"
              onClick={() =>
                setMeetingsData((prev) => [
                  ...prev,
                  ["New Meeting", new Date().toISOString().slice(0, 10), "10:00", "60 min", "Team", "Location", "Scheduled"],
                ])
              }
            >
              Add Meeting
            </Button>
          </div>
        </div>
      )}

      {activeTab === "kpis" && (
        <div className="overflow-x-auto rounded-xl border">
          <table className="table-fixed w-full min-w-[900px] text-sm">
            <thead className="sticky top-0 bg-background z-10">
              <tr className="[&>th]:px-3 [&>th]:py-2 text-left">
                <th className="whitespace-nowrap">Name</th>
                <th className="whitespace-nowrap">Current</th>
                <th className="whitespace-nowrap">Target</th>
                <th className="whitespace-nowrap">Unit</th>
                <th className="whitespace-nowrap">Owner</th>
                <th className="whitespace-nowrap w-[1%]">Actions</th>
              </tr>
            </thead>
            <tbody className="[&>tr>td]:px-3 [&>tr>td]:py-2 align-top">
              {kpis.map((kpi, rIdx) => (
                <tr key={kpi.id} className="border-t">
                  <td>
                    <input
                      className="block w-full min-w-[220px] rounded-md border px-2 py-1 text-sm h-9"
                      value={kpi.name}
                      onChange={(e) =>
                        setKpis((prev) => {
                          const copy = prev.map((k) => ({ ...k }))
                          copy[rIdx].name = e.target.value
                          copy[rIdx].updated_at = new Date().toISOString()
                          return copy
                        })
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="block w-full min-w-[120px] rounded-md border px-2 py-1 text-sm h-9"
                      value={kpi.current_value}
                      onChange={(e) =>
                        setKpis((prev) => {
                          const copy = prev.map((k) => ({ ...k }))
                          copy[rIdx].current_value = parseFloat(e.target.value) || 0
                          copy[rIdx].updated_at = new Date().toISOString()
                          return copy
                        })
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="block w-full min-w-[120px] rounded-md border px-2 py-1 text-sm h-9"
                      value={kpi.target_value}
                      onChange={(e) =>
                        setKpis((prev) => {
                          const copy = prev.map((k) => ({ ...k }))
                          copy[rIdx].target_value = parseFloat(e.target.value) || 0
                          copy[rIdx].updated_at = new Date().toISOString()
                          return copy
                        })
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="block w-full min-w-[100px] rounded-md border px-2 py-1 text-sm h-9"
                      value={kpi.unit}
                      onChange={(e) =>
                        setKpis((prev) => {
                          const copy = prev.map((k) => ({ ...k }))
                          copy[rIdx].unit = e.target.value
                          copy[rIdx].updated_at = new Date().toISOString()
                          return copy
                        })
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="block w-full min-w-[180px] rounded-md border px-2 py-1 text-sm h-9"
                      value={kpi.owner}
                      onChange={(e) =>
                        setKpis((prev) => {
                          const copy = prev.map((k) => ({ ...k }))
                          copy[rIdx].owner = e.target.value
                          copy[rIdx].updated_at = new Date().toISOString()
                          return copy
                        })
                      }
                    />
                  </td>
                  <td className="w-[1%] whitespace-nowrap">
                    <div className="flex gap-2">
                      <Button size="sm" variant="destructive" onClick={() => setKpis((prev) => prev.filter((k) => k.id !== kpi.id))}>
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="p-3">
            <Button
              variant="outline"
              onClick={() =>
                setKpis((prev) => [
                  ...prev,
                  {
                    id: `kpi-${Date.now()}`,
                    scenario_id: `scenario-${scenario}`,
                    name: "New KPI",
                    target_value: 100,
                    current_value: 0,
                    unit: "%",
                    owner: "Owner",
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  },
                ])
              }
            >
              Add KPI
            </Button>
          </div>
        </div>
      )}

      {activeTab === "financials" && (
        <div className="overflow-x-auto rounded-xl border">
          <table className="table-fixed w-full min-w-[1200px] text-sm">
            <thead className="sticky top-0 bg-background z-10">
              <tr className="[&>th]:px-3 [&>th]:py-2 text-left">
                {financialHeaders.map((h) => (
                  <th key={h} className="whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="[&>tr>td]:px-3 [&>tr>td]:py-2 align-top">
              {financialData.map((row, rIdx) => (
                <tr key={rIdx} className="border-t">
                  {row.map((cell: any, cIdx: number) => (
                    <td key={`${rIdx}-${cIdx}`}>
                      <input
                        className="block w-full min-w-[180px] rounded-md border px-2 py-1 text-sm h-9"
                        value={cell ?? ""}
                        onChange={(e) =>
                          setFinancialData((prev) => {
                            const copy = prev.map((r) => [...r])
                            copy[rIdx][cIdx] = e.target.value
                            return copy
                          })
                        }
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="p-3">
            <Button variant="outline" onClick={() => setFinancialData((prev) => [...prev, ["New Category", "New Item", 0, "Expense", ""]])}>
              Add Financial Row
            </Button>
          </div>
        </div>
      )}

      {activeTab === "glossary" && (
        <div className="overflow-x-auto rounded-xl border">
          <table className="table-fixed w-full min-w-[900px] text-sm">
            <thead className="sticky top-0 bg-background z-10">
              <tr className="[&>th]:px-3 [&>th]:py-2 text-left">
                {glossaryHeaders.map((h) => (
                  <th key={h} className="whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="[&>tr>td]:px-3 [&>tr>td]:py-2 align-top">
              {glossaryTerms.map((row, rIdx) => (
                <tr key={rIdx} className="border-t">
                  {row.map((cell: any, cIdx: number) => (
                    <td key={`${rIdx}-${cIdx}`}>
                      <input
                        className="block w-full min-w-[260px] rounded-md border px-2 py-1 text-sm h-9"
                        value={cell ?? ""}
                        onChange={(e) =>
                          setGlossaryTerms((prev) => {
                            const copy = prev.map((r) => [...r])
                            copy[rIdx][cIdx] = e.target.value
                            return copy
                          })
                        }
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="p-3">
            <Button variant="outline" onClick={() => setGlossaryTerms((prev) => [...prev, ["New Term", "Definition"]])}>
              Add Term
            </Button>
          </div>
        </div>
      )}

      {activeTab === "config" && (
        <div className="grid gap-4 rounded-xl border p-4">
          <div className="text-sm text-muted-foreground">Scenario</div>
          <div className="flex gap-2">
            <Button variant={scenario === "50k" ? "default" : "outline"} onClick={() => setScenario("50k")}>
              50k
            </Button>
            <Button variant={scenario === "200k" ? "default" : "outline"} onClick={() => setScenario("200k")}>
              200k
            </Button>
          </div>
          <div className="flex gap-2">
            <Button onClick={saveProjectDataToDatabase} disabled={saving}>
              {saving ? "Saving…" : "Save to Supabase"}
            </Button>
            <Button variant="outline" onClick={loadProjectDataFromDatabase}>
              Reload from Supabase
            </Button>
          </div>
          <SyncStatusIndicator syncStatus={syncStatus} />
        </div>
      )}
    </div>
  )
}

export default ScaleUpDashboard
