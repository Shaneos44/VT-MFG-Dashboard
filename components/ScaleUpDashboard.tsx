"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * IMPORTANT
 * - This component persists EVERYTHING to /api/configurations (same name key) so it survives refresh & multi-user.
 * - jsPDF & autoTable are loaded with dynamic import inside the functions to avoid SSR build errors.
 * - Projects table cells wrap by default (whitespace-normal break-words), and each column gets a sensible min width.
 */

/* ----------------------------- Types & helpers ---------------------------- */

type AnyRow = (string | number | boolean | null | undefined)[];

type PlanState = {
  variant: string; // e.g., "Recess N..."
  scenario: "50k" | "200k";
  projects: AnyRow[];
  processes: AnyRow[];
  resources: AnyRow[];
  risks: AnyRow[];
  kpis: {
    id: string;
    name: string;
    unit: string;
    owner: string;
    target_value: number;
    current_value: number;
  }[];
  financials: {
    id: string;
    category: "CapEx" | "OpEx" | "Revenue";
    item: string;
    amount: number;
    type: "Expense" | "Income" | "Both";
    notes?: string;
    scenario: "50k" | "200k" | "Both";
  }[];
  glossary: AnyRow[];
  meetings: AnyRow[];
  scenarios?: {
    ["50k"]?: { unitsPerYear?: number; hoursPerDay?: number; shifts?: number };
    ["200k"]?: { unitsPerYear?: number; hoursPerDay?: number; shifts?: number };
  };
};

const CONFIG_NAME = "ScaleUp-Dashboard-Config";

/** simple debounce */
function useDebouncedCallback<T extends (...args: any[]) => void>(fn: T, delay = 1200) {
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  return useCallback(
    (...args: Parameters<T>) => {
      if (t.current) clearTimeout(t.current);
      t.current = setTimeout(() => fn(...args), delay);
    },
    [fn, delay]
  );
}

/* ----------------------------- Default data ------------------------------ */

const DEFAULT_PLAN: PlanState = {
  variant: "Recess Nanodispensing",
  scenario: "200k",
  projects: [],
  processes: [],
  resources: [],
  risks: [],
  kpis: [
    { id: "KPI-1", name: "Yield", unit: "%", owner: "Ops", target_value: 98, current_value: 92 },
    { id: "KPI-2", name: "Cycle Time", unit: "s", owner: "Manufacturing", target_value: 12, current_value: 14 },
  ],
  financials: [
    {
      id: "FIN-REV-1",
      category: "Revenue",
      item: "Product Sales",
      amount: 2250000,
      type: "Income",
      notes: "Projected annual revenue",
      scenario: "Both",
    },
    {
      id: "FIN-CAP-1",
      category: "CapEx",
      item: "Pick & Place Cell",
      amount: 450000,
      type: "Expense",
      notes: "Robotics, fixtures, install",
      scenario: "200k",
    },
    {
      id: "FIN-OPEX-1",
      category: "OpEx",
      item: "Operators (2 FTE)",
      amount: 180000,
      type: "Expense",
      notes: "Salaries incl. on-costs",
      scenario: "Both",
    },
  ],
  glossary: [],
  meetings: [],
  scenarios: {
    "50k": { unitsPerYear: 50000, hoursPerDay: 8, shifts: 1 },
    "200k": { unitsPerYear: 200000, hoursPerDay: 16, shifts: 2 },
  },
};

/* ------------------------------ Main component --------------------------- */

