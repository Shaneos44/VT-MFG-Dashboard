"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, FileText, CalendarPlus2, Loader2, Download } from "lucide-react";
import { generateWeeklySummary } from "@/lib/utils";
import { clone, SEED_PLAN } from "@/lib/constants";

/**
 * ScaleUpDashboard
 * - Fixes project-table formatting (wide columns, wrapping, resizable headers, horizontal scroll)
 * - Restores Meetings tab with modal to schedule + agenda/notes + export summary
 * - Ensures every tab has Add/Delete row controls
 * - Debounced autosave of ALL tabs to /api/configurations (Supabase) for the signed-in user
 * - Weekly & Comprehensive PDF reports with proper page margins/wrapping
 */

type Variant = "Recess Nanodispensing" | "Dipcoating";
type ScenarioKey = "50k" | "200k";

interface KPI {
  id: string;
  scenario_id: string;
  name: string;
  target_value: number;
  current_value: number;
  unit: string;
  owner: string;
  created_at: string;
  updated_at: string;
}

interface CostData {
  id: string;
  scenario_id: string;
  capex: number;
  opex: number;
  cost_per_unit: number;
  created_at: string;
  updated_at: string;
}

interface WeeklySummary {
  week: string;
  projectsCompleted: number;
  projectsOnTrack: number;
  projectsAtRisk: number;
  keyMilestones: string[];
  criticalIssues: string[];
  nextWeekPriorities: string[];
  kpiSummary: {
    name: string;
    current: number;
    target: number;
    trend: "up" | "down" | "stable";
  }[];
}

const PRODUCT_VARIANTS: Variant[] = ["Recess Nanodispensing", "Dipcoating"];

