"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { FileText, Loader2, Plus, Save, Trash2, TrendingUp, Pencil } from "lucide-react";
import jsPDF from "jspdf";
import { generateWeeklySummary } from "@/lib/utils";
import { clone, SEED_PLAN } from "@/lib/constants";

/** =========================== Types =========================== */
type Variant = "Recess Nanodispensing" | "Dipcoating";
type ScenarioKey = "50k" | "200k";

interface KPI {
  id: string;
  name: string;
  current_value: number;
  target_value: number;
  unit: string;
  owner: string;
  scenario_id?: string;
  created_at?: string;
  updated_at?: string;
}

interface SyncStatus {
  isOnline: boolean;
  lastSync: Date;
  pendingChanges: number;
  connectedUsers: number;
}

/** ======================= Small Utilities ===================== */
const ensureArray = (v: any): any[] => (Array.isArray(v) ? v : Array.isArray(v?.data) ? v.data : []);
const currency = (n: any) => {
  const num = Number(n || 0);
  return isFinite(num) ? `$${num.toLocaleString()}` : "$0";
};

/** ======================= Main Component ====================== */
export default function ScaleUpDashboard() {
  /** -------- Core App State -------- */
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<
    "Overview" | "Projects" | "Manufacturing" | "Resources" | "Risks" | "Meetings" | "KPIs" | "Financials" | "Glossary" | "Config"
  >("Projects");

  const [scenario, setScenario] = useState<ScenarioKey>("50k");
  const [variant, setVariant] = useState<Variant>("Recess Nanodispensing");

  const [plan, setPlan] = useState<any>(() => {
    const p = clone(SEED_PLAN);
    if (!p.scenarios) {
      p.scenarios = {
        "50k": { unitsPerYear: 50000, hoursPerDay: 8, shifts: 1 },
        "200k": { unitsPerYear: 200000, hoursPerDay: 16, shifts: 2 },
      };
    }
    if (!p.products) {
      p.products = {
        "50k": { projects: [], manufacturing: [], resources: [], risks: [], meetings: [], kpis: [] },
        "200k": { projects: [], manufacturing: [], resources: [], risks: [], meetings: [], kpis: [] },
      };
    }
    return p;
  });

  /** -------- Tab Data (flat states) -------- */
  const [projects, setProjects] = useState<any[][]>([]);
  const [manufacturing, setManufacturing] = useState<any[][]>([]);
  const [resources, setResources] = useState<any[][]>([]);
  const [risks, setRisks] = useState<any[][]>([]);
  const [meetings, setMeetings] = useState<any[][]>([]);
  const [kpis, setKpis] = useState<KPI[]>([]);
  const [financials, setFinancials] = useState<any[][]>([]);
  const [glossary, setGlossary] = useState<any[][]>([]);

  /** -------- Sync Status -------- */
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    isOnline: true,
    lastSync: new Date(),
    pendingChanges: 0,
    connectedUsers: 1,
  });

  /** -------- Meeting Modal -------- */
  const [meetingModalOpen, setMeetingModalOpen] = useState(false);
  const [meetingIdx, setMeetingIdx] = useState<number | null>(null);
  const [meetingDraft, setMeetingDraft] = useState<any[]>([
    "Weekly Status",
    new Date().toISOString().slice(0, 10),
    "10:00",
    "60 min",
    "Team",
    "Room A",
    "Scheduled",
    "1) Updates\n2) Risks\n3) Decisions",
    "",
  ]);

  const openMeetingModal = (idx: number | null) => {
    if (idx === null) {
      setMeetingDraft(["Weekly Status", new Date().toISOString().slice(0, 10), "10:00", "60 min", "Team", "Room A", "Scheduled", "", ""]);
      setMeetingIdx(null);
    } else {
      setMeetingDraft([...(meetings[idx] || meetingDraft)]);
      setMeetingIdx(idx);
    }
    setMeetingModalOpen(true);
  };

  const saveMeetingFromModal = () => {
    if (meetingIdx === null) {
      setMeetings((prev) => [...prev, [...meetingDraft]]);
    } else {
      setMeetings((prev) => {
        const n = [...prev];
        n[meetingIdx] = [...meetingDraft];
        return n;
      });
    }
    setMeetingModalOpen(false);
  };

  const exportMeetingPDF = (mtg: any[]) => {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const M = 40;
    let y = M;

    const add = (t: string, bold = false) => {
      doc.setFont("helvetica", bold ? "bold" : "normal");
      doc.setFontSize(bold ? 14 : 11);
      const lines = doc.splitTextToSize(t, 595 - 2 * M);
      lines.forEach((ln: string) => {
        if (y > 800) {
          doc.addPage();
          y = M;
        }
        doc.text(ln, M, y);
        y += 16;
      });
      y += 4;
    };

    add("VitalTrace – Meeting Summary", true);
    add(`Title: ${mtg[0]}`);
    add(`Date: ${mtg[1]}   Time: ${mtg[2]}   Duration: ${mtg[3]}`);
    add(`Attendees: ${mtg[4]}`);
    add(`Location: ${mtg[5]}`);
    add(`Status: ${mtg[6]}`);
    add("Agenda:", true);
    add(mtg[7] || "—");
    add("Notes:", true);
    add(mtg[8] || "—");

    doc.save(`Meeting_${(mtg[0] || "Summary").replace(/\s+/g, "_")}_${mtg[1]}.pdf`);
  };

  const exportMeetingICS = (mtg: any[]) => {
    const DTSTART = `${mtg[1]?.replace(/-/g, "")}T${(mtg[2] || "10:00").replace(":", "")}00`;
    const UID = `${Date.now()}@vitaltrace`;
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//VitalTrace//Meeting//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      `UID:${UID}`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z")}`,
      `DTSTART:${DTSTART}`,
      `SUMMARY:${mtg[0] || "Meeting"}`,
      `DESCRIPTION:${(mtg[7] || "")}\nNotes:${mtg[8] || ""}`.replace(/\n/g, "\\n"),
      `LOCATION:${mtg[5] || ""}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), {
      href: url,
      download: `Meeting_${(mtg[0] || "Event").replace(/\s+/g, "_")}.ics`,
    });
    a.click();
    URL.revokeObjectURL(url);
  };

  /** -------- Load saved data -------- */
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const controller = new AbortController();
        const to = setTimeout(() => controller.abort(), 12000);
        const res = await fetch("/api/configurations", { signal: controller.signal });
        clearTimeout(to);

        if (!res.ok) {
          if (res.status === 401) {
            setError("Please sign in to load and save your dashboard data.");
          } else {
            setError(`Failed to load: ${res.statusText}`);
          }
          setLoading(false);
          return;
        }

        const rows = await res.json();
        const latest = Array.isArray(rows) ? rows.find((r: any) => r.name === "ScaleUp-Dashboard-Config") ?? rows[0] : null;

        if (latest?.data) {
          const d = latest.data;
          setPlan(d.plan ?? plan);
          setScenario(d.scenario ?? scenario);
          setVariant(d.variant ?? variant);

          const prod = d.plan?.products?.[d.scenario ?? scenario] ?? {};
          setProjects(ensureArray(prod.projects));
          setManufacturing(ensureArray(prod.manufacturing));
          setResources(ensureArray(prod.resources));
          setRisks(ensureArray(prod.risks));
          setMeetings(ensureArray(prod.meetings));
          setKpis(Array.isArray(d.kpis) ? d.kpis : ensureArray(prod.kpis));
          setFinancials(ensureArray(d.financials?.[d.scenario ?? scenario]) || ensureArray(d.financials));
          setGlossary(ensureArray(d.glossary));
        }
      } catch (e: any) {
        setError(e?.message ?? "Failed to load data.");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** -------- Autosave -------- */
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleSave = useCallback(() => {
    setSyncStatus((s) => ({ ...s, pendingChanges: s.pendingChanges + 1, lastSync: new Date() }));
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      await saveAll();
    }, 1400);
  }, []);

  const saveAll = useCallback(async () => {
    try {
      setSaving(true);
      setPlan((prev: any) => {
        const next = { ...prev, products: { ...prev.products } };
        next.products[scenario] = {
          ...(next.products[scenario] || {}),
          projects,
          manufacturing,
          resources,
          risks,
          meetings,
          kpis,
        };
        const payload = {
          plan: next,
          scenario,
          variant,
          financials: { [scenario]: financials },
          glossary,
          lastSaved: new Date().toISOString(),
        };
        (async () => {
          const res = await fetch("/api/configurations", {
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
          if (!res.ok) {
            const j = await res.json().catch(() => ({}));
            setError(j?.error ?? `Save failed (${res.status})`);
            setSyncStatus((s) => ({ ...s, isOnline: false }));
          } else {
            setError(null);
            setSyncStatus((s) => ({ ...s, isOnline: true, pendingChanges: 0, lastSync: new Date() }));
          }
          setSaving(false);
        })();
        return next;
      });
    } catch (e: any) {
      setSaving(false);
      setSyncStatus((s) => ({ ...s, isOnline: false }));
      setError(e?.message ?? "Failed to save.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, manufacturing, resources, risks, meetings, kpis, financials, glossary, scenario, variant]);

  useEffect(() => {
    if (!loading) scheduleSave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, manufacturing, resources, risks, meetings, kpis, financials, glossary, scenario, variant, loading]);

  /** -------- Overview metrics -------- */
  const scenarioCfg =
    plan?.scenarios?.[scenario] ?? (scenario === "50k" ? { unitsPerYear: 50000, hoursPerDay: 8, shifts: 1 } : { unitsPerYear: 200000, hoursPerDay: 16, shifts: 2 });

  const overview = useMemo(() => {
    const totalProjects = projects.length;
    const active = Math.floor(totalProjects * 0.7);
    const completed = Math.floor(totalProjects * 0.2);
    const atRisk = totalProjects - active - completed;
    const totalResources = resources.reduce((acc, r) => acc + Number(r?.[2] || 0), 0);
    const kpiHealth =
      kpis.length > 0
        ? Math.round((kpis.filter((k) => k.current_value >= k.target_value * 0.9).length / kpis.length) * 100)
        : 85;
    return {
      totalProjects,
      active,
      completed,
      atRisk,
      totalResources,
      kpiHealth,
      capacityUtil: Math.round((scenarioCfg.unitsPerYear / (scenario === "50k" ? 60000 : 250000)) * 100),
    };
  }, [projects, resources, kpis, scenario, scenarioCfg]);

  /** -------- Weekly TXT -------- */
  const exportWeeklySummary = () => {
    const sum = generateWeeklySummary?.() ?? {
      week: new Date().toISOString().slice(0, 10),
      projectsCompleted: 0,
      projectsOnTrack: 0,
      projectsAtRisk: 0,
      keyMilestones: [],
      criticalIssues: [],
      nextWeekPriorities: [],
      kpiSummary: [],
    };

    const content = `
WEEKLY PROJECT SUMMARY - ${sum.week}
VitalTrace Manufacturing Scale-Up Dashboard
Scenario: ${scenario} | Variant: ${variant}

═══════════════════════════════════════════════════════════════

📊 PROJECT STATUS OVERVIEW
• Projects Completed: ${sum.projectsCompleted}
• Projects On Track: ${sum.projectsOnTrack}
• Projects At Risk: ${sum.projectsAtRisk}
• Total Active Projects: ${sum.projectsCompleted + sum.projectsOnTrack + sum.projectsAtRisk}

🎯 KEY MILESTONES
${sum.keyMilestones.map((m: string) => `• ${m}`).join("\n") || "• —"}

⚠️ CRITICAL ISSUES
${sum.criticalIssues.map((m: string) => `• ${m}`).join("\n") || "• —"}

📈 KPI PERFORMANCE
${
  sum.kpiSummary?.length
    ? sum.kpiSummary
        .map(
          (k: any) => `• ${k.name}: ${k.current}/${k.target} ${k.trend === "up" ? "↗" : k.trend === "down" ? "↘" : "→"}`
        )
        .join("\n")
    : "• —"
}

🚀 NEXT WEEK PRIORITIES
${sum.nextWeekPriorities.map((m: string) => `• ${m}`).join("\n") || "• —"}

═══════════════════════════════════════════════════════════════
Generated: ${new Date().toLocaleString()}
Dashboard Version: v66
    `.trim();

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Weekly_Summary_${sum.week}_${variant}_${scenario}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /** -------- Comprehensive PDF -------- */
  const generateComprehensiveReportPDF = () => {
    const PAGE_W = 595;
    const PAGE_H = 842;
    const M = 40;
    const LINE = 14;
    const GAP = 8;

    const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
    let y = M;

    const ensureSpace = (needed: number) => {
      if (y + needed > PAGE_H - M) {
        doc.addPage();
        y = M;
      }
    };
    const hr = () => {
      ensureSpace(12);
      doc.setDrawColor(210, 210, 210);
      doc.line(M, y, PAGE_W - M, y);
      y += 12;
    };
    const title = (t: string) => {
      ensureSpace(22);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text(t, M, y);
      y += 18;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
    };
    const addWrapped = (text: string, indent = 0, size = 10, lh = LINE) => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(size);
      const maxW = PAGE_W - 2 * M - indent;
      const lines = doc.splitTextToSize(text, maxW);
      lines.forEach((ln: string) => {
        ensureSpace(lh);
        doc.text(ln, M + indent, y);
        y += lh;
      });
    };

    // header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("VitalTrace – Comprehensive Scale-Up Report", M, y);
    y += 22;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, M, y);
    y += 14;
    doc.text(`Scenario: ${scenario}  •  Variant: ${variant}`, M, y);
    y += 10;
    hr();

    // Projects
    title("Projects");
    if (!projects.length) addWrapped("• No projects found.");
    projects.forEach((p) => {
      const name = p?.[1] ?? "Project";
      const status = p?.[22] || p?.[2] || "—";
      addWrapped(`• ${name}  [${status}]`);
      addWrapped(`Owner: ${p?.[4] || "—"}`, 16);
      addWrapped(`Dates: ${p?.[5] || "—"} → ${p?.[6] || "—"}`, 16);
      addWrapped(`Goal: ${p?.[9] || "—"}`, 16);
      addWrapped(`CapEx: ${currency(p?.[17])} • OpEx: ${currency(p?.[18])} • Progress: ${p?.[19] || 0}%`, 16);
      y += GAP;
    });
    hr();

    // Resources
    title("Resources");
    if (!resources.length) addWrapped("• No resources found.");
    resources.forEach((r) => {
      addWrapped(`• ${r?.[0] || "Role"} — ${r?.[1] || "Type"} — Qty ${r?.[2] || 0} — ${currency(r?.[3])} — ${r?.[4] || "Dept"}`);
      if (r?.[5]) addWrapped(`Notes: ${r?.[5]}`, 16);
      y += GAP;
    });
    hr();

    // Risks
    title("Risks");
    if (!risks.length) addWrapped("• No risks found.");
    risks.forEach((r) => {
      addWrapped(
        `• (${r?.[0] || "ID"}) ${r?.[1] || "Risk"} — Impact ${r?.[2] || "—"}, Prob ${r?.[3] || "—"} — Owner ${r?.[5] || "—"} — Due ${r?.[6] || "—"} — ${r?.[7] || "Open"}`
      );
      if (r?.[4]) addWrapped(`Mitigation: ${r?.[4]}`, 16);
      y += GAP;
    });
    hr();

    // Meetings
    title("Meetings");
    if (!meetings.length) addWrapped("• No meetings found.");
    meetings.forEach((m) => {
      addWrapped(`• ${m?.[0] || "Meeting"} — ${m?.[1] || ""} ${m?.[2] || ""} — ${m?.[3] || ""} — ${m?.[6] || "Scheduled"}`);
      addWrapped(`Attendees: ${m?.[4] || "—"}`, 16);
      addWrapped(`Location: ${m?.[5] || "—"}`, 16);
      if (m?.[7]) addWrapped(`Agenda: ${m?.[7]}`, 16);
      if (m?.[8]) addWrapped(`Notes: ${m?.[8]}`, 16);
      y += GAP;
    });
    hr();

    // KPIs
    title("KPIs");
    if (!kpis.length) addWrapped("• No KPIs defined.");
    kpis.forEach((k) => addWrapped(`• ${k.name}: ${k.current_value}${k.unit} / ${k.target_value}${k.unit} — Owner: ${k.owner || "—"}`));

    addWrapped(`\n\nEnd of report • Scenario ${scenario} • Variant ${variant}`);
    doc.save(`VitalTrace_Comprehensive_Report_${variant}_${scenario}.pdf`);
  };

  /** ========================= Row Helpers ========================= */
  const addProject = () =>
    setProjects((prev) => [
      ...prev,
      [
        `PROJ-${Date.now()}`,
        "New Project",
        "Planning",
        "Must",
        "Project Manager",
        new Date().toISOString().slice(0, 10),
        new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
        0,
        "",
        "",
        "R",
        "A",
        "C",
        "I",
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
      ],
    ]);
  const deleteProject = (i: number) => setProjects((prev) => prev.filter((_, idx) => idx !== i));
  const editProject = (i: number, j: number, v: any) =>
    setProjects((prev) => {
      const n = [...prev];
      n[i] = [...n[i]];
      n[i][j] = v;
      return n;
    });

  const addManufacturing = () =>
    setManufacturing((prev) => [...prev, ["New Process", 0, 1, 100, 0, "Manual Station", "Manual", "Planning", "Owner"]]);
  const deleteManufacturing = (i: number) => setManufacturing((prev) => prev.filter((_, idx) => idx !== i));
  const editManufacturing = (i: number, j: number, v: any) =>
    setManufacturing((prev) => {
      const n = [...prev];
      n[i] = [...n[i]];
      n[i][j] = v;
      return n;
    });

  const addResource = () => setResources((prev) => [...prev, ["New Resource", "Personnel", 1, 0, "Department", ""]]);
  const deleteResource = (i: number) => setResources((prev) => prev.filter((_, idx) => idx !== i));
  const editResource = (i: number, j: number, v: any) =>
    setResources((prev) => {
      const n = [...prev];
      n[i] = [...n[i]];
      n[i][j] = v;
      return n;
    });

  const addRisk = () =>
    setRisks((prev) => [...prev, [`RISK-${Date.now()}`, "New risk", "M", "M", "Mitigation", "Owner", new Date().toISOString().slice(0, 10), "Open"]]);
  const deleteRisk = (i: number) => setRisks((prev) => prev.filter((_, idx) => idx !== i));
  const editRisk = (i: number, j: number, v: any) =>
    setRisks((prev) => {
      const n = [...prev];
      n[i] = [...n[i]];
      n[i][j] = v;
      return n;
    });

  const addMeeting = () => openMeetingModal(null);
  const deleteMeeting = (i: number) => setMeetings((prev) => prev.filter((_, idx) => idx !== i));
  const editInlineMeeting = (i: number, j: number, v: any) =>
    setMeetings((prev) => {
      const n = [...prev];
      n[i] = [...n[i]];
      n[i][j] = v;
      return n;
    });

  const addKPI = () =>
    setKpis((prev) => [
      ...prev,
      {
        id: `kpi-${Date.now()}`,
        name: "New KPI",
        current_value: 0,
        target_value: 100,
        unit: "%",
        owner: "Owner",
        scenario_id: `scenario-${scenario}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]);
  const deleteKPI = (id: string) => setKpis((prev) => prev.filter((k) => k.id !== id));
  const editKPI = (id: string, field: keyof KPI, value: any) =>
    setKpis((prev) =>
      prev.map((k) => (k.id === id ? { ...k, [field]: field.includes("value") ? Number(value) || 0 : value, updated_at: new Date().toISOString() } : k))
    );

  const addFinancial = () => setFinancials((prev) => [...prev, ["COGS", "Item", 0, "Expense", ""]]);
  const deleteFinancial = (i: number) => setFinancials((prev) => prev.filter((_, idx) => idx !== i));
  const editFinancial = (i: number, j: number, v: any) =>
    setFinancials((prev) => {
      const n = [...prev];
      n[i] = [...n[i]];
      n[i][j] = j === 2 ? Number(v) || 0 : v;
      return n;
    });

  const addGlossary = () => setGlossary((prev) => [...prev, ["New Term", "Definition"]]);
  const deleteGlossary = (i: number) => setGlossary((prev) => prev.filter((_, idx) => idx !== i));
  const editGlossary = (i: number, j: number, v: any) =>
    setGlossary((prev) => {
      const n = [...prev];
      n[i] = [...n[i]];
      n[i][j] = v;
      return n;
    });

  /** ============================ UI ============================ */
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="flex items-center justify-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Loading dashboard…</span>
          </div>
          <div className="text-sm text-muted-foreground">If prompted, sign in first.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-5 space-y-5">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <select className="border rounded px-3 py-2 text-sm" value={scenario} onChange={(e) => setScenario(e.target.value as ScenarioKey)}>
            <option value="50k">50k</option>
            <option value="200k">200k</option>
          </select>
          <select className="border rounded px-3 py-2 text-sm" value={variant} onChange={(e) => setVariant(e.target.value as Variant)}>
            <option>Recess Nanodispensing</option>
            <option>Dipcoating</option>
          </select>
          <span className="text-xs text-slate-500">
            {saving ? "Saving…" : `Last sync ${syncStatus.lastSync.toLocaleTimeString()} ${syncStatus.isOnline ? "✓" : "• offline"}`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportWeeklySummary} className="gap-2">
            <FileText className="h-4 w-4" />
            Weekly Summary (TXT)
          </Button>
          <Button variant="default" size="sm" onClick={generateComprehensiveReportPDF} className="gap-2">
            <TrendingUp className="h-4 w-4" />
            Comprehensive Report (PDF)
          </Button>
          <Button variant="outline" size="sm" onClick={saveAll} className="gap-2">
            <Save className="h-4 w-4" />
            Save now
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {["Overview", "Projects", "Manufacturing", "Resources", "Risks", "Meetings", "KPIs", "Financials", "Glossary", "Config"].map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t as any)}
            className={`text-sm px-3 py-1.5 rounded border ${activeTab === t ? "bg-slate-900 text-white" : "bg-white hover:bg-slate-50"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Overview */}
      {activeTab === "Overview" && (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="border rounded-lg p-4">
            <div className="font-semibold mb-2">Production</div>
            <div className="text-sm space-y-1">
              <div>Target units/year: {scenarioCfg.unitsPerYear.toLocaleString()}</div>
              <div>Capacity utilization: {overview.capacityUtil}%</div>
            </div>
          </div>
          <div className="border rounded-lg p-4">
            <div className="font-semibold mb-2">Projects</div>
            <div className="text-sm space-y-1">
              <div>Total: {overview.totalProjects}</div>
              <div>Active: {overview.active}</div>
              <div>Completed: {overview.completed}</div>
              <div>At Risk: {overview.atRisk}</div>
            </div>
          </div>
          <div className="border rounded-lg p-4">
            <div className="font-semibold mb-2">KPIs</div>
            <div className="text-sm">KPI Health: {overview.kpiHealth}%</div>
          </div>
          <div className="border rounded-lg p-4">
            <div className="font-semibold mb-2">Resources</div>
            <div className="text-sm">Total headcount (qty sum): {overview.totalResources}</div>
          </div>
        </div>
      )}

      {/* Projects — reformatted widths to prevent cramped overlay */}
      {activeTab === "Projects" && (
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <div className="font-semibold">Projects</div>
            <Button size="sm" onClick={addProject} className="gap-2">
              <Plus className="h-4 w-4" />
              Add Project
            </Button>
          </div>
          <div className="overflow-auto border rounded-lg">
            {/* Wider table to fit long text columns cleanly */}
            <table className="min-w-[2200px] text-sm">
              <colgroup>
                <col width={110} />
                <col width={260} />
                <col width={130} />
                <col width={110} />
                <col width={170} />
                <col width={130} />
                <col width={130} />
                <col width={100} />
                <col width={260} />
                <col width={300} />
                <col width={60} />
                <col width={60} />
                <col width={60} />
                <col width={60} />
                <col width={220} />
                <col width={220} />
                <col width={180} />
                <col width={140} />
                <col width={140} />
                <col width={120} />
                <col width={160} />
                <col width={90} />
                <col width={120} />
                <col width={110} />
                <col width={80} />
              </colgroup>
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  {[
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
                    "",
                  ].map((h) => (
                    <th key={h} className="text-left px-2 py-2 border-b">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {projects.map((row, i) => (
                  <tr key={i} className="border-b align-top">
                    {row.map((cell: any, j: number) => (
                      <td key={j} className="px-2 py-1">
                        {j === 5 || j === 6 ? (
                          <input
                            type="date"
                            className="w-full border rounded px-2 py-1"
                            value={String(cell || "").slice(0, 10)}
                            onChange={(e) => editProject(i, j, e.target.value)}
                          />
                        ) : j === 17 || j === 18 || j === 19 || j === 23 || j === 7 ? (
                          <input
                            className="w-full border rounded px-2 py-1"
                            type="number"
                            value={cell ?? 0}
                            onChange={(e) => editProject(i, j, Number(e.target.value))}
                          />
                        ) : j === 8 || j === 9 || j === 14 || j === 15 || j === 16 || j === 20 ? (
                          <textarea
                            className="w-full border rounded px-2 py-1 min-h-[44px] resize-none"
                            value={cell ?? ""}
                            onChange={(e) => editProject(i, j, e.target.value)}
                          />
                        ) : (
                          <input
                            className="w-full border rounded px-2 py-1"
                            value={cell ?? ""}
                            onChange={(e) => editProject(i, j, e.target.value)}
                          />
                        )}
                      </td>
                    ))}
                    <td className="px-2 py-1">
                      <Button variant="destructive" size="icon" onClick={() => deleteProject(i)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {!projects.length && (
                  <tr>
                    <td colSpan={25} className="px-3 py-6 text-center text-slate-500">
                      No projects yet. Click “Add Project”.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Manufacturing */}
      {activeTab === "Manufacturing" && (
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <div className="font-semibold">Manufacturing</div>
            <Button size="sm" onClick={addManufacturing} className="gap-2">
              <Plus className="h-4 w-4" />
              Add Process
            </Button>
          </div>
          <div className="overflow-auto border rounded-lg">
            <table className="min-w-[1200px] text-sm">
              <colgroup>
                <col width={260} />
                <col width={90} />
                <col width={90} />
                <col width={90} />
                <col width={110} />
                <col width={220} />
                <col width={140} />
                <col width={140} />
                <col width={140} />
                <col width={60} />
              </colgroup>
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  {["Process", "Time (min)", "Batch Size", "Yield (%)", "Cycle Time (s)", "Equipment", "Type", "Status", "Owner", ""].map((h) => (
                    <th key={h} className="text-left px-2 py-2 border-b">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {manufacturing.map((r, i) => (
                  <tr key={i} className="border-b">
                    {r.map((c: any, j: number) => (
                      <td key={j} className="px-2 py-1">
                        {j === 1 || j === 2 || j === 3 || j === 4 ? (
                          <input
                            type="number"
                            className="w-full border rounded px-2 py-1"
                            value={c ?? 0}
                            onChange={(e) => editManufacturing(i, j, Number(e.target.value))}
                          />
                        ) : j === 0 || j === 5 || j === 6 || j === 7 || j === 8 ? (
                          <input className="w-full border rounded px-2 py-1" value={c ?? ""} onChange={(e) => editManufacturing(i, j, e.target.value)} />
                        ) : (
                          <input className="w-full border rounded px-2 py-1" value={c ?? ""} onChange={(e) => editManufacturing(i, j, e.target.value)} />
                        )}
                      </td>
                    ))}
                    <td className="px-2 py-1">
                      <Button variant="destructive" size="icon" onClick={() => deleteManufacturing(i)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {!manufacturing.length && (
                  <tr>
                    <td colSpan={10} className="px-3 py-6 text-center text-slate-500">
                      No processes. Click “Add Process”.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Resources */}
      {activeTab === "Resources" && (
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <div className="font-semibold">Resources</div>
            <Button size="sm" onClick={addResource} className="gap-2">
              <Plus className="h-4 w-4" />
              Add Resource
            </Button>
          </div>
          <div className="overflow-auto border rounded-lg">
            <table className="min-w-[1100px] text-sm">
              <colgroup>
                <col width={260} />
                <col width={140} />
                <col width={100} />
                <col width={120} />
                <col width={180} />
                <col width={300} />
                <col width={60} />
              </colgroup>
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  {["Resource", "Type", "Qty", "Cost", "Department", "Notes", ""].map((h) => (
                    <th key={h} className="text-left px-2 py-2 border-b">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {resources.map((r, i) => (
                  <tr key={i} className="border-b">
                    {r.map((c: any, j: number) => (
                      <td key={j} className="px-2 py-1">
                        {j === 2 || j === 3 ? (
                          <input type="number" className="w-full border rounded px-2 py-1" value={c ?? 0} onChange={(e) => editResource(i, j, Number(e.target.value))} />
                        ) : j === 5 ? (
                          <textarea className="w-full border rounded px-2 py-1 min-h-[40px] resize-none" value={c ?? ""} onChange={(e) => editResource(i, j, e.target.value)} />
                        ) : (
                          <input className="w-full border rounded px-2 py-1" value={c ?? ""} onChange={(e) => editResource(i, j, e.target.value)} />
                        )}
                      </td>
                    ))}
                    <td className="px-2 py-1">
                      <Button variant="destructive" size="icon" onClick={() => deleteResource(i)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {!resources.length && (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                      No resources. Click “Add Resource”.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Risks */}
      {activeTab === "Risks" && (
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <div className="font-semibold">Risks</div>
            <Button size="sm" onClick={addRisk} className="gap-2">
              <Plus className="h-4 w-4" />
              Add Risk
            </Button>
          </div>
          <div className="overflow-auto border rounded-lg">
            <table className="min-w-[1300px] text-sm">
              <colgroup>
                <col width={110} />
                <col width={360} />
                <col width={90} />
                <col width={90} />
                <col width={360} />
                <col width={160} />
                <col width={140} />
                <col width={120} />
                <col width={60} />
              </colgroup>
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  {["id", "risk", "impact", "prob", "mitigation", "owner", "due", "status", ""].map((h) => (
                    <th key={h} className="text-left px-2 py-2 border-b">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {risks.map((r, i) => (
                  <tr key={i} className="border-b align-top">
                    {r.map((c: any, j: number) => (
                      <td key={j} className="px-2 py-1">
                        {j === 6 ? (
                          <input type="date" className="w-full border rounded px-2 py-1" value={String(c || "").slice(0, 10)} onChange={(e) => editRisk(i, j, e.target.value)} />
                        ) : j === 1 || j === 4 ? (
                          <textarea className="w-full border rounded px-2 py-1 min-h-[40px] resize-none" value={c ?? ""} onChange={(e) => editRisk(i, j, e.target.value)} />
                        ) : (
                          <input className="w-full border rounded px-2 py-1" value={c ?? ""} onChange={(e) => editRisk(i, j, e.target.value)} />
                        )}
                      </td>
                    ))}
                    <td className="px-2 py-1">
                      <Button variant="destructive" size="icon" onClick={() => deleteRisk(i)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {!risks.length && (
                  <tr>
                    <td colSpan={9} className="px-3 py-6 text-center text-slate-500">
                      No risks. Click “Add Risk”.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Meetings — restored popup modal for scheduling/agenda/notes + exports */}
      {activeTab === "Meetings" && (
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <div className="font-semibold">Project Meetings</div>
            <Button size="sm" onClick={addMeeting} className="gap-2">
              <Plus className="h-4 w-4" />
              Schedule Meeting
            </Button>
          </div>
          <div className="overflow-auto border rounded-lg">
            <table className="min-w-[1500px] text-sm">
              <colgroup>
                <col width={260} />
                <col width={120} />
                <col width={100} />
                <col width={100} />
                <col width={240} />
                <col width={180} />
                <col width={140} />
                <col width={260} />
                <col width={320} />
                <col width={140} />
                <col width={60} />
              </colgroup>
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  {["Title", "Date", "Time", "Duration", "Attendees", "Location", "Status", "Agenda", "Notes", "Actions", ""].map((h) => (
                    <th key={h} className="text-left px-2 py-2 border-b">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {meetings.map((r, i) => (
                  <tr key={i} className="border-b align-top">
                    {r.map((c: any, j: number) => (
                      <td key={j} className="px-2 py-1">
                        {j === 1 ? (
                          <input type="date" className="w-full border rounded px-2 py-1" value={String(c || "").slice(0, 10)} onChange={(e) => editInlineMeeting(i, j, e.target.value)} />
                        ) : j === 7 || j === 8 ? (
                          <textarea className="w-full border rounded px-2 py-1 min-h-[48px] resize-none" value={c ?? ""} onChange={(e) => editInlineMeeting(i, j, e.target.value)} />
                        ) : (
                          <input className="w-full border rounded px-2 py-1" value={c ?? ""} onChange={(e) => editInlineMeeting(i, j, e.target.value)} />
                        )}
                      </td>
                    ))}
                    <td className="px-2 py-1 whitespace-nowrap">
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => openMeetingModal(i)} className="gap-1">
                          <Pencil className="h-4 w-4" /> Edit
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => exportMeetingPDF(meetings[i])} className="gap-1">
                          <FileText className="h-4 w-4" /> PDF
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => exportMeetingICS(meetings[i])}>
                          ICS
                        </Button>
                      </div>
                    </td>
                    <td className="px-2 py-1">
                      <Button variant="destructive" size="icon" onClick={() => deleteMeeting(i)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {!meetings.length && (
                  <tr>
                    <td colSpan={11} className="px-3 py-6 text-center text-slate-500">
                      No meetings. Click “Schedule Meeting”.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Modal */}
          {meetingModalOpen && (
            <div className="fixed inset-0 z-50">
              <div className="absolute inset-0 bg-black/40" onClick={() => setMeetingModalOpen(false)} />
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-xl w-[800px] max-w-[95vw]">
                <div className="p-5 border-b font-semibold">{meetingIdx === null ? "Schedule Meeting" : "Edit Meeting"}</div>
                <div className="p-5 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <label className="text-sm">
                      Title
                      <input
                        className="w-full border rounded px-2 py-1 mt-1"
                        value={meetingDraft[0] || ""}
                        onChange={(e) => setMeetingDraft((d) => Object.assign([...d], { 0: e.target.value }))}
                      />
                    </label>
                    <label className="text-sm">
                      Date
                      <input
                        type="date"
                        className="w-full border rounded px-2 py-1 mt-1"
                        value={String(meetingDraft[1] || "").slice(0, 10)}
                        onChange={(e) => setMeetingDraft((d) => Object.assign([...d], { 1: e.target.value }))}
                      />
                    </label>
                    <label className="text-sm">
                      Time
                      <input
                        className="w-full border rounded px-2 py-1 mt-1"
                        value={meetingDraft[2] || ""}
                        onChange={(e) => setMeetingDraft((d) => Object.assign([...d], { 2: e.target.value }))}
                      />
                    </label>
                    <label className="text-sm">
                      Duration
                      <input
                        className="w-full border rounded px-2 py-1 mt-1"
                        value={meetingDraft[3] || ""}
                        onChange={(e) => setMeetingDraft((d) => Object.assign([...d], { 3: e.target.value }))}
                      />
                    </label>
                    <label className="text-sm">
                      Attendees
                      <input
                        className="w-full border rounded px-2 py-1 mt-1"
                        value={meetingDraft[4] || ""}
                        onChange={(e) => setMeetingDraft((d) => Object.assign([...d], { 4: e.target.value }))}
                      />
                    </label>
                    <label className="text-sm">
                      Location
                      <input
                        className="w-full border rounded px-2 py-1 mt-1"
                        value={meetingDraft[5] || ""}
                        onChange={(e) => setMeetingDraft((d) => Object.assign([...d], { 5: e.target.value }))}
                      />
                    </label>
                    <label className="text-sm col-span-2">
                      Status
                      <input
                        className="w-full border rounded px-2 py-1 mt-1"
                        value={meetingDraft[6] || ""}
                        onChange={(e) => setMeetingDraft((d) => Object.assign([...d], { 6: e.target.value }))}
                      />
                    </label>
                  </div>
                  <label className="text-sm block">
                    Agenda
                    <textarea
                      className="w-full border rounded px-2 py-2 mt-1 min-h-[90px] resize-none"
                      value={meetingDraft[7] || ""}
                      onChange={(e) => setMeetingDraft((d) => Object.assign([...d], { 7: e.target.value }))}
                    />
                  </label>
                  <label className="text-sm block">
                    Notes
                    <textarea
                      className="w-full border rounded px-2 py-2 mt-1 min-h-[120px] resize-none"
                      value={meetingDraft[8] || ""}
                      onChange={(e) => setMeetingDraft((d) => Object.assign([...d], { 8: e.target.value }))}
                    />
                  </label>
                </div>
                <div className="p-4 border-t flex justify-between">
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => exportMeetingPDF(meetingDraft)} className="gap-2">
                      <FileText className="h-4 w-4" />
                      Export PDF
                    </Button>
                    <Button variant="outline" onClick={() => exportMeetingICS(meetingDraft)}>
                      Export ICS
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setMeetingModalOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={saveMeetingFromModal}>Save Meeting</Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* KPIs */}
      {activeTab === "KPIs" && (
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <div className="font-semibold">KPIs</div>
            <Button size="sm" onClick={addKPI} className="gap-2">
              <Plus className="h-4 w-4" />
              Add KPI
            </Button>
          </div>
          <div className="overflow-auto border rounded-lg">
            <table className="min-w-[1000px] text-sm">
              <colgroup>
                <col width={300} />
                <col width={140} />
                <col width={140} />
                <col width={100} />
                <col width={220} />
                <col width={60} />
              </colgroup>
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  {["Name", "Current Value", "Target Value", "Unit", "Owner", ""].map((h) => (
                    <th key={h} className="text-left px-2 py-2 border-b">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {kpis.map((k) => (
                  <tr key={k.id} className="border-b">
                    <td className="px-2 py-1">
                      <input className="w-full border rounded px-2 py-1" value={k.name} onChange={(e) => editKPI(k.id, "name", e.target.value)} />
                    </td>
                    <td className="px-2 py-1">
                      <input type="number" className="w-full border rounded px-2 py-1" value={k.current_value} onChange={(e) => editKPI(k.id, "current_value", Number(e.target.value))} />
                    </td>
                    <td className="px-2 py-1">
                      <input type="number" className="w-full border rounded px-2 py-1" value={k.target_value} onChange={(e) => editKPI(k.id, "target_value", Number(e.target.value))} />
                    </td>
                    <td className="px-2 py-1">
                      <input className="w-full border rounded px-2 py-1" value={k.unit} onChange={(e) => editKPI(k.id, "unit", e.target.value)} />
                    </td>
                    <td className="px-2 py-1">
                      <input className="w-full border rounded px-2 py-1" value={k.owner} onChange={(e) => editKPI(k.id, "owner", e.target.value)} />
                    </td>
                    <td className="px-2 py-1">
                      <Button variant="destructive" size="icon" onClick={() => deleteKPI(k.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {!kpis.length && (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                      No KPIs. Click “Add KPI”.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Financials */}
      {activeTab === "Financials" && (
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <div className="font-semibold">Financials</div>
            <Button size="sm" onClick={addFinancial} className="gap-2">
              <Plus className="h-4 w-4" />
              Add Row
            </Button>
          </div>
          <div className="overflow-auto border rounded-lg">
            <table className="min-w-[1100px] text-sm">
              <colgroup>
                <col width={180} />
                <col width={320} />
                <col width={120} />
                <col width={160} />
                <col width={320} />
                <col width={60} />
              </colgroup>
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  {["Category", "Item", "Amount", "Type", "Notes", ""].map((h) => (
                    <th key={h} className="text-left px-2 py-2 border-b">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {financials.map((r, i) => (
                  <tr key={i} className="border-b">
                    {r.map((c: any, j: number) => (
                      <td key={j} className="px-2 py-1">
                        {j === 2 ? (
                          <input type="number" className="w-full border rounded px-2 py-1" value={c ?? 0} onChange={(e) => editFinancial(i, j, Number(e.target.value))} />
                        ) : j === 4 ? (
                          <textarea className="w-full border rounded px-2 py-1 min-h-[40px] resize-none" value={c ?? ""} onChange={(e) => editFinancial(i, j, e.target.value)} />
                        ) : (
                          <input className="w-full border rounded px-2 py-1" value={c ?? ""} onChange={(e) => editFinancial(i, j, e.target.value)} />
                        )}
                      </td>
                    ))}
                    <td className="px-2 py-1">
                      <Button variant="destructive" size="icon" onClick={() => deleteFinancial(i)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {!financials.length && (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                      No financial rows. Click “Add Row”.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Glossary */}
      {activeTab === "Glossary" && (
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <div className="font-semibold">Glossary</div>
            <Button size="sm" onClick={addGlossary} className="gap-2">
              <Plus className="h-4 w-4" />
              Add Term
            </Button>
          </div>
          <div className="overflow-auto border rounded-lg">
            <table className="min-w-[1000px] text-sm">
              <colgroup>
                <col width={280} />
                <col width={680} />
                <col width={60} />
              </colgroup>
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  {["Term", "Definition", ""].map((h) => (
                    <th key={h} className="text-left px-2 py-2 border-b">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {glossary.map((r, i) => (
                  <tr key={i} className="border-b">
                    <td className="px-2 py-1">
                      <input className="w-full border rounded px-2 py-1" value={r?.[0] ?? ""} onChange={(e) => editGlossary(i, 0, e.target.value)} />
                    </td>
                    <td className="px-2 py-1">
                      <textarea className="w-full border rounded px-2 py-1 min-h-[40px] resize-none" value={r?.[1] ?? ""} onChange={(e) => editGlossary(i, 1, e.target.value)} />
                    </td>
                    <td className="px-2 py-1">
                      <Button variant="destructive" size="icon" onClick={() => deleteGlossary(i)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {!glossary.length && (
                  <tr>
                    <td colSpan={3} className="px-3 py-6 text-center text-slate-500">
                      No terms. Click “Add Term”.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Config */}
      {activeTab === "Config" && (
        <div className="space-y-4">
          <div className="font-semibold">Configuration</div>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="border rounded-lg p-4 space-y-3">
              <div className="text-sm text-slate-600">Scenario settings ({scenario})</div>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm">
                  Units/year
                  <input
                    type="number"
                    className="w-full border rounded px-2 py-1 mt-1"
                    value={scenarioCfg.unitsPerYear}
                    onChange={(e) =>
                      setPlan((prev: any) => ({
                        ...prev,
                        scenarios: { ...prev.scenarios, [scenario]: { ...prev.scenarios[scenario], unitsPerYear: Number(e.target.value) } },
                      }))
                    }
                  />
                </label>
                <label className="text-sm">
                  Hours/day
                  <input
                    type="number"
                    className="w-full border rounded px-2 py-1 mt-1"
                    value={scenarioCfg.hoursPerDay}
                    onChange={(e) =>
                      setPlan((prev: any) => ({
                        ...prev,
                        scenarios: { ...prev.scenarios, [scenario]: { ...prev.scenarios[scenario], hoursPerDay: Number(e.target.value) } },
                      }))
                    }
                  />
                </label>
                <label className="text-sm">
                  Shifts
                  <input
                    type="number"
                    className="w-full border rounded px-2 py-1 mt-1"
                    value={scenarioCfg.shifts}
                    onChange={(e) =>
                      setPlan((prev: any) => ({
                        ...prev,
                        scenarios: { ...prev.scenarios, [scenario]: { ...prev.scenarios[scenario], shifts: Number(e.target.value) } },
                      }))
                    }
                  />
                </label>
              </div>
            </div>
            <div className="border rounded-lg p-4">
              <div className="text-sm text-slate-600 mb-2">Actions</div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={saveAll} className="gap-2">
                  <Save className="h-4 w-4" />
                  Save now
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (confirm("Reset to seed plan? This will overwrite local, unsaved edits.")) {
                      const p = clone(SEED_PLAN);
                      setPlan(p);
                      setProjects([]);
                      setManufacturing([]);
                      setResources([]);
                      setRisks([]);
                      setMeetings([]);
                      setKpis([]);
                      setFinancials([]);
                      setGlossary([]);
                    }
                  }}
                >
                  Reset to seed
                </Button>
              </div>
            </div>
          </div>
          {error && <div className="text-red-600 text-sm">Error: {error}</div>}
        </div>
      )}
    </div>
  );
}
