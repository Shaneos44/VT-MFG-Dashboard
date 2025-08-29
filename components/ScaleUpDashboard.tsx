"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, TrendingUp, Plus, Trash2, FileText, Save, CalendarPlus, BarChart2 } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Button } from "@/components/ui/button";
import { generateWeeklySummary } from "@/lib/utils";
import { clone, SEED_PLAN } from "@/lib/constants";

/**
 * Notes:
 * - CapEx / OpEx are now derived from the Financials tab (single source of truth).
 *   Financials row shape is: ["Category", "Item", amount, "Type", "Notes", "Scenario? (optional: 50k|200k|Both)"]
 *   If Scenario column is omitted, it's treated as "Both".
 * - Autosave persists everything (plan/scenario/variant and all tables) via /api/configurations.
 * - Meetings modal, weekly report, CEO report, and all tabs remain intact.
 * - Projects tab uses wrapped text and wider columns so content isn't hidden.
 */

type AnyRow = any[];

type KPI = {
  id: string;
  scenario_id: string;
  name: string;
  target_value: number;
  current_value: number;
  unit: string;
  owner: string;
  created_at: string;
  updated_at: string;
};

type Variant = "Recess Nanodispensing" | "Dipcoating";

const MOSCOW = ["Must", "Should", "Could", "Won't"] as const;
const IMPACT = ["H", "M", "L"] as const;
const PROB = ["H", "M", "L"] as const;

function toNumber(x: any): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function getScenarioFromFinancialRow(row: AnyRow): "50k" | "200k" | "Both" {
  const scenarioCell = row?.[5];
  const val = String(scenarioCell ?? "Both").trim();
  if (val.toLowerCase() === "50k") return "50k";
  if (val.toLowerCase() === "200k") return "200k";
  return "Both";
}

function sumCapexFromFinancials(rows: AnyRow[], scenario: "50k" | "200k"): number {
  return rows.reduce((sum, r) => {
    const category = String(r?.[0] ?? "").toLowerCase();
    if (category !== "capex") return sum;
    const sc = getScenarioFromFinancialRow(r);
    if (!(sc === "Both" || sc === scenario)) return sum;
    const amount = toNumber(r?.[2]);
    return sum + amount;
  }, 0);
}

function sumOpexFromFinancials(rows: AnyRow[], scenario: "50k" | "200k"): number {
  return rows.reduce((sum, r) => {
    const category = String(r?.[0] ?? "").toLowerCase();
    if (category !== "opex") return sum;
    const sc = getScenarioFromFinancialRow(r);
    if (!(sc === "Both" || sc === scenario)) return sum;
    const amount = toNumber(r?.[2]);
    return sum + amount;
  }, 0);
}