export default function ScaleUpDashboard() {
  const [activeTab, setActiveTab] = useState<
    "Overview" | "Projects" | "Manufacturing" | "Resources" | "Risks" | "KPIs" | "Financials" | "Glossary" | "Meetings" | "Config"
  >("Overview");

  const [plan, setPlan] = useState<PlanState>(DEFAULT_PLAN);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved">("idle");

  const scenario = plan.scenario;
  const scenarioSettings = plan.scenarios?.[scenario] ?? (scenario === "50k"
    ? { unitsPerYear: 50000, hoursPerDay: 8, shifts: 1 }
    : { unitsPerYear: 200000, hoursPerDay: 16, shifts: 2 });

  /* ------------------------------ Load / Save ------------------------------ */

  const loadConfig = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/configurations", { method: "GET", cache: "no-store" });
      if (!res.ok) throw new Error(`GET /api/configurations failed: ${res.status}`);
      const rows = (await res.json()) as any[];
      // choose the most recent config with our name (if you keep multiple)
      const row = rows.find((r) => r.name === CONFIG_NAME) ?? rows[0];
      if (row?.data) {
        setPlan({ ...DEFAULT_PLAN, ...row.data });
      } else {
        // first use for this user → create a default record immediately
        await saveConfig(DEFAULT_PLAN, true);
        setPlan(DEFAULT_PLAN);
      }
    } catch (e) {
      console.error(e);
      // fallback to default
      setPlan(DEFAULT_PLAN);
    } finally {
      setLoading(false);
    }
  }, []);

  const saveConfig = useCallback(
    async (state: PlanState, isInitial = false) => {
      try {
        setSaving("saving");
        const res = await fetch("/api/configurations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: CONFIG_NAME,
            description: "ScaleUp dashboard configuration",
            data: state,
            modified_by: "dashboard",
          }),
        });
        if (!res.ok) throw new Error(`POST /api/configurations failed: ${res.status}`);
        setSaving("saved");
        if (!isInitial) {
          setTimeout(() => setSaving("idle"), 1200);
        }
      } catch (e) {
        console.error(e);
        setSaving("idle");
      }
    },
    []
  );

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // Debounced autosave on any plan change
  const debouncedSave = useDebouncedCallback((next: PlanState) => saveConfig(next), 1400);
  useEffect(() => {
    if (!loading) debouncedSave(plan);
  }, [plan, debouncedSave, loading]);

  /* ---------------------------- Derived metrics ---------------------------- */

  const { capexTotal, opexTotal } = useMemo(() => {
    // Finance rows drive CapEx & OpEx (scenario-aware)
    const rows = plan.financials;
    const matchesScenario = (rowScenario: "50k" | "200k" | "Both") =>
      rowScenario === "Both" || rowScenario === scenario;

    const capex = rows
      .filter((r) => r.category === "CapEx" && matchesScenario(r.scenario))
      .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

    const opex = rows
      .filter((r) => r.category === "OpEx" && matchesScenario(r.scenario))
      .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

    return { capexTotal: capex, opexTotal: opex };
  }, [plan.financials, scenario]);

  const cpu = useMemo(() => {
    const units = scenarioSettings.unitsPerYear || 0;
    return units > 0 ? opexTotal / units : 0;
  }, [opexTotal, scenarioSettings.unitsPerYear]);

  const kpiAvg = useMemo(() => {
    if (!plan.kpis.length) return 0;
    const acc =
      plan.kpis.reduce((sum, k) => {
        const tv = Number(k.target_value) || 0;
        const cv = Number(k.current_value) || 0;
        return sum + (tv ? (cv / tv) * 100 : 0);
      }, 0) / plan.kpis.length;
    return isFinite(acc) ? acc : 0;
  }, [plan.kpis]);

  const marginPct = useMemo(() => {
    // simple illustrative P&L using revenue rows from financials
    const revenue = plan.financials
      .filter((r) => r.category === "Revenue" && (r.scenario === "Both" || r.scenario === scenario))
      .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    const grossProfit = revenue - (capexTotal + opexTotal);
    return revenue > 0 ? (grossProfit / revenue) * 100 : 0;
  }, [plan.financials, capexTotal, opexTotal, scenario]);

  /* -------------------------------- UI helpers ----------------------------- */

  const updatePlan = <K extends keyof PlanState>(key: K, value: PlanState[K]) =>
    setPlan((p) => ({ ...p, [key]: value }));

  const addProject = () => {
    const id = `PROJ-${String(plan.projects.length + 1).padStart(3, "0")}`;
    const row: AnyRow = [
      id, // 0 id
      "New Project", // 1 name
      "Plan", // 2 type/phase
      "Must", // 3 moscow
      "Project Manager", // 4 owner
      new Date().toISOString().slice(0, 10), // 5 start
      new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString().slice(0, 10), // 6 finish
      0, // 7 dependencies
      "", // 8 deliverables
      "", // 9 goal
      "", // 10 R
      "", // 11 A
      "", // 12 C
      "", // 13 I
      "", // 14 needs
      "", // 15 barriers
      "", // 16 risks
      0, // 17 budget capex
      0, // 18 budget opex
      0, // 19 progress %
      "", // 20 process link
      "No", // 21 critical
      "GREEN", // 22 status
      0, // 23 slack days
      "", // 24 actions
      "", // 25 notes
    ];
    updatePlan("projects", [row, ...plan.projects]);
  };

  const addProcess = () => {
    const row: AnyRow = ["New Process", 10, 1, 12, "Fixture", "Planned", "Ops"]; // Process, Time, Batch, Cycle, Equipment, Status, Owner
    updatePlan("processes", [row, ...plan.processes]);
  };

  const addResource = () => {
    const row: AnyRow = ["New Resource", "Personnel", 1, 0, "Department", ""]; // resource, type, qty, cost, dept, notes
    updatePlan("resources", [row, ...plan.resources]);
  };

  const addRisk = () => {
    const row: AnyRow = [
      `RISK-${plan.risks.length + 1}`,
      "New risk",
      "High",
      "Medium",
      "Mitigation plan",
      "Owner",
      "Open",
      "",
    ];
    updatePlan("risks", [row, ...plan.risks]);
  };

  const addFinancialRow = () => {
    const row: PlanState["financials"][number] = {
      id: `FIN-${Date.now()}`,
      category: "OpEx",
      item: "New cost item",
      amount: 0,
      type: "Expense",
      notes: "",
      scenario: "Both",
    };
    updatePlan("financials", [row, ...plan.financials]);
  };

  const removeFinancialRow = (idx: number) => {
    const next = [...plan.financials];
    next.splice(idx, 1);
    updatePlan("financials", next);
  };

  /* --------------------------- Meetings (modal) ---------------------------- */

  const [showMeetingModal, setShowMeetingModal] = useState(false);
  const [editingMeetingIndex, setEditingMeetingIndex] = useState<number | null>(null);
  const [meetingForm, setMeetingForm] = useState({
    id: "",
    title: "New Meeting",
    date: new Date().toISOString().slice(0, 10),
    time: "10:00",
    duration: "60 min",
    attendees: "Project Team, Stakeholders",
    location: "Conference Room / Zoom",
    status: "Scheduled",
    agenda: "1. Welcome\n2. Updates\n3. Risks & Blockers\n4. Decisions\n5. Actions",
    objectives: "Review progress and align priorities",
    notes: "",
  });

  const openNewMeetingModal = () => {
    setEditingMeetingIndex(null);
    setMeetingForm({
      id: `MEET-${Date.now()}`,
      title: "New Meeting",
      date: new Date().toISOString().slice(0, 10),
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
    const row = plan.meetings[rowIndex] || [];
    setEditingMeetingIndex(rowIndex);
    setMeetingForm({
      id: String(row[0] || `MEET-${Date.now()}`),
      title: String(row[1] || "Meeting"),
      date: String(row[2] || new Date().toISOString().slice(0, 10)),
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
    const rows = [...plan.meetings];
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
    if (editingMeetingIndex === null) {
      rows.unshift(newRow);
    } else {
      rows[editingMeetingIndex] = newRow;
    }
    updatePlan("meetings", rows);
    setShowMeetingModal(false);
    setEditingMeetingIndex(null);
  };

  const exportMeetingSummary = async (rowIndex: number) => {
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]);
    const row = plan.meetings[rowIndex] || [];
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

    (autoTable as any)(doc, {
      startY: y,
      head: [["Section", "Details"]],
      body: [
        ["Objectives", objectives],
        ["Agenda", agenda],
        ["Notes / Minutes", notes],
      ],
      styles: { fontSize: 10, cellPadding: 6, valign: "top" },
      headStyles: { fillColor: [15, 23, 42] },
      columnStyles: { 0: { cellWidth: 140 }, 1: { cellWidth: 380 } },
      margin: { left },
      theme: "striped",
    });

    doc.save(`Meeting_${title.replace(/\s+/g, "_")}_${date}.pdf`);
  };

  /* ------------------------------- Reporting ------------------------------- */

  const generateWeeklyText = () => {
    const lines: string[] = [];
    lines.push(`Variant: ${plan.variant} | Scenario: ${scenario}`);
    lines.push(`CapEx: $${capexTotal.toLocaleString()} | OpEx: $${opexTotal.toLocaleString()} | CPU: $${cpu.toFixed(2)}`);
    lines.push(`KPI Avg: ${kpiAvg.toFixed(1)}% | Margin: ${marginPct.toFixed(1)}%`);
    lines.push("");
    lines.push("Projects:");
    plan.projects.slice(0, 20).forEach((p) => {
      lines.push(
        `• ${String(p?.[1] || "")} — Owner: ${String(p?.[4] || "")} — Finish ${String(p?.[6] || "")} — Status ${
          String(p?.[22] || "")
        } — ${Number(p?.[19] || 0)}%`
      );
    });
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Weekly_Summary_${plan.variant.replace(/\s+/g, "_")}_${scenario}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const generateCEOReportPDF = async () => {
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]);

    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const left = 40;
    let y = 56;

    const revenue = plan.financials
      .filter((r) => r.category === "Revenue" && (r.scenario === "Both" || r.scenario === scenario))
      .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

    const grossProfit = revenue - (capexTotal + opexTotal);
    const margin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

    doc.setFontSize(18);
    doc.text(`CEO Executive Summary — ${plan.variant} / ${scenario}`, left, y);
    y += 20;
    doc.setFontSize(11);
    doc.text(`Generated: ${new Date().toLocaleString()}`, left, y);
    y += 18;

    (autoTable as any)(doc, {
      startY: y,
      head: [["Metric", "Value"]],
      body: [
        ["Target Output (units/yr)", `${scenarioSettings.unitsPerYear?.toLocaleString() ?? ""}`],
        ["CapEx Total (USD)", `$${capexTotal.toLocaleString()}`],
        ["OpEx Total (USD)", `$${opexTotal.toLocaleString()}`],
        ["Cost / Unit (OpEx only)", `$${cpu.toFixed(2)}`],
        ["Revenue (USD, est.)", `$${revenue.toLocaleString()}`],
        ["Gross Profit (USD, est.)", `$${grossProfit.toLocaleString()}`],
        ["Profit Margin (%)", `${margin.toFixed(1)}%`],
        [
          "Projects — Total / Completed / On-Track / At-Risk",
          `${plan.projects.length} / ${plan.projects.filter((p) => (Number(p?.[19]) || 0) >= 100).length} / ${
            plan.projects.filter((p) => String(p?.[22] || "").toUpperCase() === "GREEN").length
          } / ${
            plan.projects.filter((p) => {
              const s = String(p?.[22] || "").toUpperCase();
              return s === "RED" || s === "AMBER";
            }).length
          }`,
        ],
        ["KPIs — Avg Performance", `${kpiAvg.toFixed(1)}%`],
        ["Risks — Total", `${plan.risks.length}`],
      ],
      styles: { fontSize: 10, cellPadding: 6, valign: "top" },
      headStyles: { fillColor: [15, 23, 42] },
      columnStyles: { 0: { cellWidth: 260 }, 1: { cellWidth: 260 } },
      margin: { left },
      theme: "grid",
    });

    let ay = (doc as any).lastAutoTable.finalY + 24;

    (autoTable as any)(doc, {
      startY: ay,
      head: [["KPI", "Current", "Target", "Δ Var (%)", "Owner"]],
      body: plan.kpis.map((k) => [
        k.name,
        `${k.current_value} ${k.unit}`,
        `${k.target_value} ${k.unit}`,
        k.target_value ? (((k.current_value - k.target_value) / k.target_value) * 100).toFixed(1) : "0.0",
        k.owner,
      ]),
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: [15, 23, 42] },
      columnStyles: { 0: { cellWidth: 220 }, 1: { cellWidth: 100 }, 2: { cellWidth: 100 }, 3: { cellWidth: 80 }, 4: { cellWidth: 120 } },
      margin: { left },
      theme: "striped",
      didDrawPage: (data: any) => {
        doc.setFontSize(12);
        doc.text("KPI Dashboard", left, data.settings.startY - 8);
      },
    });

    const fileName = `CEO_Summary_${plan.variant.replace(/\s+/g, "_")}_${scenario}_${new Date()
      .toISOString()
      .slice(0, 10)}.pdf`;
    doc.save(fileName);
  };

  /* --------------------------------- Render -------------------------------- */

  if (loading) {
    return (
      <div className="p-6 text-slate-600">
        Loading…
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <h1 className="text-2xl font-semibold">Scale-Up Dashboard</h1>

        <div className="ml-auto flex flex-wrap gap-2">
          <select
            className="px-3 py-2 rounded border text-sm"
            value={plan.variant}
            onChange={(e) => updatePlan("variant", e.target.value)}
          >
            <option>Recess Nanodispensing</option>
            <option>Hot-Fill Syringe</option>
            <option>Catheter Assembly</option>
          </select>

          <select
            className="px-3 py-2 rounded border text-sm"
            value={plan.scenario}
            onChange={(e) => updatePlan("scenario", e.target.value as PlanState["scenario"])}
          >
            <option value="50k">50k</option>
            <option value="200k">200k</option>
          </select>

          <button
            onClick={() => saveConfig(plan)}
            className="inline-flex items-center gap-2 rounded bg-slate-900 text-white px-3 py-2 text-sm"
            title="Force save now"
          >
            <span className="material-symbols-outlined text-base">save</span>
            {saving === "saving" ? "Saving…" : saving === "saved" ? "Saved" : "Save Now"}
          </button>

          <button
            onClick={generateWeeklyText}
            className="rounded border px-3 py-2 text-sm"
            title="Download a TXT weekly summary"
          >
            Weekly Report (TXT)
          </button>

          <button
            onClick={generateCEOReportPDF}
            className="rounded border px-3 py-2 text-sm"
            title="Download a CEO-ready PDF snapshot"
          >
            CEO Summary (PDF)
          </button>

          <button onClick={openNewMeetingModal} className="rounded border px-3 py-2 text-sm">
            New Meeting
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid md:grid-cols-3 xl:grid-cols-6 gap-3 mb-4">
        <StatCard title="Target Output" value={(scenarioSettings.unitsPerYear || 0).toLocaleString()} suffix="units/year" />
        <StatCard title="CapEx / OpEx" value={`$${capexTotal.toLocaleString()} / $${opexTotal.toLocaleString()}`} />
        <StatCard title="CPU (OpEx only)" value={`$${cpu.toFixed(2)}`} />
        <StatCard title="Margin (est.)" value={`${marginPct.toFixed(1)}%`} />
        <StatCard
          title="Projects"
          value={`${plan.projects.length} total • ${
            plan.projects.filter((p) => String(p?.[22] || "").toUpperCase() === "GREEN").length
          } on track`}
        />
        <StatCard title="KPI Avg" value={`${kpiAvg.toFixed(1)}%`} />
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b mb-4">
        {(
          [
            "Overview",
            "Projects",
            "Manufacturing",
            "Resources",
            "Risks",
            "KPIs",
            "Financials",
            "Glossary",
            "Meetings",
            "Config",
          ] as typeof activeTab[]
        ).map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-3 py-2 text-sm rounded-t ${
              activeTab === t ? "bg-slate-900 text-white" : "bg-slate-100 hover:bg-slate-200"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Panels */}
      {activeTab === "Overview" && (
        <div className="grid xl:grid-cols-2 gap-4">
          {/* Simple high-level charts substitute with totals */}
          <div className="rounded border p-4">
            <h3 className="font-medium mb-3">Performance Snapshot</h3>
            <ul className="space-y-2 text-sm">
              <li>Average KPI Performance: <b>{kpiAvg.toFixed(1)}%</b></li>
              <li>CPU (OpEx only): <b>${cpu.toFixed(2)}</b></li>
              <li>Projects on track: <b>{plan.projects.filter((p) => String(p?.[22] || "").toUpperCase() === "GREEN").length}</b></li>
              <li>Risks open: <b>{plan.risks.length}</b></li>
            </ul>
          </div>

          <div className="rounded border p-4">
            <h3 className="font-medium mb-3">Financial Snapshot</h3>
            <ul className="space-y-2 text-sm">
              <li>CapEx: <b>${capexTotal.toLocaleString()}</b></li>
              <li>OpEx: <b>${opexTotal.toLocaleString()}</b></li>
              <li>Margin (est.): <b>{marginPct.toFixed(1)}%</b></li>
            </ul>
          </div>
        </div>
      )}

      {activeTab === "Projects" && (
        <section className="mt-2">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-semibold">Projects</h3>
            <button onClick={addProject} className="rounded bg-slate-900 text-white px-3 py-2 text-sm">+ Add Project</button>
          </div>

          <div className="overflow-x-auto rounded border">
            <table className="min-w-[1200px] w-full text-sm">
              <thead className="bg-slate-50 text-xs">
                <tr className="[&>th]:px-2 [&>th]:py-2 [&>th]:text-left">
                  {[
                    "ID","Name","Type/Phase","MoSCoW","Owner","Start","Finish","Deps","Deliverables","Goal",
                    "R","A","C","I","Needs","Barriers","Risks","Budget CapEx","Budget OpEx","Progress %","Process Link","Critical","Status","Slack Days","Actions","Notes"
                  ].map((h) => (
                    <th key={h} className="whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {plan.projects.map((row, idx) => (
                  <tr key={String(row?.[0] ?? idx)} className="[&>td]:px-2 [&>td]:py-2 border-t align-top">
                    {row.map((cell, cIdx) => {
                      const isNumber = typeof cell === "number";
                      const inputType = cIdx === 5 || cIdx === 6 ? "date" : isNumber ? "number" : "text";
                      const minW =
                        cIdx === 1 ? "min-w-[220px]" :
                        cIdx === 8 || cIdx === 9 || cIdx === 14 || cIdx === 15 || cIdx === 16 || cIdx === 24 || cIdx === 25 ? "min-w-[260px]" :
                        "min-w-[110px]";
                      return (
                        <td key={cIdx} className="whitespace-normal break-words">
                          <input
                            className={`w-full border rounded px-2 py-1 text-sm ${minW}`}
                            type={inputType}
                            value={String(cell ?? "")}
                            onChange={(e) => {
                              const next = [...plan.projects];
                              (next[idx] = [...next[idx]])[cIdx] =
                                inputType === "number" ? Number(e.target.value) : e.target.value;
                              updatePlan("projects", next);
                            }}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === "Manufacturing" && (
        <section className="mt-2">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-semibold">Processes</h3>
            <button onClick={addProcess} className="rounded bg-slate-900 text-white px-3 py-2 text-sm">+ Add Process</button>
          </div>
          <SimpleGrid
            headers={["Process","Time (min)","Batch Size","Cycle (s)","Equipment","Status","Owner"]}
            rows={plan.processes}
            onChange={(rows) => updatePlan("processes", rows)}
          />
        </section>
      )}

      {activeTab === "Resources" && (
        <section className="mt-2">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-semibold">Resources</h3>
            <button onClick={addResource} className="rounded bg-slate-900 text-white px-3 py-2 text-sm">+ Add Resource</button>
          </div>
          <SimpleGrid
            headers={["Resource","Type","Quantity","Cost","Department","Notes"]}
            rows={plan.resources}
            onChange={(rows) => updatePlan("resources", rows)}
          />
        </section>
      )}

      {activeTab === "Risks" && (
        <section className="mt-2">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-semibold">Risks</h3>
            <button onClick={addRisk} className="rounded bg-slate-900 text-white px-3 py-2 text-sm">+ Add Risk</button>
          </div>
          <SimpleGrid
            headers={["ID","Risk","Impact","Prob","Mitigation","Owner","Status","Notes"]}
            rows={plan.risks}
            onChange={(rows) => updatePlan("risks", rows)}
          />
        </section>
      )}

      {activeTab === "KPIs" && (
        <section className="mt-2">
          <h3 className="font-semibold mb-2">KPIs</h3>
          <div className="rounded border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs">
                <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left">
                  <th>ID</th><th>Name</th><th>Unit</th><th>Owner</th><th>Target</th><th>Current</th>
                </tr>
              </thead>
              <tbody>
                {plan.kpis.map((k, i) => (
                  <tr key={k.id} className="border-t [&>td]:px-3 [&>td]:py-2">
                    <td className="text-slate-500">{k.id}</td>
                    <td><input className="w-full border rounded px-2 py-1" value={k.name} onChange={(e)=> {
                      const next=[...plan.kpis]; next[i]={...next[i], name:e.target.value}; updatePlan("kpis", next);
                    }}/></td>
                    <td><input className="w-full border rounded px-2 py-1" value={k.unit} onChange={(e)=> {
                      const next=[...plan.kpis]; next[i]={...next[i], unit:e.target.value}; updatePlan("kpis", next);
                    }}/></td>
                    <td><input className="w-full border rounded px-2 py-1" value={k.owner} onChange={(e)=> {
                      const next=[...plan.kpis]; next[i]={...next[i], owner:e.target.value}; updatePlan("kpis", next);
                    }}/></td>
                    <td><input type="number" className="w-full border rounded px-2 py-1" value={k.target_value} onChange={(e)=> {
                      const next=[...plan.kpis]; next[i]={...next[i], target_value:Number(e.target.value)}; updatePlan("kpis", next);
                    }}/></td>
                    <td><input type="number" className="w-full border rounded px-2 py-1" value={k.current_value} onChange={(e)=> {
                      const next=[...plan.kpis]; next[i]={...next[i], current_value:Number(e.target.value)}; updatePlan("kpis", next);
                    }}/></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === "Financials" && (
        <section className="mt-2">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-semibold">Financials (Source of Truth)</h3>
            <button onClick={addFinancialRow} className="rounded bg-slate-900 text-white px-3 py-2 text-sm">+ Add Row</button>
          </div>

          <div className="rounded border overflow-x-auto">
            <table className="w-full min-w-[1000px] text-sm">
              <thead className="bg-slate-50 text-xs">
                <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left">
                  <th>Category</th>
                  <th>Item</th>
                  <th>Amount</th>
                  <th>Type</th>
                  <th>Notes</th>
                  <th>Scenario</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {plan.financials.map((r, i) => (
                  <tr key={r.id} className="border-t [&>td]:px-3 [&>td]:py-2 align-top">
                    <td>
                      <select
                        className="border rounded px-2 py-1"
                        value={r.category}
                        onChange={(e) => {
                          const next = [...plan.financials];
                          next[i] = { ...next[i], category: e.target.value as any };
                          updatePlan("financials", next);
                        }}
                      >
                        <option value="Revenue">Revenue</option>
                        <option value="CapEx">CapEx</option>
                        <option value="OpEx">OpEx</option>
                      </select>
                    </td>
                    <td>
                      <textarea
                        className="w-full border rounded px-2 py-1 min-w-[240px] h-[36px]"
                        value={r.item}
                        onChange={(e) => {
                          const next = [...plan.financials];
                          next[i] = { ...next[i], item: e.target.value };
                          updatePlan("financials", next);
                        }}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        className="w-[140px] border rounded px-2 py-1"
                        value={r.amount}
                        onChange={(e) => {
                          const next = [...plan.financials];
                          next[i] = { ...next[i], amount: Number(e.target.value) };
                          updatePlan("financials", next);
                        }}
                      />
                    </td>
                    <td>
                      <select
                        className="border rounded px-2 py-1"
                        value={r.type}
                        onChange={(e) => {
                          const next = [...plan.financials];
                          next[i] = { ...next[i], type: e.target.value as any };
                          updatePlan("financials", next);
                        }}
                      >
                        <option value="Expense">Expense</option>
                        <option value="Income">Income</option>
                        <option value="Both">Both</option>
                      </select>
                    </td>
                    <td>
                      <textarea
                        className="w-full border rounded px-2 py-1 min-w-[260px] h-[36px]"
                        value={r.notes || ""}
                        onChange={(e) => {
                          const next = [...plan.financials];
                          next[i] = { ...next[i], notes: e.target.value };
                          updatePlan("financials", next);
                        }}
                      />
                    </td>
                    <td>
                      <select
                        className="border rounded px-2 py-1"
                        value={r.scenario}
                        onChange={(e) => {
                          const next = [...plan.financials];
                          next[i] = { ...next[i], scenario: e.target.value as any };
                          updatePlan("financials", next);
                        }}
                      >
                        <option value="Both">Both</option>
                        <option value="50k">50k</option>
                        <option value="200k">200k</option>
                      </select>
                    </td>
                    <td>
                      <button
                        onClick={() => removeFinancialRow(i)}
                        className="text-red-600 border rounded px-2 py-1"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === "Glossary" && (
        <section className="mt-2">
          <h3 className="font-semibold mb-2">Glossary</h3>
          <SimpleGrid
            headers={["Term","Definition"]}
            rows={plan.glossary}
            onChange={(rows) => updatePlan("glossary", rows)}
          />
        </section>
      )}

      {activeTab === "Meetings" && (
        <section className="mt-2">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-semibold">Meetings</h3>
            <button onClick={openNewMeetingModal} className="rounded bg-slate-900 text-white px-3 py-2 text-sm">
              + Schedule Meeting
            </button>
          </div>

          <div className="rounded border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs">
                <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left">
                  <th>ID</th><th>Title</th><th>Date</th><th>Time</th><th>Duration</th><th>Attendees</th><th>Location</th><th>Status</th>
                  <th>Agenda</th><th>Objectives</th><th>Notes</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {plan.meetings.map((m, i) => (
                  <tr key={String(m?.[0] ?? i)} className="border-t [&>td]:px-3 [&>td]:py-2 align-top">
                    {m.slice(0, 11).map((cell: any, cIdx: number) => (
                      <td key={cIdx} className="whitespace-normal break-words">
                        <div className={cIdx >= 8 ? "min-w-[240px]" : "min-w-[120px]"}>{String(cell ?? "")}</div>
                      </td>
                    ))}
                    <td className="space-x-2">
                      <button className="border rounded px-2 py-1" onClick={() => openEditMeetingModal(i)}>Edit</button>
                      <button className="border rounded px-2 py-1" onClick={() => exportMeetingSummary(i)}>Export PDF</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Modal */}
          {showMeetingModal && (
            <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded shadow-xl max-w-3xl w-full">
                <div className="p-4 border-b flex justify-between items-center">
                  <h4 className="font-semibold">{editingMeetingIndex === null ? "Schedule Meeting" : "Edit Meeting"}</h4>
                  <button onClick={() => setShowMeetingModal(false)} className="text-slate-500">✕</button>
                </div>
                <div className="p-4 grid md:grid-cols-2 gap-3">
                  {[
                    ["Title","title"],["Date","date"],["Time","time"],["Duration","duration"],
                    ["Attendees","attendees"],["Location","location"],["Status","status"],
                  ].map(([label,key]) => (
                    <label key={key} className="text-sm space-y-1">
                      <span className="block text-slate-600">{label}</span>
                      <input
                        className="w-full border rounded px-2 py-1"
                        type={key==="date"?"date":"text"}
                        value={(meetingForm as any)[key]}
                        onChange={(e)=> setMeetingForm((f)=> ({...f,[key]: e.target.value}))}
                      />
                    </label>
                  ))}
                  <label className="md:col-span-2 text-sm space-y-1">
                    <span className="block text-slate-600">Agenda</span>
                    <textarea
                      className="w-full border rounded px-2 py-1 h-28"
                      value={meetingForm.agenda}
                      onChange={(e)=> setMeetingForm((f)=> ({...f, agenda: e.target.value}))}
                    />
                  </label>
                  <label className="md:col-span-2 text-sm space-y-1">
                    <span className="block text-slate-600">Objectives</span>
                    <textarea
                      className="w-full border rounded px-2 py-1 h-20"
                      value={meetingForm.objectives}
                      onChange={(e)=> setMeetingForm((f)=> ({...f, objectives: e.target.value}))}
                    />
                  </label>
                  <label className="md:col-span-2 text-sm space-y-1">
                    <span className="block text-slate-600">Notes</span>
                    <textarea
                      className="w-full border rounded px-2 py-1 h-28"
                      value={meetingForm.notes}
                      onChange={(e)=> setMeetingForm((f)=> ({...f, notes: e.target.value}))}
                    />
                  </label>
                </div>
                <div className="p-4 border-t flex justify-end gap-2">
                  <button onClick={()=> setShowMeetingModal(false)} className="border rounded px-3 py-2">Cancel</button>
                  <button onClick={saveMeetingFromModal} className="bg-slate-900 text-white rounded px-3 py-2">
                    {editingMeetingIndex === null ? "Create" : "Save"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {activeTab === "Config" && (
        <section className="mt-2">
          <h3 className="font-semibold mb-2">Config</h3>
          <div className="grid md:grid-cols-3 gap-3">
            <label className="text-sm space-y-1">
              <span className="block text-slate-600">Variant Name</span>
              <input className="border rounded px-2 py-1 w-full" value={plan.variant} onChange={(e)=> updatePlan("variant", e.target.value)} />
            </label>
            <label className="text-sm space-y-1">
              <span className="block text-slate-600">Units / Year ({scenario})</span>
              <input
                type="number"
                className="border rounded px-2 py-1 w-full"
                value={scenarioSettings.unitsPerYear ?? 0}
                onChange={(e) => {
                  const next = { ...(plan.scenarios || {}) };
                  next[scenario] = { ...(next[scenario] || {}), unitsPerYear: Number(e.target.value) };
                  updatePlan("scenarios", next as any);
                }}
              />
            </label>
            <label className="text-sm space-y-1">
              <span className="block text-slate-600">Shifts ({scenario})</span>
              <input
                type="number"
                className="border rounded px-2 py-1 w-full"
                value={scenarioSettings.shifts ?? 1}
                onChange={(e) => {
                  const next = { ...(plan.scenarios || {}) };
                  next[scenario] = { ...(next[scenario] || {}), shifts: Number(e.target.value) };
                  updatePlan("scenarios", next as any);
                }}
              />
            </label>
          </div>
        </section>
      )}
    </div>
  );
}

/* -------------------------------- Subcomponents ------------------------------- */

function StatCard({ title, value, suffix }: { title: string; value: string; suffix?: string }) {
  return (
    <div className="rounded border p-3">
      <div className="text-xs text-slate-500">{title}</div>
      <div className="text-lg font-semibold">{value} {suffix ? <span className="text-slate-500 font-normal text-sm">{suffix}</span> : null}</div>
    </div>
  );
}

function SimpleGrid({
  headers,
  rows,
  onChange,
}: {
  headers: string[];
  rows: AnyRow[];
  onChange: (rows: AnyRow[]) => void;
}) {
  return (
    <div className="rounded border overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs">
          <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left">
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t align-top">
              {headers.map((_, j) => (
                <td key={j} className="px-3 py-2">
                  <input
                    className={`w-full border rounded px-2 py-1 text-sm ${j === 0 ? "min-w-[200px]" : "min-w-[120px]"} whitespace-normal break-words`}
                    value={String(r?.[j] ?? "")}
                    onChange={(e) => {
                      const next = [...rows];
                      (next[i] = [...(next[i] || [])])[j] = e.target.value;
                      onChange(next);
                    }}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
