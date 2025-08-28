"use client"

import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { Button } from "@/components/ui/button"
import { Download } from "lucide-react"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

interface WeeklySummary {
  week: string
  projectsCompleted: number
  projectsOnTrack: number
  projectsAtRisk: number
  keyMilestones: string[]
  criticalIssues: string[]
  nextWeekPriorities: string[]
  kpiSummary: {
    name: string
    current: number
    target: number
    trend: "up" | "down" | "stable"
  }[]
}

export function generateWeeklySummary(): WeeklySummary {
  const currentWeek = new Date().toISOString().split("T")[0]

  return {
    week: `Week of ${currentWeek}`,
    projectsCompleted: 3,
    projectsOnTrack: 15,
    projectsAtRisk: 2,
    keyMilestones: [
      "Manufacturing line setup completed",
      "Quality control processes validated",
      "Initial production batch successful",
    ],
    criticalIssues: ["Equipment delivery delayed by 2 weeks", "Resource allocation needs review"],
    nextWeekPriorities: [
      "Complete equipment installation",
      "Finalize staff training program",
      "Begin pilot production run",
    ],
    kpiSummary: [
      { name: "Production Efficiency", current: 85, target: 90, trend: "up" },
      { name: "Quality Score", current: 92, target: 95, trend: "stable" },
      { name: "Cost per Unit", current: 32, target: 30, trend: "down" },
    ],
  }
}

export function WeeklySummaryExport({
  data,
  scenario,
  variant,
  analysis,
}: {
  data: any
  scenario: string
  variant: string
  analysis: { summary: string; tldr: string }
}) {
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
${summary.keyMilestones.map((milestone) => `• ${milestone}`).join("\n")}

⚠️ CRITICAL ISSUES REQUIRING ATTENTION
${summary.criticalIssues.length > 0 ? summary.criticalIssues.map((issue) => `• ${issue}`).join("\n") : "• No critical issues identified"}

📈 KPI PERFORMANCE SUMMARY
${summary.kpiSummary.map((kpi) => `• ${kpi.name}: ${kpi.current}/${kpi.target} ${kpi.trend === "up" ? "↗️" : kpi.trend === "down" ? "↘️" : "→"}`).join("\n")}

🚀 NEXT WEEK PRIORITIES
${summary.nextWeekPriorities.map((priority) => `• ${priority}`).join("\n")}

═══════════════════════════════════════════════════════════════

📋 EXECUTIVE SUMMARY
${analysis.tldr || "Analysis pending..."}

🔍 DETAILED ANALYSIS
${analysis.summary || "Detailed analysis will be available after CEO analysis is generated."}

═══════════════════════════════════════════════════════════════
Generated: ${new Date().toLocaleString()}
Dashboard Version: v63
    `.trim()

    const blob = new Blob([reportContent], { type: "text/plain;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `Weekly_Summary_${summary.week}_${variant}_${scenario}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Button variant="outline" size="sm" onClick={exportWeeklySummary} className="gap-2 bg-transparent">
      <Download className="h-4 w-4" />
      Export Weekly Summary
    </Button>
  )
}

export function SaveLoadModal({
  isOpen,
  onClose,
  onSave,
  onLoad,
  savedConfigs,
  loading,
}: {
  isOpen: boolean
  onClose: () => void
  onSave: (name: string, description: string) => void
  onLoad: () => void
  savedConfigs: any[]
  loading: boolean
}) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        <h2 className="text-lg font-semibold mb-4">Database Operations</h2>
        <p className="text-sm text-gray-600 mb-4">Save and load project configurations</p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  )
}

export function AlertsNotificationBell({
  alerts,
  onShowAlerts,
}: {
  alerts: any[]
  onShowAlerts: () => void
}) {
  return (
    <Button variant="ghost" size="sm" onClick={onShowAlerts}>
      🔔 {alerts.length > 0 && <span className="ml-1">({alerts.length})</span>}
    </Button>
  )
}