export default function ScaleUpDashboard() {
  // Core page state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // High-level configuration
  const [scenario, setScenario] = useState<"50k" | "200k">("50k");
  const [variant, setVariant] = useState<Variant>("Recess Nanodispensing");

  // Plan (seeded)
  const [plan, setPlan] = useState<any>(() => {
    const initialPlan = clone(SEED_PLAN);
    if (!initialPlan?.scenarios) {
      initialPlan.scenarios = {
        "50k": { unitsPerYear: 50000, hoursPerDay: 8, shifts: 1 },
        "200k": { unitsPerYear: 200000, hoursPerDay: 16, shifts: 2 },
      };
    }
    return initialPlan;
  });

  // Tables
  const [projects, setProjects] = useState<AnyRow[]>([]);
  const [processes, setProcesses] = useState<AnyRow[]>([]);
  const [resources, setResources] = useState<AnyRow[]>([]);
  const [risks, setRisks] = useState<AnyRow[]>([]);
  const [financialData, setFinancialData] = useState<AnyRow[]>([
    // Category, Item, Amount, Type, Notes, Scenario?
    ["Revenue", "Product Sales", 2250000, "Income", "Projected annual revenue", "Both"],
    ["OpEx", "Operating Expenses", 450000, "Expense", "General overhead", "Both"],
    ["CapEx", "Equipment Investment", 750000, "Investment", "Core equipment", "Both"],
  ]);
  const [meetings, setMeetings] = useState<AnyRow[]>([]);
  const [glossary, setGlossary] = useState<AnyRow[]>([
    ["IHCL", "Ion-Implanted Hydrophilic Coating Layer - Surface treatment process"],
    ["OCP", "Open Circuit Potential - Electrochemical measurement technique"],
  ]);
  const [hiring, setHiring] = useState<AnyRow[]>([]);

  // KPIs
  const [kpis, setKpis] = useState<KPI[]>([
    {
      id: "kpi-1",
      scenario_id: "default-scenario",
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
      scenario_id: "default-scenario",
      name: "Quality Score",
      target_value: 98,
      current_value: 94,
      unit: "%",
      owner: "Quality Engineer",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ]);

  // Meetings modal
  const [showMeetingModal, setShowMeetingModal] = useState(false);
  const [editingMeetingIndex, setEditingMeetingIndex] = useState<number | null>(null);
  const [meetingForm, setMeetingForm] = useState({
    id: "",
    title: "New Meeting",
    date: new Date().toISOString().split("T")[0],
    time: "10:00",
    duration: "60 min",
    attendees: "Project Team, Stakeholders",
    location: "Conference Room / Zoom",
    status: "Scheduled",
    agenda: "1. Welcome\n2. Updates\n3. Risks & Blockers\n4. Decisions\n5. Actions",
    objectives: "Review progress and align priorities",
    notes: "",
  });

  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Derived totals from FINANCIALS (single source of truth)
  const capexTotal50 = useMemo(() => sumCapexFromFinancials(financialData, "50k"), [financialData]);
  const capexTotal200 = useMemo(() => sumCapexFromFinancials(financialData, "200k"), [financialData]);
  const opexTotal50 = useMemo(() => sumOpexFromFinancials(financialData, "50k"), [financialData]);
  const opexTotal200 = useMemo(() => sumOpexFromFinancials(financialData, "200k"), [financialData]);

  // Scenario & CPU/Financial metrics
  const sc = plan?.scenarios?.[scenario] ?? {
    unitsPerYear: scenario === "50k" ? 50000 : 200000,
    hoursPerDay: 8,
    shifts: 1,
  };

  const opexSelected = scenario === "50k" ? opexTotal50 : opexTotal200;
  const capexSelected = scenario === "50k" ? capexTotal50 : capexTotal200;

  const cpu = sc.unitsPerYear ? opexSelected / sc.unitsPerYear : 0;
  const pricePerUnit = 45;
  const revenue = (sc.unitsPerYear || 0) * pricePerUnit;
  const grossProfit = revenue - (capexSelected + opexSelected);
  const marginPct = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

  // --- Save / Load from Supabase via API routes ---
  const saveProjectDataToDatabase = useCallback(async () => {
    try {
      setSaving(true);

      const projectData = {
        plan,
        scenario,
        variant,
        tables: {
          projects,
          processes,
          resources,
          risks,
          financialData,
          meetings,
          glossary,
          hiring,
        },
        kpis,
        lastSaved: new Date().toISOString(),
      };

      const response = await fetch("/api/configurations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "ScaleUp-Dashboard-Config",
          description: "ScaleUp Dashboard Configuration",
          data: projectData,
          modified_by: "user",
          upsert: true,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Failed to save" }));
        console.error("Save error:", err);
        setError(err?.error || "Failed to save data.");
      }
    } catch (e: any) {
      console.error("Save failed:", e);
      setError(e?.message || "Failed to save data.");
    } finally {
      setSaving(false);
    }
  }, [plan, scenario, variant, projects, processes, resources, risks, financialData, meetings, glossary, hiring, kpis]);

  const broadcastDataUpdate = useCallback((section: string) => {
    // Debounced autosave trigger
    if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
    autoSaveTimeoutRef.current = setTimeout(() => {
      saveProjectDataToDatabase();
    }, 1200);
  }, [saveProjectDataToDatabase]);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const res = await fetch("/api/configurations", { signal: controller.signal });
        clearTimeout(timeoutId);

        if (res.ok) {
          const configs = await res.json();
          let latest = configs.find((c: any) => c.name === "ScaleUp-Dashboard-Config");
          if (!latest && configs?.length) {
            latest = configs.sort(
              (a: any, b: any) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
            )[0];
          }
          if (latest?.data) {
            const d = latest.data;

            if (d.plan) setPlan(d.plan);
            if (d.scenario) setScenario(d.scenario);
            if (d.variant) setVariant(d.variant);

            if (d.tables) {
              setProjects(Array.isArray(d.tables.projects) ? d.tables.projects : []);
              setProcesses(Array.isArray(d.tables.processes) ? d.tables.processes : []);
              setResources(Array.isArray(d.tables.resources) ? d.tables.resources : []);
              setRisks(Array.isArray(d.tables.risks) ? d.tables.risks : []);
              setFinancialData(Array.isArray(d.tables.financialData) ? d.tables.financialData : []);
              setMeetings(Array.isArray(d.tables.meetings) ? d.tables.meetings : []);
              setGlossary(Array.isArray(d.tables.glossary) ? d.tables.glossary : []);
              setHiring(Array.isArray(d.tables.hiring) ? d.tables.hiring : []);
            }
            if (Array.isArray(d.kpis)) setKpis(d.kpis);
          }
        }
      } catch (e) {
        console.warn("Load failed, using defaults.", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Trigger autosave when key tables change
  useEffect(() => {
    if (!loading) broadcastDataUpdate("projects");
  }, [projects, loading, broadcastDataUpdate]);

  useEffect(() => {
    if (!loading) broadcastDataUpdate("processes");
  }, [processes, loading, broadcastDataUpdate]);

  useEffect(() => {
    if (!loading) broadcastDataUpdate("resources");
  }, [resources, loading, broadcastDataUpdate]);

  useEffect(() => {
    if (!loading) broadcastDataUpdate("risks");
  }, [risks, loading, broadcastDataUpdate]);

  useEffect(() => {
    if (!loading) broadcastDataUpdate("financials");
  }, [financialData, loading, broadcastDataUpdate]);

  useEffect(() => {
    if (!loading) broadcastDataUpdate("meetings");
  }, [meetings, loading, broadcastDataUpdate]);

  useEffect(() => {
    if (!loading) broadcastDataUpdate("glossary");
  }, [glossary, loading, broadcastDataUpdate]);

  useEffect(() => {
    if (!loading) broadcastDataUpdate("hiring");
  }, [hiring, loading, broadcastDataUpdate]);

  useEffect(() => {
    if (!loading) broadcastDataUpdate("kpis");
  }, [kpis, loading, broadcastDataUpdate]);

  // ----------------- Projects Tab -----------------
  const projectHeaders = [
    "ID",
    "Name",
    "Type/Phase",
    "MoSCoW",
    "Owner",
    "Start",
    "Finish",
    "Dependencies",
    "Deliverables",
    "Goal",
    "R",
    "A",
    "C",
    "I",
    "Needs",
    "Barriers",
    "Risks",
    "Budget CapEx",
    "Budget OpEx",
    "Progress %",
    "Process Link",
    "Critical",
    "Status",
    "Slack Days",
  ];

  const addProject = () => {
    const row: AnyRow = [
      `PROJ-${Date.now()}`,
      "New Project",
      "Planning",
      "Must",
      "Owner",
      new Date().toISOString().split("T")[0],
      new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      "",
      "Deliverables here",
      "Project goals here",
      "R",
      "A",
      "C",
      "I",
      "needs",
      "barriers",
      "risks",
      0,
      0,
      0,
      "",
      "false",
      "GREEN",
      0,
    ];
    setProjects((prev) => [row, ...prev]);
  };

  const deleteProject = (index: number) => {
    setProjects((prev) => prev.filter((_, i) => i !== index));
  };

  const setProjectCell = (rowIndex: number, colIndex: number, value: any) => {
    setProjects((prev) => {
      const next = [...prev];
      if (!next[rowIndex]) return prev;
      const isNumeric = [17, 18, 19, 23].includes(colIndex);
      next[rowIndex][colIndex] = isNumeric ? toNumber(value) : value;
      return next;
    });
  };

  // ----------------- Processes Tab -----------------
  const processHeaders = ["Process", "Time (min)", "Batch Size", "Yield (%)", "Cycle (s)", "Equipment", "Type", "Status", "Owner"];

  const addProcess = () => {
    const row: AnyRow = ["New Process", 0, 1, 100, 0, "Manual Station", "Manual", "Planning", "Owner"];
    setProcesses((prev) => [row, ...prev]);
  };

  const deleteProcess = (index: number) => {
    setProcesses((prev) => prev.filter((_, i) => i !== index));
  };

  const setProcessCell = (rowIndex: number, colIndex: number, value: any) => {
    setProcesses((prev) => {
      const next = [...prev];
      if (!next[rowIndex]) return prev;
      const isNumeric = [1, 2, 3, 4].includes(colIndex);
      next[rowIndex][colIndex] = isNumeric ? toNumber(value) : value;
      return next;
    });
  };

  // ----------------- Resources Tab -----------------
  const resourcesHeaders = ["Resource", "Type", "Quantity", "Cost", "Department", "Notes"];

  const addResource = () => {
    const row: AnyRow = ["New Resource", "Personnel", 1, 0, "Department", "Notes"];
    setResources((prev) => [row, ...prev]);
  };

  const deleteResource = (index: number) => {
    setResources((prev) => prev.filter((_, i) => i !== index));
  };

  const setResourceCell = (rowIndex: number, colIndex: number, value: any) => {
    setResources((prev) => {
      const next = [...prev];
      if (!next[rowIndex]) return prev;
      const isNumeric = [2, 3].includes(colIndex);
      next[rowIndex][colIndex] = isNumeric ? toNumber(value) : value;
      return next;
    });
  };

  // ----------------- Risks Tab -----------------
  const risksHeaders = ["ID", "Risk", "Impact", "Prob", "Mitigation", "Owner", "Due", "Status"];

  const addRisk = () => {
    const row: AnyRow = [
      `RISK-${Date.now()}`,
      "New Risk Description",
      "M",
      "M",
      "Mitigation plan",
      "Owner",
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      "Open",
    ];
    setRisks((prev) => [row, ...prev]);
  };

  const deleteRisk = (index: number) => {
    setRisks((prev) => prev.filter((_, i) => i !== index));
  };

  const setRiskCell = (rowIndex: number, colIndex: number, value: any) => {
    setRisks((prev) => {
      const next = [...prev];
      if (!next[rowIndex]) return prev;
      next[rowIndex][colIndex] = value;
      return next;
    });
  };

  // ----------------- Financials Tab -----------------
  const financialHeaders = ["Category", "Item", "Amount", "Type", "Notes", "Scenario"];

  const addFinancial = () => {
    const row: AnyRow = ["OpEx", "New Item", 0, "Expense", "", "Both"];
    setFinancialData((prev) => [row, ...prev]);
  };

  const deleteFinancial = (index: number) => {
    setFinancialData((prev) => prev.filter((_, i) => i !== index));
  };

  const setFinancialCell = (rowIndex: number, colIndex: number, value: any) => {
    setFinancialData((prev) => {
      const next = [...prev];
      if (!next[rowIndex]) return prev;
      if (colIndex === 2) {
        next[rowIndex][colIndex] = toNumber(value);
      } else {
        next[rowIndex][colIndex] = value;
      }
      return next;
    });
  };

  // ----------------- KPIs Tab -----------------
  const addKPI = () => {
    const k: KPI = {
      id: `kpi-${Date.now()}`,
      scenario_id: `scenario-${scenario}`,
      name: "New KPI",
      target_value: 100,
      current_value: 0,
      unit: "%",
      owner: "Team Lead",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setKpis((prev) => [...prev, k]);
  };

  const deleteKPI = (id: string) => {
    setKpis((prev) => prev.filter((k) => k.id !== id));
  };

  const setKpiField = (id: string, field: keyof KPI, value: any) => {
    setKpis((prev) =>
      prev.map((k) =>
        k.id === id
          ? {
              ...k,
              [field]: field === "current_value" || field === "target_value" ? toNumber(value) : value,
              updated_at: new Date().toISOString(),
            }
          : k,
      ),
    );
  };

  // ----------------- Meetings Tab (Modal + Export) -----------------
  const openNewMeetingModal = () => {
    setEditingMeetingIndex(null);
    setMeetingForm({
      id: `MEET-${Date.now()}`,
      title: "New Meeting",
      date: new Date().toISOString().split("T")[0],
      time: "10:00",
      duration: "60 min",
      attendees: "Project Team, Stakeholders",
      location: "Conference Room / Zoom",
      status: "Scheduled",
      agenda: "1. Welcome\n2. Updates\n3. Risks & Blockers\n4. Decisions\n5. Actions",
      objectives: "Review progress and align priorities",
      notes: "",
    });
    setShowMeetingModal(true);
  };

  const openEditMeetingModal = (rowIndex: number) => {
    const row = meetings[rowIndex] || [];
    setEditingMeetingIndex(rowIndex);
    setMeetingForm({
      id: String(row[0] || `MEET-${Date.now()}`),
      title: String(row[1] || "Meeting"),
      date: String(row[2] || new Date().toISOString().split("T")[0]),
      time: String(row[3] || "10:00"),
      duration: String(row[4] || "60 min"),
      attendees: String(row[10] || row[5] || "Team"),
      location: String(row[6] || "Location"),
      status: String(row[7] || "Scheduled"),
      agenda: String(row[8] || "Agenda items"),
      objectives: String(row[9] || "Objectives"),
      notes: String(row[10] || row[11] || "Notes"),
    });
    setShowMeetingModal(true);
  };

  const saveMeetingFromModal = () => {
    const newRow: AnyRow = [
      meetingForm.id,
      meetingForm.title,
      meetingForm.date,
      meetingForm.time,
      meetingForm.duration,
      meetingForm.attendees,
      meetingForm.location,
      meetingForm.status,
      meetingForm.agenda,
      meetingForm.objectives,
      meetingForm.notes,
      meetingForm.attendees,
    ];
    setMeetings((prev) => {
      if (editingMeetingIndex === null) return [newRow, ...prev];
      const next = [...prev];
      next[editingMeetingIndex] = newRow;
      return next;
    });
    setShowMeetingModal(false);
    setEditingMeetingIndex(null);
  };

  const exportMeetingSummary = (rowIndex: number) => {
    const row = meetings[rowIndex] || [];
    const title = String(row[1] || "Meeting");
    const date = String(row[2] || "");
    const time = String(row[3] || "");
    const duration = String(row[4] || "");
    const attendees = String(row[10] || row[5] || "");
    const location = String(row[6] || "");
    const status = String(row[7] || "");
    const agenda = String(row[8] || "");
    const objectives = String(row[9] || "");
    const notes = String(row[10] || row[11] || "");

    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const left = 40;
    let y = 50;

    doc.setFontSize(16);
    doc.text(`Meeting Summary — ${title}`, left, y);
    y += 20;
    doc.setFontSize(11);
    doc.text(`Date: ${date}   Time: ${time}   Duration: ${duration}`, left, y);
    y += 16;
    doc.text(`Location: ${location}`, left, y);
    y += 16;
    doc.text(`Attendees: ${attendees}`, left, y);
    y += 16;
    doc.text(`Status: ${status}`, left, y);
    y += 24;

    autoTable(doc, {
      startY: y,
      head: [["Section", "Details"]],
      body: [
        ["Objectives", objectives],
        ["Agenda", agenda],
        ["Notes / Minutes", notes],
        ["Actions (if any)", ""],
      ],
      styles: { fontSize: 10, cellPadding: 6, valign: "top" },
      headStyles: { fillColor: [15, 23, 42] },
      columnStyles: {
        0: { cellWidth: 140 },
        1: { cellWidth: 380 },
      },
      margin: { left },
      theme: "striped",
    });

    doc.save(`Meeting_${title.replace(/\s+/g, "_")}_${date}.pdf`);
  };

  // ----------------- Weekly Summary TXT -----------------
  const exportWeeklySummary = () => {
    const summary = generateWeeklySummary();

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
${summary.keyMilestones.map((m) => `• ${m}`).join("\n")}

⚠️ CRITICAL ISSUES REQUIRING ATTENTION
${summary.criticalIssues.length > 0 ? summary.criticalIssues.map((i) => `• ${i}`).join("\n") : "• No critical issues identified"}

📈 KPI PERFORMANCE SUMMARY
${summary.kpiSummary
  .map(
    (k) =>
      `• ${k.name}: ${k.current}/${k.target} ${
        k.trend === "up" ? "↗️" : k.trend === "down" ? "↘️" : "→"
      }`,
  )
  .join("\n")}

🚀 NEXT WEEK PRIORITIES
${summary.nextWeekPriorities.map((p) => `• ${p}`).join("\n")}

═══════════════════════════════════════════════════════════════

📋 EXECUTIVE SUMMARY
• Target Output: ${(sc.unitsPerYear || 0).toLocaleString()} units/year
• CapEx Total: $${(scenario === "50k" ? capexTotal50 : capexTotal200).toLocaleString()}
• OpEx Total: $${(scenario === "50k" ? opexTotal50 : opexTotal200).toLocaleString()}
• Cost per Unit (OpEx only): $${cpu.toFixed(2)}
• Revenue (est.): $${revenue.toLocaleString()}
• Gross Profit (est.): $${grossProfit.toLocaleString()} (${marginPct.toFixed(1)}% margin)

═══════════════════════════════════════════════════════════════
Generated: ${new Date().toLocaleString()}
Dashboard Version: v64
    `.trim();

    const blob = new Blob([reportContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Weekly_Summary_${summary.week}_${variant}_${scenario}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ----------------- CEO Summary PDF -----------------
  const generateCEOReportPDF = () => {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const left = 40;
    let y = 56;

    const totalProjects = projects.length;
    const completedProjects = projects.filter((p) => (Number(p?.[19]) || 0) >= 100).length;
    const statusCol = 22;
    const onTrack = projects.filter((p) => String(p?.[statusCol] || "").toUpperCase() === "GREEN").length;
    const atRisk = projects.filter((p) => {
      const s = String(p?.[statusCol] || "").toUpperCase();
      return s === "RED" || s === "AMBER";
    }).length;

    const avgKpiPerformance =
      kpis.length > 0
        ? kpis.reduce(
            (acc, kk) => acc + (kk.target_value ? (kk.current_value / kk.target_value) * 100 : 0),
            0,
          ) / kpis.length
        : 0;

    doc.setFontSize(18);
    doc.text(`CEO Executive Summary — ${variant} / ${scenario}`, left, y);
    y += 20;
    doc.setFontSize(11);
    doc.text(`Generated: ${new Date().toLocaleString()}`, left, y);
    y += 18;

    autoTable(doc, {
      startY: y,
      head: [["Metric", "Value"]],
      body: [
        ["Target Output (units/yr)", (sc.unitsPerYear || 0).toLocaleString()],
        ["CapEx Total (USD)", `$${(scenario === "50k" ? capexTotal50 : capexTotal200).toLocaleString()}`],
        ["OpEx Total (USD)", `$${(scenario === "50k" ? opexTotal50 : opexTotal200).toLocaleString()}`],
        ["Cost / Unit (OpEx only)", `$${cpu.toFixed(2)}`],
        ["Revenue (USD, est.)", `$${revenue.toLocaleString()}`],
        ["Gross Profit (USD, est.)", `$${grossProfit.toLocaleString()}`],
        ["Profit Margin (%)", `${marginPct.toFixed(1)}%`],
        [
          "Projects — Total / Completed / On-Track / At-Risk",
          `${totalProjects} / ${completedProjects} / ${onTrack} / ${atRisk}`,
        ],
        ["KPIs — Avg Performance", `${avgKpiPerformance.toFixed(1)}%`],
        ["Risks — Total", `${risks.length}`],
      ],
      styles: { fontSize: 10, cellPadding: 6, valign: "top" },
      headStyles: { fillColor: [15, 23, 42] },
      columnStyles: {
        0: { cellWidth: 260 },
        1: { cellWidth: 260 },
      },
      margin: { left },
      theme: "grid",
    });

    let afterSummaryY = (doc as any).lastAutoTable.finalY + 24;

    autoTable(doc, {
      startY: afterSummaryY,
      head: [["KPI", "Current", "Target", "Δ Var (%)", "Owner"]],
      body: kpis.map((k) => [
        k.name,
        `${k.current_value} ${k.unit}`,
        `${k.target_value} ${k.unit}`,
        k.target_value ? (((k.current_value - k.target_value) / k.target_value) * 100).toFixed(1) : "0.0",
        k.owner,
      ]),
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: [15, 23, 42] },
      columnStyles: {
        0: { cellWidth: 220 },
        1: { cellWidth: 100 },
        2: { cellWidth: 100 },
        3: { cellWidth: 80 },
        4: { cellWidth: 120 },
      },
      margin: { left },
      theme: "striped",
      didDrawPage: (data) => {
        doc.setFontSize(12);
        doc.text("KPI Dashboard", left, data.settings.startY - 8);
      },
    });

    let afterKpiY = (doc as any).lastAutoTable.finalY + 24;

    const projectBody = projects.slice(0, 20).map((p) => [
      String(p?.[1] || ""),
      String(p?.[4] || ""),
      String(p?.[6] || ""),
      String(p?.[22] || ""),
      `${Number(p?.[19] || 0)}%`,
    ]);

    autoTable(doc, {
      startY: afterKpiY,
      head: [["Project", "Owner", "Finish", "Status", "Progress"]],
      body: projectBody,
      styles: { fontSize: 9, cellPadding: 5, overflow: "linebreak" },
      headStyles: { fillColor: [15, 23, 42] },
      columnStyles: {
        0: { cellWidth: 240 },
        1: { cellWidth: 120 },
        2: { cellWidth: 90 },
        3: { cellWidth: 80 },
        4: { cellWidth: 50 },
      },
      margin: { left },
      theme: "striped",
      didDrawPage: (data) => {
        doc.setFontSize(12);
        doc.text("Top Projects", left, data.settings.startY - 8);
      },
    });

    let afterProjectsY = (doc as any).lastAutoTable.finalY + 24;

    const riskBody = risks.slice(0, 15).map((r) => [
      String(r?.[0] || ""),
      String(r?.[1] || ""),
      String(r?.[2] || ""),
      String(r?.[3] || ""),
      String(r?.[4] || ""),
      String(r?.[5] || ""),
      String(r?.[7] || ""),
    ]);

    autoTable(doc, {
      startY: afterProjectsY,
      head: [["ID", "Risk", "Impact", "Prob", "Mitigation", "Owner", "Status"]],
      body: riskBody,
      styles: { fontSize: 9, cellPadding: 5, overflow: "linebreak" },
      headStyles: { fillColor: [15, 23, 42] },
      columnStyles: {
        0: { cellWidth: 70 },
        1: { cellWidth: 210 },
        2: { cellWidth: 60 },
        3: { cellWidth: 60 },
        4: { cellWidth: 180 },
        5: { cellWidth: 80 },
        6: { cellWidth: 60 },
      },
      margin: { left },
      theme: "striped",
      didDrawPage: (data) => {
        doc.setFontSize(12);
        doc.text("Key Risks", left, data.settings.startY - 8);
      },
    });

    const fileName = `CEO_Summary_${variant.replace(/\s+/g, "_")}_${scenario}_${new Date()
      .toISOString()
      .slice(0, 10)}.pdf`;
    doc.save(fileName);
  };

  // ----------------- Overview numbers (high level) -----------------
  const overview = useMemo(() => {
    const totalProjects = projects.length;
    const completed = projects.filter((p) => (Number(p?.[19]) || 0) >= 100).length;
    const statusCol = 22;
    const onTrack = projects.filter((p) => String(p?.[statusCol] || "").toUpperCase() === "GREEN").length;
    const taktSecondsAvg =
      processes.length > 0
        ? Math.round(
            processes.reduce((acc, r) => acc + (Number(r?.[4]) || 0), 0) / Math.max(processes.length, 1),
          )
        : 0;

    const kpiAvg =
      kpis.length > 0
        ? Math.round(
            kpis.reduce(
              (acc, k) =>
                acc + (k.target_value ? (k.current_value / k.target_value) * 100 : 0),
              0,
            ) / kpis.length,
          )
        : 0;

    return {
      totalProjects,
      completed,
      onTrack,
      taktSecondsAvg,
      kpiAvg,
      capex: capexSelected,
      opex: opexSelected,
      cpu,
      revenue,
      grossProfit,
      marginPct,
    };
  }, [projects, processes, kpis, capexSelected, opexSelected, cpu, revenue, grossProfit, marginPct]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center space-x-2">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="text-lg font-medium">Loading Your Project</span>
          </div>
          <p className="text-sm text-muted-foreground">Retrieving your latest data...</p>
          <Button variant="outline" onClick={() => setLoading(false)} className="mt-4">
            Skip Loading
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-4">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl md:text-2xl font-semibold">Scale-Up Dashboard</h1>
          <div className="text-sm text-slate-500">Variant:</div>
          <select
            className="border rounded px-2 py-1 text-sm"
            value={variant}
            onChange={(e) => setVariant(e.target.value as Variant)}
          >
            <option>Recess Nanodispensing</option>
            <option>Dipcoating</option>
          </select>
          <div className="text-sm text-slate-500 ml-2">Scenario:</div>
          <select
            className="border rounded px-2 py-1 text-sm"
            value={scenario}
            onChange={(e) => setScenario(e.target.value as "50k" | "200k")}
          >
            <option value="50k">50k</option>
            <option value="200k">200k</option>
          </select>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={saveProjectDataToDatabase} className="gap-2">
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : "Save Now"}
          </Button>
          <Button variant="outline" onClick={exportWeeklySummary} className="gap-2">
            <FileText className="h-4 w-4" />
            Weekly Report (TXT)
          </Button>
          <Button variant="outline" onClick={generateCEOReportPDF} className="gap-2">
            <BarChart2 className="h-4 w-4" />
            CEO Summary (PDF)
          </Button>
          <Button variant="default" onClick={openNewMeetingModal} className="gap-2">
            <CalendarPlus className="h-4 w-4" />
            New Meeting
          </Button>
        </div>
      </div>

      {/* Overview cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border p-4">
          <div className="text-xs text-slate-500">Target Output</div>
          <div className="text-xl font-semibold">{(sc.unitsPerYear || 0).toLocaleString()}</div>
          <div className="text-xs text-slate-400">units/year</div>
        </div>
        <div className="rounded-xl border p-4">
          <div className="text-xs text-slate-500">CapEx / OpEx</div>
          <div className="text-lg font-medium">
            ${overview.capex.toLocaleString()} / ${overview.opex.toLocaleString()}
          </div>
        </div>
        <div className="rounded-xl border p-4">
          <div className="text-xs text-slate-500">CPU (OpEx only)</div>
          <div className="text-xl font-semibold">${overview.cpu.toFixed(2)}</div>
        </div>
        <div className="rounded-xl border p-4">
          <div className="text-xs text-slate-500">Margin (est.)</div>
          <div className="text-xl font-semibold">{overview.marginPct.toFixed(1)}%</div>
        </div>
        <div className="rounded-xl border p-4">
          <div className="text-xs text-slate-500">Projects</div>
          <div className="text-lg font-medium">
            {overview.totalProjects} total • {overview.onTrack} on track
          </div>
        </div>
        <div className="rounded-xl border p-4">
          <div className="text-xs text-slate-500">Completed</div>
          <div className="text-xl font-semibold">{overview.completed}</div>
        </div>
        <div className="rounded-xl border p-4">
          <div className="text-xs text-slate-500">Avg Takt (s)</div>
          <div className="text-xl font-semibold">{overview.taktSecondsAvg}</div>
        </div>
        <div className="rounded-xl border p-4">
          <div className="text-xs text-slate-500">KPI Avg</div>
          <div className="text-xl font-semibold">{overview.kpiAvg}%</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="space-y-6">
        {/* Projects */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Projects
            </h2>
            <div className="flex gap-2">
              <Button onClick={addProject} className="gap-2">
                <Plus className="h-4 w-4" />
                Add Project
              </Button>
            </div>
          </div>
          <div className="w-full overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {projectHeaders.map((h) => (
                    <th
                      key={h}
                      className="border bg-slate-50 text-slate-700 text-xs font-medium px-2 py-2 text-left"
                      style={{ position: "sticky", top: 0, zIndex: 1 }}
                    >
                      {h}
                    </th>
                  ))}
                  <th className="border bg-slate-50 text-slate-700 text-xs font-medium px-2 py-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((row, rIdx) => (
                  <tr key={row?.[0] || rIdx}>
                    {projectHeaders.map((_, cIdx) => {
                      const isWide =
                        [1, 8, 9, 14, 15, 16, 20].includes(cIdx); // columns with long text
                      const isDate = [5, 6].includes(cIdx);
                      const isSelectMoSCoW = cIdx === 3;
                      const isNumeric = [17, 18, 19, 23].includes(cIdx);

                      if (isSelectMoSCoW) {
                        return (
                          <td key={cIdx} className="border align-top px-2 py-2">
                            <select
                              value={row?.[cIdx] ?? ""}
                              onChange={(e) => setProjectCell(rIdx, cIdx, e.target.value)}
                              className="w-full border rounded px-2 py-1 text-sm"
                            >
                              {Array.from(MOSCOW).map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          </td>
                        );
                      }

                      if (isDate) {
                        return (
                          <td key={cIdx} className="border align-top px-2 py-2">
                            <input
                              type="date"
                              className="w-full border rounded px-2 py-1 text-sm"
                              value={row?.[cIdx] || ""}
                              onChange={(e) => setProjectCell(rIdx, cIdx, e.target.value)}
                            />
                          </td>
                        );
                      }

                      if (isNumeric) {
                        return (
                          <td key={cIdx} className="border align-top px-2 py-2">
                            <input
                              type="number"
                              className="w-full border rounded px-2 py-1 text-sm text-right"
                              value={row?.[cIdx] ?? 0}
                              onChange={(e) => setProjectCell(rIdx, cIdx, e.target.value)}
                            />
                          </td>
                        );
                      }

                      const isStatus = cIdx === 22;
                      if (isStatus) {
                        return (
                          <td key={cIdx} className="border align-top px-2 py-2">
                            <select
                              className="w-full border rounded px-2 py-1 text-sm"
                              value={row?.[cIdx] ?? "GREEN"}
                              onChange={(e) => setProjectCell(rIdx, cIdx, e.target.value)}
                            >
                              <option value="GREEN">GREEN</option>
                              <option value="AMBER">AMBER</option>
                              <option value="RED">RED</option>
                            </select>
                          </td>
                        );
                      }

                      const inputTag = isWide ? "textarea" : "input";
                      const commonStyle: React.CSSProperties = {
                        width: "100%",
                        minWidth: isWide ? 280 : 140,
                        maxWidth: isWide ? 480 : 220,
                        whiteSpace: "normal",
                        wordBreak: "break-word",
                      };

                      return (
                        <td key={cIdx} className="border align-top px-2 py-2">
                          {inputTag === "textarea" ? (
                            <textarea
                              className="w-full border rounded px-2 py-1 text-sm"
                              style={{ ...commonStyle, height: 68 }}
                              value={row?.[cIdx] ?? ""}
                              onChange={(e) => setProjectCell(rIdx, cIdx, e.target.value)}
                            />
                          ) : (
                            <input
                              className="w-full border rounded px-2 py-1 text-sm"
                              style={commonStyle}
                              value={row?.[cIdx] ?? ""}
                              onChange={(e) => setProjectCell(rIdx, cIdx, e.target.value)}
                            />
                          )}
                        </td>
                      );
                    })}
                    <td className="border px-2 py-2">
                      <Button variant="destructive" size="sm" onClick={() => deleteProject(rIdx)} className="gap-2">
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Processes */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Processes</h2>
            <div className="flex gap-2">
              <Button onClick={addProcess} className="gap-2">
                <Plus className="h-4 w-4" />
                Add Process
              </Button>
            </div>
          </div>
          <div className="w-full overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {processHeaders.map((h) => (
                    <th key={h} className="border bg-slate-50 text-slate-700 text-xs font-medium px-2 py-2 text-left">
                      {h}
                    </th>
                  ))}
                  <th className="border bg-slate-50 text-slate-700 text-xs font-medium px-2 py-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {processes.map((row, rIdx) => (
                  <tr key={rIdx}>
                    {processHeaders.map((_, cIdx) => {
                      const isNumeric = [1, 2, 3, 4].includes(cIdx);
                      const isWide = cIdx === 0;

                      if (isNumeric) {
                        return (
                          <td key={cIdx} className="border px-2 py-2">
                            <input
                              type="number"
                              className="w-full border rounded px-2 py-1 text-sm text-right"
                              value={row?.[cIdx] ?? 0}
                              onChange={(e) => setProcessCell(rIdx, cIdx, e.target.value)}
                            />
                          </td>
                        );
                      }

                      return (
                        <td key={cIdx} className="border px-2 py-2">
                          {isWide ? (
                            <textarea
                              className="w-full border rounded px-2 py-1 text-sm"
                              style={{ minWidth: 260, height: 60 }}
                              value={row?.[cIdx] ?? ""}
                              onChange={(e) => setProcessCell(rIdx, cIdx, e.target.value)}
                            />
                          ) : (
                            <input
                              className="w-full border rounded px-2 py-1 text-sm"
                              value={row?.[cIdx] ?? ""}
                              onChange={(e) => setProcessCell(rIdx, cIdx, e.target.value)}
                            />
                          )}
                        </td>
                      );
                    })}
                    <td className="border px-2 py-2">
                      <Button variant="destructive" size="sm" onClick={() => deleteProcess(rIdx)} className="gap-2">
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Resources */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Resources</h2>
            <div className="flex gap-2">
              <Button onClick={addResource} className="gap-2">
                <Plus className="h-4 w-4" />
                Add Resource
              </Button>
            </div>
          </div>
          <div className="w-full overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {resourcesHeaders.map((h) => (
                    <th key={h} className="border bg-slate-50 text-slate-700 text-xs font-medium px-2 py-2 text-left">
                      {h}
                    </th>
                  ))}
                  <th className="border bg-slate-50 text-slate-700 text-xs font-medium px-2 py-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {resources.map((row, rIdx) => (
                  <tr key={rIdx}>
                    {resourcesHeaders.map((_, cIdx) => {
                      const isNumeric = [2, 3].includes(cIdx);
                      return (
                        <td key={cIdx} className="border px-2 py-2">
                          <input
                            type={isNumeric ? "number" : "text"}
                            className="w-full border rounded px-2 py-1 text-sm"
                            value={row?.[cIdx] ?? (isNumeric ? 0 : "")}
                            onChange={(e) => setResourceCell(rIdx, cIdx, e.target.value)}
                          />
                        </td>
                      );
                    })}
                    <td className="border px-2 py-2">
                      <Button variant="destructive" size="sm" onClick={() => deleteResource(rIdx)} className="gap-2">
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Risks */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Risks</h2>
            <div className="flex gap-2">
              <Button onClick={addRisk} className="gap-2">
                <Plus className="h-4 w-4" />
                Add Risk
              </Button>
            </div>
          </div>
          <div className="w-full overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {risksHeaders.map((h) => (
                    <th key={h} className="border bg-slate-50 text-slate-700 text-xs font-medium px-2 py-2 text-left">
                      {h}
                    </th>
                  ))}
                  <th className="border bg-slate-50 text-slate-700 text-xs font-medium px-2 py-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {risks.map((row, rIdx) => (
                  <tr key={rIdx}>
                    {risksHeaders.map((_, cIdx) => {
                      const isSelectImpact = cIdx === 2;
                      const isSelectProb = cIdx === 3;
                      const isDate = cIdx === 6;

                      if (isSelectImpact) {
                        return (
                          <td key={cIdx} className="border px-2 py-2">
                            <select
                              className="w-full border rounded px-2 py-1 text-sm"
                              value={row?.[cIdx] ?? "M"}
                              onChange={(e) => setRiskCell(rIdx, cIdx, e.target.value)}
                            >
                              {Array.from(IMPACT).map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          </td>
                        );
                      }

                      if (isSelectProb) {
                        return (
                          <td key={cIdx} className="border px-2 py-2">
                            <select
                              className="w-full border rounded px-2 py-1 text-sm"
                              value={row?.[cIdx] ?? "M"}
                              onChange={(e) => setRiskCell(rIdx, cIdx, e.target.value)}
                            >
                              {Array.from(PROB).map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          </td>
                        );
                      }

                      if (isDate) {
                        return (
                          <td key={cIdx} className="border px-2 py-2">
                            <input
                              type="date"
                              className="w-full border rounded px-2 py-1 text-sm"
                              value={row?.[cIdx] ?? ""}
                              onChange={(e) => setRiskCell(rIdx, cIdx, e.target.value)}
                            />
                          </td>
                        );
                      }

                      const isWide = cIdx === 1 || cIdx === 4;
                      return (
                        <td key={cIdx} className="border px-2 py-2">
                          {isWide ? (
                            <textarea
                              className="w-full border rounded px-2 py-1 text-sm"
                              style={{ minWidth: 260, height: 60 }}
                              value={row?.[cIdx] ?? ""}
                              onChange={(e) => setRiskCell(rIdx, cIdx, e.target.value)}
                            />
                          ) : (
                            <input
                              className="w-full border rounded px-2 py-1 text-sm"
                              value={row?.[cIdx] ?? ""}
                              onChange={(e) => setRiskCell(rIdx, cIdx, e.target.value)}
                            />
                          )}
                        </td>
                      );
                    })}
                    <td className="border px-2 py-2">
                      <Button variant="destructive" size="sm" onClick={() => deleteRisk(rIdx)} className="gap-2">
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Financials (drives CapEx/OpEx) */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Financials (Source of Truth for CapEx / OpEx)</h2>
            <div className="flex gap-2">
              <Button onClick={addFinancial} className="gap-2">
                <Plus className="h-4 w-4" />
                Add Row
              </Button>
            </div>
          </div>
          <div className="w-full overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {financialHeaders.map((h) => (
                    <th key={h} className="border bg-slate-50 text-slate-700 text-xs font-medium px-2 py-2 text-left">
                      {h}
                    </th>
                  ))}
                  <th className="border bg-slate-50 text-slate-700 text-xs font-medium px-2 py-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {financialData.map((row, rIdx) => (
                  <tr key={rIdx}>
                    {financialHeaders.map((h, cIdx) => {
                      if (cIdx === 0) {
                        // Category
                        return (
                          <td key={cIdx} className="border px-2 py-2">
                            <select
                              className="w-full border rounded px-2 py-1 text-sm"
                              value={String(row?.[0] ?? "OpEx")}
                              onChange={(e) => setFinancialCell(rIdx, 0, e.target.value)}
                            >
                              <option>OpEx</option>
                              <option>CapEx</option>
                              <option>Revenue</option>
                            </select>
                          </td>
                        );
                      }

                      if (cIdx === 2) {
                        // Amount (number)
                        return (
                          <td key={cIdx} className="border px-2 py-2">
                            <input
                              type="number"
                              className="w-full border rounded px-2 py-1 text-sm text-right"
                              value={row?.[2] ?? 0}
                              onChange={(e) => setFinancialCell(rIdx, 2, e.target.value)}
                            />
                          </td>
                        );
                      }

                      if (cIdx === 5) {
                        // Scenario selector (optional)
                        return (
                          <td key={cIdx} className="border px-2 py-2">
                            <select
                              className="w-full border rounded px-2 py-1 text-sm"
                              value={String(row?.[5] ?? "Both")}
                              onChange={(e) => setFinancialCell(rIdx, 5, e.target.value)}
                            >
                              <option>Both</option>
                              <option>50k</option>
                              <option>200k</option>
                            </select>
                          </td>
                        );
                      }

                      // Other text columns
                      const isWide = cIdx === 1 || cIdx === 4;
                      return (
                        <td key={cIdx} className="border px-2 py-2">
                          {isWide ? (
                            <textarea
                              className="w-full border rounded px-2 py-1 text-sm"
                              style={{ minWidth: 240, height: 60 }}
                              value={row?.[cIdx] ?? ""}
                              onChange={(e) => setFinancialCell(rIdx, cIdx, e.target.value)}
                            />
                          ) : (
                            <input
                              className="w-full border rounded px-2 py-1 text-sm"
                              value={row?.[cIdx] ?? ""}
                              onChange={(e) => setFinancialCell(rIdx, cIdx, e.target.value)}
                            />
                          )}
                        </td>
                      );
                    })}
                    <td className="border px-2 py-2">
                      <Button variant="destructive" size="sm" onClick={() => deleteFinancial(rIdx)} className="gap-2">
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-lg border p-3">
                <div className="text-xs text-slate-500">CapEx Total</div>
                <div className="text-lg font-semibold">
                  ${Number(capexSelected || 0).toLocaleString()} ({scenario})
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-slate-500">OpEx Total</div>
                <div className="text-lg font-semibold">
                  ${Number(opexSelected || 0).toLocaleString()} ({scenario})
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-slate-500">CPU (OpEx / Units)</div>
                <div className="text-lg font-semibold">${cpu.toFixed(2)}</div>
              </div>
            </div>
          </div>
        </section>

        {/* KPIs */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">KPIs</h2>
            <div className="flex gap-2">
              <Button onClick={addKPI} className="gap-2">
                <Plus className="h-4 w-4" />
                Add KPI
              </Button>
            </div>
          </div>
          <div className="w-full overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="border bg-slate-50 text-slate-700 text-xs font-medium px-2 py-2 text-left">Name</th>
                  <th className="border bg-slate-50 text-slate-700 text-xs font-medium px-2 py-2 text-left">Current</th>
                  <th className="border bg-slate-50 text-slate-700 text-xs font-medium px-2 py-2 text-left">Target</th>
                  <th className="border bg-slate-50 text-slate-700 text-xs font-medium px-2 py-2 text-left">Unit</th>
                  <th className="border bg-slate-50 text-slate-700 text-xs font-medium px-2 py-2 text-left">Owner</th>
                  <th className="border bg-slate-50 text-slate-700 text-xs font-medium px-2 py-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {kpis.map((k) => (
                  <tr key={k.id}>
                    <td className="border px-2 py-2">
                      <input
                        className="w-full border rounded px-2 py-1 text-sm"
                        value={k.name}
                        onChange={(e) => setKpiField(k.id, "name", e.target.value)}
                      />
                    </td>
                    <td className="border px-2 py-2">
                      <input
                        type="number"
                        className="w-full border rounded px-2 py-1 text-sm text-right"
                        value={k.current_value}
                        onChange={(e) => setKpiField(k.id, "current_value", e.target.value)}
                      />
                    </td>
                    <td className="border px-2 py-2">
                      <input
                        type="number"
                        className="w-full border rounded px-2 py-1 text-sm text-right"
                        value={k.target_value}
                        onChange={(e) => setKpiField(k.id, "target_value", e.target.value)}
                      />
                    </td>
                    <td className="border px-2 py-2">
                      <input
                        className="w-full border rounded px-2 py-1 text-sm"
                        value={k.unit}
                        onChange={(e) => setKpiField(k.id, "unit", e.target.value)}
                      />
                    </td>
                    <td className="border px-2 py-2">
                      <input
                        className="w-full border rounded px-2 py-1 text-sm"
                        value={k.owner}
                        onChange={(e) => setKpiField(k.id, "owner", e.target.value)}
                      />
                    </td>
                    <td className="border px-2 py-2">
                      <Button variant="destructive" size="sm" onClick={() => deleteKPI(k.id)} className="gap-2">
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Meetings */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Project Meetings</h2>
          </div>
          <div className="w-full overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {[
                    "ID",
                    "Title",
                    "Date",
                    "Time",
                    "Duration",
                    "Attendees",
                    "Location",
                    "Status",
                    "Agenda",
                    "Objectives",
                    "Notes",
                  ].map((h) => (
                    <th key={h} className="border bg-slate-50 text-slate-700 text-xs font-medium px-2 py-2 text-left">
                      {h}
                    </th>
                  ))}
                  <th className="border bg-slate-50 text-slate-700 text-xs font-medium px-2 py-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {meetings.map((row, rIdx) => (
                  <tr key={row?.[0] || rIdx}>
                    {Array.from({ length: 11 }).map((_, cIdx) => {
                      const isDate = cIdx === 2;
                      const isTime = cIdx === 3;
                      const isWide = cIdx === 8 || cIdx === 10;

                      if (isDate) {
                        return (
                          <td key={cIdx} className="border px-2 py-2">
                            <input
                              type="date"
                              className="w-full border rounded px-2 py-1 text-sm"
                              value={row?.[cIdx] ?? ""}
                              onChange={(e) =>
                                setMeetings((prev) => {
                                  const next = [...prev];
                                  next[rIdx][cIdx] = e.target.value;
                                  return next;
                                })
                              }
                            />
                          </td>
                        );
                      }
                      if (isTime) {
                        return (
                          <td key={cIdx} className="border px-2 py-2">
                            <input
                              type="time"
                              className="w-full border rounded px-2 py-1 text-sm"
                              value={row?.[cIdx] ?? ""}
                              onChange={(e) =>
                                setMeetings((prev) => {
                                  const next = [...prev];
                                  next[rIdx][cIdx] = e.target.value;
                                  return next;
                                })
                              }
                            />
                          </td>
                        );
                      }

                      return (
                        <td key={cIdx} className="border px-2 py-2">
                          {isWide ? (
                            <textarea
                              className="w-full border rounded px-2 py-1 text-sm"
                              style={{ minWidth: 260, height: 60 }}
                              value={row?.[cIdx] ?? ""}
                              onChange={(e) =>
                                setMeetings((prev) => {
                                  const next = [...prev];
                                  next[rIdx][cIdx] = e.target.value;
                                  return next;
                                })
                              }
                            />
                          ) : (
                            <input
                              className="w-full border rounded px-2 py-1 text-sm"
                              value={row?.[cIdx] ?? ""}
                              onChange={(e) =>
                                setMeetings((prev) => {
                                  const next = [...prev];
                                  next[rIdx][cIdx] = e.target.value;
                                  return next;
                                })
                              }
                            />
                          )}
                        </td>
                      );
                    })}
                    <td className="border px-2 py-2">
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => openEditMeetingModal(rIdx)}>
                          Edit
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => exportMeetingSummary(rIdx)}>
                          Export
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => setMeetings((prev) => prev.filter((_, i) => i !== rIdx))}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Glossary */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Glossary</h2>
            <div className="flex gap-2">
              <Button
                onClick={() => setGlossary((prev) => [...prev, ["New Term", "Definition"]])}
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                Add Term
              </Button>
            </div>
          </div>
          <div className="w-full overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="border bg-slate-50 text-slate-700 text-xs font-medium px-2 py-2 text-left">Term</th>
                  <th className="border bg-slate-50 text-slate-700 text-xs font-medium px-2 py-2 text-left">Definition</th>
                  <th className="border bg-slate-50 text-slate-700 text-xs font-medium px-2 py-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {glossary.map((row, rIdx) => (
                  <tr key={rIdx}>
                    <td className="border px-2 py-2">
                      <input
                        className="w-full border rounded px-2 py-1 text-sm"
                        value={row?.[0] ?? ""}
                        onChange={(e) =>
                          setGlossary((prev) => {
                            const next = [...prev];
                            next[rIdx][0] = e.target.value;
                            return next;
                          })
                        }
                      />
                    </td>
                    <td className="border px-2 py-2">
                      <textarea
                        className="w-full border rounded px-2 py-1 text-sm"
                        style={{ minWidth: 260, height: 60 }}
                        value={row?.[1] ?? ""}
                        onChange={(e) =>
                          setGlossary((prev) => {
                            const next = [...prev];
                            next[rIdx][1] = e.target.value;
                            return next;
                          })
                        }
                      />
                    </td>
                    <td className="border px-2 py-2">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setGlossary((prev) => prev.filter((_, i) => i !== rIdx))}
                        className="gap-2"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Meeting Modal */}
      {showMeetingModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">{editingMeetingIndex === null ? "Schedule Meeting" : "Edit Meeting"}</h3>
              <Button variant="ghost" onClick={() => setShowMeetingModal(false)}>
                Close
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-500">Title</label>
                <input
                  className="w-full border rounded px-2 py-1"
                  value={meetingForm.title}
                  onChange={(e) => setMeetingForm((s) => ({ ...s, title: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">Date</label>
                <input
                  type="date"
                  className="w-full border rounded px-2 py-1"
                  value={meetingForm.date}
                  onChange={(e) => setMeetingForm((s) => ({ ...s, date: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">Time</label>
                <input
                  type="time"
                  className="w-full border rounded px-2 py-1"
                  value={meetingForm.time}
                  onChange={(e) => setMeetingForm((s) => ({ ...s, time: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">Duration</label>
                <input
                  className="w-full border rounded px-2 py-1"
                  value={meetingForm.duration}
                  onChange={(e) => setMeetingForm((s) => ({ ...s, duration: e.target.value }))}
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs text-slate-500">Attendees</label>
                <input
                  className="w-full border rounded px-2 py-1"
                  value={meetingForm.attendees}
                  onChange={(e) => setMeetingForm((s) => ({ ...s, attendees: e.target.value }))}
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs text-slate-500">Location</label>
                <input
                  className="w-full border rounded px-2 py-1"
                  value={meetingForm.location}
                  onChange={(e) => setMeetingForm((s) => ({ ...s, location: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">Status</label>
                <select
                  className="w-full border rounded px-2 py-1"
                  value={meetingForm.status}
                  onChange={(e) => setMeetingForm((s) => ({ ...s, status: e.target.value }))}
                >
                  <option>Scheduled</option>
                  <option>Completed</option>
                  <option>Cancelled</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="text-xs text-slate-500">Objectives</label>
                <textarea
                  className="w-full border rounded px-2 py-1"
                  rows={2}
                  value={meetingForm.objectives}
                  onChange={(e) => setMeetingForm((s) => ({ ...s, objectives: e.target.value }))}
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs text-slate-500">Agenda</label>
                <textarea
                  className="w-full border rounded px-2 py-1"
                  rows={3}
                  value={meetingForm.agenda}
                  onChange={(e) => setMeetingForm((s) => ({ ...s, agenda: e.target.value }))}
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs text-slate-500">Notes</label>
                <textarea
                  className="w-full border rounded px-2 py-1"
                  rows={4}
                  value={meetingForm.notes}
                  onChange={(e) => setMeetingForm((s) => ({ ...s, notes: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowMeetingModal(false)}>
                Cancel
              </Button>
              <Button onClick={saveMeetingFromModal} className="gap-2">
                <Save className="h-4 w-4" />
                Save Meeting
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