const DEFAULT_KPIS: KPI[] = [
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
  {
    id: "kpi-3",
    scenario_id: "default-scenario",
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
    scenario_id: "default-scenario",
    name: "Time to Market",
    target_value: 180,
    current_value: 195,
    unit: "days",
    owner: "Project Manager",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const COLUMN_MIN = 88; // px
const COLUMN_MAX = 420; // px

type ColumnKey =
  | "id"
  | "name"
  | "type"
  | "moscow"
  | "owner"
  | "start"
  | "finish"
  | "dependencies"
  | "deliverables"
  | "goal"
  | "r"
  | "a"
  | "c"
  | "i"
  | "needs"
  | "barriers"
  | "risks"
  | "budget_capex"
  | "budget_opex"
  | "percent_complete"
  | "process_link";

const DEFAULT_PROJECT_COLUMN_WIDTHS: Record<ColumnKey, number> = {
  id: 120,
  name: 220,
  type: 140,
  moscow: 110,
  owner: 160,
  start: 140,
  finish: 140,
  dependencies: 120,
  deliverables: 260,
  goal: 260,
  r: 56,
  a: 56,
  c: 56,
  i: 56,
  needs: 200,
  barriers: 200,
  risks: 200,
  budget_capex: 140,
  budget_opex: 140,
  percent_complete: 140,
  process_link: 180,
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function useDebouncedCallback<T extends any[]>(fn: (...args: T) => void, delay = 1200) {
  const ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cb = useCallback(
    (...args: T) => {
      if (ref.current) clearTimeout(ref.current);
      ref.current = setTimeout(() => {
        fn(...args);
      }, delay);
    },
    [fn, delay],
  );
  return cb;
}

export default function ScaleUpDashboard() {
  // Tabs
  const [tab, setTab] = useState<
    "overview" | "projects" | "manufacturing" | "resources" | "risks" | "meetings" | "kpis" | "financials" | "glossary" | "config"
  >("projects");

  // Core state
  const [scenario, setScenario] = useState<ScenarioKey>("50k");
  const [variant, setVariant] = useState<Variant>("Recess Nanodispensing");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Data
  const [plan, setPlan] = useState(() => {
    const initial = clone(SEED_PLAN);
    if (!initial.scenarios) {
      initial.scenarios = {
        "50k": { unitsPerYear: 50000, hoursPerDay: 8, shifts: 1 },
        "200k": { unitsPerYear: 200000, hoursPerDay: 16, shifts: 2 },
      };
    }
    return initial;
  });

  const [kpis, setKpis] = useState<KPI[]>(DEFAULT_KPIS);
  const [costData, setCostData] = useState<CostData[]>([]);
  const [columnWidths, setColumnWidths] = useState<Record<ColumnKey, number>>(DEFAULT_PROJECT_COLUMN_WIDTHS);

  // Meetings modal
  const [showMeetingModal, setShowMeetingModal] = useState(false);
  const [meetingForm, setMeetingForm] = useState({
    title: "",
    date: new Date().toISOString().split("T")[0],
    time: "10:00",
    duration: "60",
    attendees: "",
    location: "",
    agenda: "",
    notes: "",
    status: "Scheduled",
  });

  // Derived - current "product" container
  const current = useMemo(() => {
    const base = (plan.products && plan.products[scenario]) || {};
    return {
      projects: (base.projects || []) as any[][],
      manufacturing: (base.manufacturing || []) as any[][],
      resources: (base.resources || []) as any[][],
      risks: (base.risks || []) as any[][],
      meetings: (base.meetings || []) as any[][],
      financials: (base.financials || []) as any[][],
      glossary: (base.glossary || []) as any[][],
      launch: base.launch || {
        fiftyK: new Date().toISOString(),
        twoHundredK: new Date().toISOString(),
      },
    };
  }, [plan, scenario]);

  // ---------- Load from DB once ----------
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const resp = await fetch("/api/configurations");
        if (!resp.ok) throw new Error(`GET /api/configurations ${resp.status}`);
        const configs = await resp.json();
        const cfg =
          configs.find((c: any) => c.name === "ScaleUp-Dashboard-Config") ||
          configs
            .filter((c: any) => c.name?.includes("ScaleUp"))
            .sort((a: any, b: any) => +new Date(b.updated_at) - +new Date(a.updated_at))[0];

        if (cfg?.data) {
          const d = cfg.data;
          if (d.plan) setPlan(d.plan);
          if (d.scenario) setScenario(d.scenario);
          if (d.variant) setVariant(d.variant);
          if (Array.isArray(d.kpis)) setKpis(d.kpis);
          if (d.columnWidths) setColumnWidths(d.columnWidths);
        }
      } catch (e: any) {
        console.error(e);
        setError("Failed to load data. Using defaults.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ---------- Debounced autosave for everything ----------
  const debouncedSave = useDebouncedCallback(async (payload: any) => {
    setSaving(true);
    try {
      const resp = await fetch("/api/configurations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "ScaleUp-Dashboard-Config",
          description: "ScaleUp Dashboard Configuration",
          data: payload,
          modified_by: "dashboard",
          upsert: true,
        }),
      });
      if (!resp.ok) {
        const e = await resp.json().catch(() => ({}));
        throw new Error(e?.error || `POST /api/configurations ${resp.status}`);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  }, 1200);

  useEffect(() => {
    if (loading) return;
    debouncedSave({ plan, scenario, variant, kpis, columnWidths, lastSaved: new Date().toISOString() });
  }, [plan, scenario, variant, kpis, columnWidths, loading, debouncedSave]);

  // ---------- Helpers ----------
  const updateProduct = useCallback(
    (updater: (draft: any) => void) => {
      setPlan((prev: any) => {
        const next = clone(prev);
        if (!next.products) next.products = {};
        if (!next.products[scenario]) next.products[scenario] = {};
        updater(next.products[scenario]);
        return next;
      });
    },
    [scenario],
  );

  // ---------- Projects table (resizable + wrapping) ----------
  const resizingRef = useRef<{ key: ColumnKey; startX: number; startW: number } | null>(null);

  const onResizeStart = (e: React.MouseEvent, key: ColumnKey) => {
    const th = (e.currentTarget as HTMLElement).parentElement as HTMLElement;
    const startW = th?.offsetWidth || columnWidths[key];
    resizingRef.current = { key, startX: e.clientX, startW };
    document.addEventListener("mousemove", onResizing as any);
    document.addEventListener("mouseup", onResizeEnd as any);
  };
  const onResizing = (e: MouseEvent) => {
    const r = resizingRef.current;
    if (!r) return;
    const delta = e.clientX - r.startX;
    const newW = clamp(r.startW + delta, COLUMN_MIN, COLUMN_MAX);
    setColumnWidths((w) => ({ ...w, [r.key]: newW }));
  };
  const onResizeEnd = () => {
    resizingRef.current = null;
    document.removeEventListener("mousemove", onResizing as any);
    document.removeEventListener("mouseup", onResizeEnd as any);
  };

  const projectCols: { key: ColumnKey; label: string; type: "text" | "date" | "number" | "textarea" | "short"; wrap?: boolean }[] =
    useMemo(
      () => [
        { key: "id", label: "id", type: "text" },
        { key: "name", label: "name", type: "text", wrap: true },
        { key: "type", label: "type", type: "text" },
        { key: "moscow", label: "moscow", type: "text" },
        { key: "owner", label: "owner", type: "text" },
        { key: "start", label: "start", type: "date" },
        { key: "finish", label: "finish", type: "date" },
        { key: "dependencies", label: "dependencies", type: "number" },
        { key: "deliverables", label: "deliverables", type: "textarea", wrap: true },
        { key: "goal", label: "goal", type: "textarea", wrap: true },
        { key: "r", label: "R", type: "short" },
        { key: "a", label: "A", type: "short" },
        { key: "c", label: "C", type: "short" },
        { key: "i", label: "I", type: "short" },
        { key: "needs", label: "needs", type: "textarea", wrap: true },
        { key: "barriers", label: "barriers", type: "textarea", wrap: true },
        { key: "risks", label: "risks", type: "textarea", wrap: true },
        { key: "budget_capex", label: "budget_capex", type: "number" },
        { key: "budget_opex", label: "budget_opex", type: "number" },
        { key: "percent_complete", label: "percent_complete", type: "number" },
        { key: "process_link", label: "process_link", type: "text", wrap: true },
      ],
      [],
    );

  const addProject = () => {
    const row: any[] = [
      `PROJ-${Date.now()}`,
      "New Project",
      "Planning",
      "Must",
      "Project Manager",
      new Date().toISOString().split("T")[0],
      new Date(Date.now() + 14 * 864e5).toISOString().split("T")[0],
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
    ];
    updateProduct((p) => {
      p.projects = [...(p.projects || []), row];
    });
  };

  const deleteSelectedProjects = () => {
    const ids = Object.keys(selectedRows.current);
    if (ids.length === 0) return;
    updateProduct((p) => {
      p.projects = (p.projects || []).filter((r: any[]) => !selectedRows.current[r[0]]);
    });
    selectedRows.current = {};
  };

  const setProjectCell = (rowIndex: number, colIndex: number, value: any) => {
    updateProduct((p) => {
      const next = (p.projects || []).map((r: any[], i: number) => (i === rowIndex ? r.map((c: any, j: number) => (j === colIndex ? value : c)) : r));
      p.projects = next;
    });
  };

  const autoGrow = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  const selectedRows = useRef<Record<string, boolean>>({});

  // ---------- Meetings ----------
  const saveMeetingFromModal = () => {
    const row = [
      `MEET-${Date.now()}`,
      meetingForm.title || "New Meeting",
      meetingForm.date,
      meetingForm.time,
      meetingForm.duration,
      meetingForm.attendees,
      meetingForm.location,
      meetingForm.agenda,
      meetingForm.notes,
      meetingForm.status,
    ];
    updateProduct((p) => {
      p.meetings = [...(p.meetings || []), row];
    });
    setShowMeetingModal(false);
    setMeetingForm({
      title: "",
      date: new Date().toISOString().split("T")[0],
      time: "10:00",
      duration: "60",
      attendees: "",
      location: "",
      agenda: "",
      notes: "",
      status: "Scheduled",
    });
  };

  const exportMeetingSummary = async (row: any[]) => {
    const [id, title, date, time, duration, attendees, location, agenda, notes, status] = row;
    const docModule = await import("jspdf");
    const autoTable = await import("jspdf-autotable");
    const jsPDF = docModule.jsPDF;

    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 40;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("Meeting Summary", margin, 50);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`ID: ${id}`, margin, 70);
    doc.text(`Title: ${title}`, margin, 86);
    doc.text(`When: ${date} ${time} (${duration} min)`, margin, 102);
    doc.text(`Status: ${status}`, margin, 118);
    doc.text(`Location: ${location}`, margin, 134);
    doc.text(`Attendees: ${attendees}`, margin, 150);

    (autoTable as any).default(doc, {
      startY: 175,
      margin: { left: margin, right: margin },
      theme: "grid",
      headStyles: { fillColor: [17, 24, 39] },
      styles: { fontSize: 9, cellPadding: 6 },
      head: [["Section", "Content"]],
      body: [
        ["Agenda", agenda || "-"],
        ["Notes", notes || "-"],
      ],
    });

    doc.save(`Meeting_${date}_${title || "Summary"}.pdf`);
  };

  // ---------- Reports ----------
  const exportWeeklySummaryTxt = () => {
    const summary: WeeklySummary = generateWeeklySummary();

    const text = `
WEEKLY PROJECT SUMMARY - ${summary.week}
VitalTrace Manufacturing Scale-Up Dashboard
Scenario: ${scenario} | Variant: ${variant}

Projects Completed: ${summary.projectsCompleted}
Projects On Track: ${summary.projectsOnTrack}
Projects At Risk: ${summary.projectsAtRisk}

KEY MILESTONES
${summary.keyMilestones.map((m) => `- ${m}`).join("\n")}

CRITICAL ISSUES
${summary.criticalIssues.map((m) => `- ${m}`).join("\n") || "- None"}

KPI SUMMARY
${summary.kpiSummary.map((k) => `- ${k.name}: ${k.current}/${k.target} (${k.trend})`).join("\n")}

NEXT WEEK PRIORITIES
${summary.nextWeekPriorities.map((m) => `- ${m}`).join("\n")}

Generated: ${new Date().toLocaleString()}
    `.trim();

    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Weekly_Summary_${summary.week}_${variant}_${scenario}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportComprehensivePDF = async () => {
    const docModule = await import("jspdf");
    const autoTable = await import("jspdf-autotable");
    const jsPDF = docModule.jsPDF;

    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const margin = 36;
    const contentW = doc.internal.pageSize.getWidth() - margin * 2;
    let y = 48;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("VitalTrace – Comprehensive Scale-Up Report", margin, y);
    y += 14;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Generated: ${new Date().toLocaleString()}`, margin, y);
    y += 14;
    doc.text(`Scenario: ${scenario}  •  Variant: ${variant}`, margin, y);
    y += 18;

    const section = (title: string) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text(title, margin, (y += 18));
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
    };

    const wrapText = (txt: string) => {
      const lines = doc.splitTextToSize(txt || "-", contentW);
      lines.forEach((line: string) => {
        if (y > doc.internal.pageSize.getHeight() - 60) {
          doc.addPage();
          y = 48;
        }
        doc.text(line, margin, (y += 12));
      });
    };

    // Projects
    section("Projects");
    const projRows = (current.projects || []).map((r) => [
      r[0],
      r[1],
      r[2],
      r[3],
      r[4],
      r[5],
      r[6],
      String(r[19] ?? "0") + "%",
      "$" + String(r[17] ?? 0),
      "$" + String(r[18] ?? 0),
    ]);

    (autoTable as any).default(doc, {
      startY: y + 8,
      margin: { left: margin, right: margin },
      styles: { fontSize: 8, cellPadding: 4, overflow: "linebreak" },
      headStyles: { fillColor: [17, 24, 39] },
      head: [["ID", "Name", "Type", "MoSCoW", "Owner", "Start", "Finish", "%", "CapEx", "OpEx"]],
      body: projRows,
      didDrawPage: (data: any) => {
        y = data.cursor.y;
      },
    });

    // Resources
    section("Resources");
    wrapText((current.resources || []).map((r) => `• ${r.join(" — ")}`).join("\n") || "-");

    // Risks
    section("Risks");
    wrapText((current.risks || []).map((r) => `• ${r.join(" — ")}`).join("\n") || "-");

    // Manufacturing
    section("Manufacturing");
    wrapText((current.manufacturing || []).map((r) => `• ${r.join(" — ")}`).join("\n") || "-");

    // KPIs
    section("KPIs");
    (autoTable as any).default(doc, {
      startY: y + 8,
      margin: { left: margin, right: margin },
      styles: { fontSize: 8, cellPadding: 4, overflow: "linebreak" },
      headStyles: { fillColor: [17, 24, 39] },
      head: [["Name", "Current", "Target", "Unit", "Owner"]],
      body: kpis.map((k) => [k.name, String(k.current_value), String(k.target_value), k.unit, k.owner]),
      didDrawPage: (data: any) => {
        y = data.cursor.y;
      },
    });

    doc.save(`ScaleUp_Report_${variant}_${scenario}.pdf`);
  };

  // ---------- Simple renderers per tab ----------
  const renderHeader = () => {
    return (
      <div className="sticky top-0 z-30 flex items-center justify-between bg-white/80 backdrop-blur border-b px-4 py-2">
        <div className="flex items-center gap-2">
          <select
            className="h-9 rounded-md border px-3"
            value={variant}
            onChange={(e) => setVariant(e.target.value as Variant)}
          >
            {PRODUCT_VARIANTS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          <select
            className="h-9 rounded-md border px-3"
            value={scenario}
            onChange={(e) => setScenario(e.target.value as ScenarioKey)}
          >
            <option value="50k">50k</option>
            <option value="200k">200k</option>
          </select>
          <span className="text-sm text-slate-500">{saving ? "Saving…" : "All changes saved"}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={exportWeeklySummaryTxt} className="gap-2">
            <FileText className="h-4 w-4" />
            Weekly Summary (TXT)
          </Button>
          <Button size="sm" onClick={exportComprehensivePDF} className="gap-2">
            <Download className="h-4 w-4" />
            Comprehensive Report (PDF)
          </Button>
        </div>
      </div>
    );
  };

  const renderTabs = () => {
    const TAB: [typeof tab, string][] = [
      ["overview", "Overview"],
      ["projects", "Projects"],
      ["manufacturing", "Manufacturing"],
      ["resources", "Resources"],
      ["risks", "Risks"],
      ["meetings", "Meetings"],
      ["kpis", "KPIs"],
      ["financials", "Financials"],
      ["glossary", "Glossary"],
      ["config", "Config"],
    ];
    return (
      <div className="flex gap-2 border-b px-3 py-2 bg-slate-50">
        {TAB.map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`rounded-md px-3 py-1 text-sm ${
              tab === k ? "bg-white shadow border" : "hover:bg-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    );
  };

  const renderProjects = () => {
    const cols = projectCols;
    const rows = current.projects || [];

    return (
      <div className="px-3 py-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Projects</h2>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={addProject} className="gap-2">
              <Plus className="h-4 w-4" />
              Add Project
            </Button>
            <Button size="sm" variant="destructive" onClick={deleteSelectedProjects} className="gap-2">
              <Trash2 className="h-4 w-4" />
              Delete Selected
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-md border">
          <table className="min-w-[1200px] table-fixed">
            <colgroup>
              {/* selection col */}
              <col style={{ width: 48 }} />
              {cols.map((c) => (
                <col key={c.key} style={{ width: columnWidths[c.key] }} />
              ))}
            </colgroup>
            <thead className="bg-slate-50 text-slate-700 text-xs uppercase">
              <tr>
                <th className="sticky left-0 z-10 bg-slate-50 px-2 py-2 text-left"> </th>
                {cols.map((c) => (
                  <th key={c.key} className="relative px-2 py-2 text-left select-none">
                    <div className="flex items-center gap-2">
                      <span className="truncate">{c.label}</span>
                      <span className="text-[10px] text-slate-400">{Math.round(columnWidths[c.key])}px</span>
                    </div>
                    <div
                      onMouseDown={(e) => onResizeStart(e, c.key)}
                      className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-slate-300"
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="text-sm">
              {rows.map((r, ri) => (
                <tr key={r[0] || ri} className="border-t">
                  <td className="sticky left-0 z-10 bg-white px-2 py-2">
                    <input
                      type="checkbox"
                      onChange={(e) => {
                        const id = String(r[0]);
                        if (e.target.checked) selectedRows.current[id] = true;
                        else delete selectedRows.current[id];
                      }}
                    />
                  </td>
                  {/* map cells with proper editor */}
                  {/* r indexes must match our 21 columns defined above */}
                  {cols.map((c, ci) => {
                    const colIndex = (() => {
                      // map projectCols order -> row index
                      const order: ColumnKey[] = [
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
                        "r",
                        "a",
                        "c",
                        "i",
                        "needs",
                        "barriers",
                        "risks",
                        "budget_capex",
                        "budget_opex",
                        "percent_complete",
                        "process_link",
                      ];
                      return order.indexOf(c.key);
                    })();

                    const value = r[colIndex] ?? "";

                    const baseCell =
                      c.type === "textarea" ? (
                        <Textarea
                          defaultValue={value}
                          onChange={(e) => setProjectCell(ri, colIndex, e.target.value)}
                          ref={autoGrow as any}
                          className="min-h-[36px] resize-none whitespace-normal break-words leading-snug"
                        />
                      ) : c.type === "date" ? (
                        <Input
                          type="date"
                          value={value || ""}
                          onChange={(e) => setProjectCell(ri, colIndex, e.target.value)}
                          className="h-9"
                        />
                      ) : c.type === "number" ? (
                        <Input
                          type="number"
                          value={String(value ?? 0)}
                          onChange={(e) => setProjectCell(ri, colIndex, Number(e.target.value || 0))}
                          className="h-9"
                        />
                      ) : (
                        <Input
                          value={String(value ?? "")}
                          onChange={(e) => setProjectCell(ri, colIndex, e.target.value)}
                          className="h-9"
                        />
                      );

                    return (
                      <td key={c.key} className="px-2 py-2 align-top">
                        <div className={c.wrap ? "whitespace-normal break-words" : "truncate"}>{baseCell}</div>
                      </td>
                    );
                  })}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={cols.length + 1} className="px-3 py-8 text-center text-slate-500">
                    No projects yet. Click “Add Project” to create your first row.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const simpleGrid = (
    title: string,
    keyName:
      | "manufacturing"
      | "resources"
      | "risks"
      | "financials"
      | "glossary",
    columns: { label: string; type: "text" | "number" | "date" | "textarea" }[],
  ) => {
    const rows = current[keyName] || [];
    const addRow = () => {
      updateProduct((p) => {
        const blank = columns.map((c) =>
          c.type === "number" ? 0 : c.type === "date" ? new Date().toISOString().split("T")[0] : "",
        );
        (p[keyName] as any[]) = [...(p[keyName] || []), blank];
      });
    };
    const deleteRow = (idx: number) => {
      updateProduct((p) => {
        (p[keyName] as any[]) = (p[keyName] || []).filter((_: any, i: number) => i !== idx);
      });
    };
    const setCell = (ri: number, ci: number, v: any) => {
      updateProduct((p) => {
        const next = (p[keyName] || []).map((r: any[], i: number) => (i === ri ? r.map((c: any, j: number) => (j === ci ? v : c)) : r));
        (p[keyName] as any[]) = next;
      });
    };

    return (
      <div className="px-3 py-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <Button size="sm" onClick={addRow} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Row
          </Button>
        </div>

        <div className="overflow-x-auto rounded-md border">
          <table className="min-w-[900px] table-fixed">
            <thead className="bg-slate-50 text-slate-700 text-xs uppercase">
              <tr>
                {columns.map((c) => (
                  <th key={c.label} className="px-2 py-2 text-left">
                    {c.label}
                  </th>
                ))}
                <th className="px-2 py-2 text-left"> </th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {rows.map((r: any[], ri: number) => (
                <tr key={ri} className="border-t">
                  {columns.map((c, ci) => (
                    <td key={ci} className="px-2 py-2 align-top">
                      {c.type === "textarea" ? (
                        <Textarea
                          defaultValue={r[ci]}
                          onChange={(e) => setCell(ri, ci, e.target.value)}
                          ref={autoGrow as any}
                          className="min-h-[36px] resize-none whitespace-normal break-words leading-snug"
                        />
                      ) : c.type === "date" ? (
                        <Input
                          type="date"
                          value={r[ci] || ""}
                          onChange={(e) => setCell(ri, ci, e.target.value)}
                          className="h-9"
                        />
                      ) : c.type === "number" ? (
                        <Input
                          type="number"
                          value={String(r[ci] ?? 0)}
                          onChange={(e) => setCell(ri, ci, Number(e.target.value || 0))}
                          className="h-9"
                        />
                      ) : (
                        <Input value={r[ci] || ""} onChange={(e) => setCell(ri, ci, e.target.value)} className="h-9" />
                      )}
                    </td>
                  ))}
                  <td className="px-2 py-2">
                    <Button size="icon" variant="ghost" onClick={() => deleteRow(ri)}>
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={columns.length + 1} className="px-3 py-8 text-center text-slate-500">
                    No data yet. Click “Add Row”.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderMeetings = () => {
    const rows = current.meetings || [];
    const setCell = (ri: number, ci: number, v: any) => {
      updateProduct((p) => {
        const next = (p.meetings || []).map((r: any[], i: number) => (i === ri ? r.map((c: any, j: number) => (j === ci ? v : c)) : r));
        p.meetings = next;
      });
    };
    const addRow = () => {
      const row = [
        `MEET-${Date.now()}`,
        "New Meeting",
        new Date().toISOString().split("T")[0],
        "10:00",
        "60",
        "Attendees",
        "Location",
        "Agenda",
        "Notes",
        "Scheduled",
      ];
      updateProduct((p) => {
        p.meetings = [...(p.meetings || []), row];
      });
    };
    const deleteRow = (idx: number) =>
      updateProduct((p) => {
        p.meetings = (p.meetings || []).filter((_: any, i: number) => i !== idx);
      });

    return (
      <div className="px-3 py-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Meetings</h2>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" className="gap-2" onClick={() => setShowMeetingModal(true)}>
              <CalendarPlus2 className="h-4 w-4" />
              Schedule Meeting
            </Button>
            <Button size="sm" onClick={addRow} className="gap-2">
              <Plus className="h-4 w-4" />
              Add Row
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-md border">
          <table className="min-w-[1200px] table-fixed">
            <thead className="bg-slate-50 text-slate-700 text-xs uppercase">
              <tr>
                {["ID", "Title", "Date", "Time", "Duration (min)", "Attendees", "Location", "Agenda", "Notes", "Status", ""].map(
                  (h) => (
                    <th key={h} className="px-2 py-2 text-left">
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="text-sm">
              {rows.map((r: any[], ri: number) => (
                <tr key={r[0]} className="border-t">
                  <td className="px-2 py-2">{r[0]}</td>
                  <td className="px-2 py-2">
                    <Input value={r[1]} onChange={(e) => setCell(ri, 1, e.target.value)} className="h-9" />
                  </td>
                  <td className="px-2 py-2">
                    <Input type="date" value={r[2]} onChange={(e) => setCell(ri, 2, e.target.value)} className="h-9" />
                  </td>
                  <td className="px-2 py-2">
                    <Input value={r[3]} onChange={(e) => setCell(ri, 3, e.target.value)} className="h-9" />
                  </td>
                  <td className="px-2 py-2">
                    <Input type="number" value={r[4]} onChange={(e) => setCell(ri, 4, e.target.value)} className="h-9" />
                  </td>
                  <td className="px-2 py-2">
                    <Input value={r[5]} onChange={(e) => setCell(ri, 5, e.target.value)} className="h-9" />
                  </td>
                  <td className="px-2 py-2">
                    <Input value={r[6]} onChange={(e) => setCell(ri, 6, e.target.value)} className="h-9" />
                  </td>
                  <td className="px-2 py-2">
                    <Textarea defaultValue={r[7]} onChange={(e) => setCell(ri, 7, e.target.value)} ref={autoGrow as any} />
                  </td>
                  <td className="px-2 py-2">
                    <Textarea defaultValue={r[8]} onChange={(e) => setCell(ri, 8, e.target.value)} ref={autoGrow as any} />
                  </td>
                  <td className="px-2 py-2">
                    <Input value={r[9]} onChange={(e) => setCell(ri, 9, e.target.value)} className="h-9" />
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" className="gap-2" onClick={() => exportMeetingSummary(r)}>
                        <FileText className="h-4 w-4" />
                        Export
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => deleteRow(ri)}>
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-3 py-8 text-center text-slate-500">
                    No meetings. Click “Schedule Meeting” or “Add Row”.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Modal */}
        {showMeetingModal && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
            <div className="w-full max-w-2xl rounded-xl bg-white shadow-lg">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <h3 className="text-lg font-semibold">Schedule Meeting</h3>
                <Button variant="ghost" onClick={() => setShowMeetingModal(false)}>
                  Close
                </Button>
              </div>
              <div className="grid gap-3 p-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="text-sm text-slate-600">Title</label>
                  <Input
                    className="mt-1"
                    value={meetingForm.title}
                    onChange={(e) => setMeetingForm((s) => ({ ...s, title: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm text-slate-600">Date</label>
                  <Input
                    type="date"
                    className="mt-1"
                    value={meetingForm.date}
                    onChange={(e) => setMeetingForm((s) => ({ ...s, date: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm text-slate-600">Time</label>
                  <Input
                    className="mt-1"
                    value={meetingForm.time}
                    onChange={(e) => setMeetingForm((s) => ({ ...s, time: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm text-slate-600">Duration (min)</label>
                  <Input
                    type="number"
                    className="mt-1"
                    value={meetingForm.duration}
                    onChange={(e) => setMeetingForm((s) => ({ ...s, duration: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm text-slate-600">Status</label>
                  <Input
                    className="mt-1"
                    value={meetingForm.status}
                    onChange={(e) => setMeetingForm((s) => ({ ...s, status: e.target.value }))}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-sm text-slate-600">Attendees</label>
                  <Input
                    className="mt-1"
                    value={meetingForm.attendees}
                    onChange={(e) => setMeetingForm((s) => ({ ...s, attendees: e.target.value }))}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-sm text-slate-600">Location</label>
                  <Input
                    className="mt-1"
                    value={meetingForm.location}
                    onChange={(e) => setMeetingForm((s) => ({ ...s, location: e.target.value }))}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-sm text-slate-600">Agenda</label>
                  <Textarea
                    className="mt-1"
                    value={meetingForm.agenda}
                    onChange={(e) => setMeetingForm((s) => ({ ...s, agenda: e.target.value }))}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-sm text-slate-600">Notes</label>
                  <Textarea
                    className="mt-1"
                    value={meetingForm.notes}
                    onChange={(e) => setMeetingForm((s) => ({ ...s, notes: e.target.value }))}
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
                <Button variant="ghost" onClick={() => setShowMeetingModal(false)}>
                  Cancel
                </Button>
                <Button onClick={saveMeetingFromModal} className="gap-2">
                  <CalendarPlus2 className="h-4 w-4" />
                  Save Meeting
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderKPIs = () => {
    const setVal = (i: number, key: keyof KPI, v: any) => {
      setKpis((prev) => prev.map((k, idx) => (i === idx ? { ...k, [key]: v, updated_at: new Date().toISOString() } : k)));
    };
    const add = () =>
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
      ]);
    const del = (i: number) => setKpis((prev) => prev.filter((_, idx) => idx !== i));

    return (
      <div className="px-3 py-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold">KPIs</h2>
          <Button size="sm" onClick={add} className="gap-2">
            <Plus className="h-4 w-4" />
            Add KPI
          </Button>
        </div>
        <div className="overflow-x-auto rounded-md border">
          <table className="min-w-[900px] table-fixed">
            <thead className="bg-slate-50 text-slate-700 text-xs uppercase">
              <tr>
                <th className="px-2 py-2 text-left">Name</th>
                <th className="px-2 py-2 text-left">Current</th>
                <th className="px-2 py-2 text-left">Target</th>
                <th className="px-2 py-2 text-left">Unit</th>
                <th className="px-2 py-2 text-left">Owner</th>
                <th className="px-2 py-2 text-left"> </th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {kpis.map((k, i) => (
                <tr key={k.id} className="border-t">
                  <td className="px-2 py-2">
                    <Input value={k.name} onChange={(e) => setVal(i, "name", e.target.value)} className="h-9" />
                  </td>
                  <td className="px-2 py-2">
                    <Input
                      type="number"
                      value={String(k.current_value)}
                      onChange={(e) => setVal(i, "current_value", Number(e.target.value || 0))}
                      className="h-9"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <Input
                      type="number"
                      value={String(k.target_value)}
                      onChange={(e) => setVal(i, "target_value", Number(e.target.value || 0))}
                      className="h-9"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <Input value={k.unit} onChange={(e) => setVal(i, "unit", e.target.value)} className="h-9" />
                  </td>
                  <td className="px-2 py-2">
                    <Input value={k.owner} onChange={(e) => setVal(i, "owner", e.target.value)} className="h-9" />
                  </td>
                  <td className="px-2 py-2">
                    <Button size="icon" variant="ghost" onClick={() => del(i)}>
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </td>
                </tr>
              ))}
              {kpis.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                    No KPIs. Click “Add KPI”.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // ---------- Page ----------
  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex items-center gap-2 text-slate-600">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading…
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {renderHeader()}
      {renderTabs()}
      {error && <div className="px-3 py-2 text-sm text-red-600">{error}</div>}

      {tab === "overview" && (
        <div className="px-3 py-4">
          <h2 className="text-lg font-semibold">Overview</h2>
          <p className="mt-2 text-sm text-slate-600">
            Use the tabs above to manage Projects, Manufacturing, Resources, Risks, Meetings, KPIs, Financials, and Glossary.
            All changes save automatically for your workspace.
          </p>
        </div>
      )}

      {tab === "projects" && renderProjects()}

      {tab === "manufacturing" &&
        simpleGrid("Manufacturing", "manufacturing", [
          { label: "Process", type: "text" },
          { label: "CT (min)", type: "number" },
          { label: "Batch Size", type: "number" },
          { label: "Yield (%)", type: "number" },
          { label: "Cycle (s)", type: "number" },
          { label: "Equipment", type: "text" },
          { label: "Type", type: "text" },
          { label: "Status", type: "text" },
          { label: "Owner", type: "text" },
        ])}

      {tab === "resources" &&
        simpleGrid("Resources", "resources", [
          { label: "Resource", type: "text" },
          { label: "Type", type: "text" },
          { label: "Qty", type: "number" },
          { label: "Cost", type: "number" },
          { label: "Department", type: "text" },
          { label: "Notes", type: "textarea" },
        ])}

      {tab === "risks" &&
        simpleGrid("Risks", "risks", [
          { label: "Title", type: "text" },
          { label: "Impact", type: "text" },
          { label: "Probability", type: "text" },
          { label: "Mitigation", type: "textarea" },
          { label: "Owner", type: "text" },
          { label: "Status", type: "text" },
        ])}

      {tab === "meetings" && renderMeetings()}

      {tab === "kpis" && renderKPIs()}

      {tab === "financials" &&
        simpleGrid("Financials", "financials", [
          { label: "Category", type: "text" },
          { label: "Item", type: "text" },
          { label: "Amount", type: "number" },
          { label: "Type", type: "text" },
          { label: "Notes", type: "textarea" },
        ])}

      {tab === "glossary" &&
        simpleGrid("Glossary", "glossary", [
          { label: "Term", type: "text" },
          { label: "Definition", type: "textarea" },
        ])}

      {tab === "config" && (
        <div className="px-3 py-4">
          <h2 className="text-lg font-semibold">Config</h2>
          <p className="mt-2 text-sm text-slate-600">
            Column widths are saved automatically. Drag the right edge of a column header in Projects to resize it. All other tabs
            support add/delete rows and autosave.
          </p>
        </div>
      )}
    </div>
  );
}
