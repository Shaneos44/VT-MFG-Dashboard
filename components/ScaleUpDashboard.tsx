"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, Trash2, FileText, X, Save } from "lucide-react";
import { clone, SEED_PLAN } from "@/lib/constants";
import AutoTextarea from "@/components/AutoTextarea";
import OverviewPanel from "@/components/OverviewPanel";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

type VariantName = "Recess Nanodispensing" | "Dipcoating" | string;
type AnyRow = any[];

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

export default function ScaleUpDashboard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [scenario, setScenario] = useState<"50k" | "200k">("50k");
  const [variant, setVariant] = useState<VariantName>("Recess Nanodispensing");

  const [plan, setPlan] = useState<any>(() => {
    const p = clone(SEED_PLAN) || {};
    if (!p.scenarios) {
      p.scenarios = {
        "50k": { unitsPerYear: 50000, hoursPerDay: 8, shifts: 1 },
        "200k": { unitsPerYear: 200000, hoursPerDay: 16, shifts: 2 },
      };
    }
    if (!p.products) p.products = {};
    for (const sc of ["50k", "200k"] as const) {
      p.products[sc] = p.products[sc] || {
        projects: [],
        processes: [],
        capex50k: [],
        capex200k: [],
        opex50k: [],
        opex200k: [],
        resources: [],
        risks: [],
        meetings: [],
        manufacturing: [],
        launch: { fiftyK: new Date().toISOString(), twoHundredK: new Date().toISOString() },
      };
    }
    if (!Array.isArray(p.kpis)) {
      p.kpis = [
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
      ];
    }
    if (!Array.isArray(p.glossary)) {
      p.glossary = [
        ["IHCL", "Ion-Implanted Hydrophilic Coating Layer - Surface treatment process"],
        ["OCP", "Open Circuit Potential - Electrochemical measurement technique"],
      ];
    }
    if (typeof p.bufferPct !== "number") p.bufferPct = 0.15;
    return p;
  });

  const autoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queueSave = useCallback(() => {
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    autoSaveRef.current = setTimeout(() => {
      void saveProjectDataToDatabase();
    }, 1200);
  }, []);

  const currentVariantData = useMemo(() => {
    const base = plan?.products?.[scenario] || {
      projects: [],
      processes: [],
      capex50k: [],
      capex200k: [],
      opex50k: [],
      opex200k: [],
      resources: [],
      risks: [],
      meetings: [],
      manufacturing: [],
      launch: { fiftyK: new Date().toISOString(), twoHundredK: new Date().toISOString() },
    };

    return {
      ...base,
      projectsCount: Array.isArray(base.projects) ? base.projects.length : 0,
      processesCount: Array.isArray(base.processes) ? base.processes.length : 0,
      manufacturingCount: Array.isArray(base.manufacturing) ? base.manufacturing.length : 0,
      resourcesCount: Array.isArray(base.resources) ? base.resources.length : 0,
      risksCount: Array.isArray(base.risks) ? base.risks.length : 0,
    };
  }, [plan, scenario]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);

        const r = await fetch("/api/configurations", { method: "GET" });
        if (!r.ok) {
          if (r.status !== 401) {
            try {
              const data = await r.json();
              setError(data?.error || `Load failed (${r.status})`);
            } catch {
              setError(`Load failed (${r.status})`);
            }
          }
          return;
        }
        const rows = await r.json();
        const cfg =
          rows.find((x: any) => x.name === "ScaleUp-Dashboard-Config") ||
          rows
            .filter((x: any) => x?.data?.plan)
            .sort((a: any, b: any) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0];

        if (cfg?.data && !cancelled) {
          const { plan: p, scenario: sc, variant: v } = cfg.data;
          if (p) setPlan(p);
          if (sc) setScenario(sc);
          if (v) setVariant(v);
        }
      } catch (e: any) {
        setError(e?.message || "Failed to load data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (loading) return;
    queueSave();
  }, [plan, scenario, variant, loading, queueSave]);

  const saveProjectDataToDatabase = useCallback(async () => {
    try {
      setSaving(true);
      const payload = {
        name: "ScaleUp-Dashboard-Config",
        description: "ScaleUp Dashboard Configuration",
        data: { plan, scenario, variant },
        modified_by: "user",
        upsert: true,
      };
      const r = await fetch("/api/configurations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok && r.status !== 401) {
        try {
          const data = await r.json();
          setError(data?.error || `Save failed (${r.status})`);
        } catch {
          setError(`Save failed (${r.status})`);
        }
      }
    } catch (e: any) {
      setError(e?.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  }, [plan, scenario, variant]);

  const tabs = [
    "Overview",
    "Projects",
    "Manufacturing",
    "Resources",
    "Risks",
    "Meetings",
    "KPIs",
    "Financials",
    "Glossary",
    "Config",
  ] as const;
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>("Overview");

  const getProjects = (): AnyRow[] => (currentVariantData?.projects || []) as AnyRow[];
  const setProjects = (rows: AnyRow[]) => {
    setPlan((prev: any) => ({
      ...prev,
      products: {
        ...prev.products,
        [scenario]: { ...prev.products[scenario], projects: rows },
      },
    }));
  };
  const updateProjectCell = (rowIndex: number, colIndex: number, value: any) => {
    const rows = [...getProjects()];
    if (!rows[rowIndex]) return;
    rows[rowIndex] = [...rows[rowIndex]];
    rows[rowIndex][colIndex] = value;
    setProjects(rows);
  };
  const addProject = () => {
    const rows = [...getProjects()];
    rows.unshift([
      `PROJ-${Date.now()}`,
      "New Project",
      "Planning",
      "Must",
      "Owner",
      new Date().toISOString().split("T")[0],
      new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
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
    ]);
    setProjects(rows);
  };
  const deleteProject = (rowIndex: number) => {
    const rows = [...getProjects()];
    rows.splice(rowIndex, 1);
    setProjects(rows);
  };

  const getProcesses = (): AnyRow[] => (currentVariantData?.processes || []) as AnyRow[];
  const setProcesses = (rows: AnyRow[]) => {
    setPlan((prev: any) => ({
      ...prev,
      products: { ...prev.products, [scenario]: { ...prev.products[scenario], processes: rows } },
    }));
  };
  const updateProcessCell = (rowIndex: number, colIndex: number, value: any) => {
    const rows = [...getProcesses()];
    if (!rows[rowIndex]) return;
    rows[rowIndex] = [...rows[rowIndex]];
    rows[rowIndex][colIndex] = value;
    setProcesses(rows);
  };
  const addProcess = () => {
    const rows = [...getProcesses()];
    rows.unshift(["New Process", 0, 1, 100, 0, "Equipment", "Manual", "Planning", "Owner"]);
    setProcesses(rows);
  };
  const deleteProcess = (rowIndex: number) => {
    const rows = [...getProcesses()];
    rows.splice(rowIndex, 1);
    setProcesses(rows);
  };

  const getResources = (): AnyRow[] => (currentVariantData?.resources || []) as AnyRow[];
  const setResources = (rows: AnyRow[]) => {
    setPlan((prev: any) => ({
      ...prev,
      products: { ...prev.products, [scenario]: { ...prev.products[scenario], resources: rows } },
    }));
  };
  const updateResourceCell = (rowIndex: number, colIndex: number, value: any) => {
    const rows = [...getResources()];
    if (!rows[rowIndex]) return;
    rows[rowIndex] = [...rows[rowIndex]];
    rows[rowIndex][colIndex] = value;
    setResources(rows);
  };
  const addResource = () => {
    const rows = [...getResources()];
    rows.unshift(["New Resource", "Personnel", 1, 0, "Department", "Notes"]);
    setResources(rows);
  };
  const deleteResource = (rowIndex: number) => {
    const rows = [...getResources()];
    rows.splice(rowIndex, 1);
    setResources(rows);
  };

  const getRisks = (): AnyRow[] => (currentVariantData?.risks || []) as AnyRow[];
  const setRisks = (rows: AnyRow[]) => {
    setPlan((prev: any) => ({
      ...prev,
      products: { ...prev.products, [scenario]: { ...prev.products[scenario], risks: rows } },
    }));
  };
  const updateRiskCell = (rowIndex: number, colIndex: number, value: any) => {
    const rows = [...getRisks()];
    if (!rows[rowIndex]) return;
    rows[rowIndex] = [...rows[rowIndex]];
    rows[rowIndex][colIndex] = value;
    setRisks(rows);
  };
  const addRisk = () => {
    const rows = [...getRisks()];
    rows.unshift([`RISK-${Date.now()}`, "New Risk", "M", "M", "Mitigation", "Owner", new Date().toISOString().split("T")[0], "Open"]);
    setRisks(rows);
  };
  const deleteRisk = (rowIndex: number) => {
    const rows = [...getRisks()];
    rows.splice(rowIndex, 1);
    setRisks(rows);
  };

  const getMeetings = (): AnyRow[] => (currentVariantData?.meetings || []) as AnyRow[];
  const setMeetings = (rows: AnyRow[]) => {
    setPlan((prev: any) => ({
      ...prev,
      products: { ...prev.products, [scenario]: { ...prev.products[scenario], meetings: rows } },
    }));
  };
  const addMeetingRow = () => {
    const rows = [...getMeetings()];
    rows.unshift([
      `MEET-${Date.now()}`,
      "New Meeting",
      new Date().toISOString().split("T")[0],
      "10:00",
      "60 min",
      "Team",
      "Location",
      "Scheduled",
      "Agenda items here",
      "Meeting objectives",
      "Notes / minutes here",
      "Attendee1, Attendee2",
    ]);
    setMeetings(rows);
  };
  const updateMeetingCell = (rowIndex: number, colIndex: number, value: any) => {
    const rows = [...getMeetings()];
    if (!rows[rowIndex]) return;
    rows[rowIndex] = [...rows[rowIndex]];
    rows[rowIndex][colIndex] = value;
    setMeetings(rows);
  };
  const deleteMeeting = (rowIndex: number) => {
    const rows = [...getMeetings()];
    rows.splice(rowIndex, 1);
    setMeetings(rows);
  };

  const getCapexRows = (): AnyRow[] =>
    (scenario === "50k" ? currentVariantData.capex50k : currentVariantData.capex200k) || [];
  const setCapexRows = (rows: AnyRow[]) => {
    setPlan((prev: any) => ({
      ...prev,
      products: {
        ...prev.products,
        [scenario]: {
          ...prev.products[scenario],
          ...(scenario === "50k" ? { capex50k: rows } : { capex200k: rows }),
        },
      },
    }));
  };
  const updateCapexCell = (rowIndex: number, colIndex: number, value: any) => {
    const rows = [...getCapexRows()];
    if (!rows[rowIndex]) return;
    rows[rowIndex] = [...rows[rowIndex]];
    rows[rowIndex][colIndex] = value;
    setCapexRows(rows);
  };
  const addCapex = () => {
    const rows = [...getCapexRows()];
    rows.unshift(["Item", 1, 0, 0]);
    setCapexRows(rows);
  };
  const deleteCapex = (rowIndex: number) => {
    const rows = [...getCapexRows()];
    rows.splice(rowIndex, 1);
    setCapexRows(rows);
  };

  const getOpexRows = (): AnyRow[] =>
    (scenario === "50k" ? currentVariantData.opex50k : currentVariantData.opex200k) || [];
  const setOpexRows = (rows: AnyRow[]) => {
    setPlan((prev: any) => ({
      ...prev,
      products: {
        ...prev.products,
        [scenario]: {
          ...prev.products[scenario],
          ...(scenario === "50k" ? { opex50k: rows } : { opex200k: rows }),
        },
      },
    }));
  };
  const updateOpexCell = (rowIndex: number, colIndex: number, value: any) => {
    const rows = [...getOpexRows()];
    if (!rows[rowIndex]) return;
    rows[rowIndex] = [...rows[rowIndex]];
    rows[rowIndex][colIndex] = value;
    setOpexRows(rows);
  };
  const addOpex = () => {
    const rows = [...getOpexRows()];
    rows.unshift(["Line item", "per_unit", 1, 0]);
    setOpexRows(rows);
  };
  const deleteOpex = (rowIndex: number) => {
    const rows = [...getOpexRows()];
    rows.splice(rowIndex, 1);
    setOpexRows(rows);
  };

  const getKpis = (): KPI[] => (Array.isArray(plan?.kpis) ? plan.kpis : []) as KPI[];
  const setKpis = (rows: KPI[]) => {
    setPlan((prev: any) => ({ ...prev, kpis: rows }));
  };
  const addKpi = () => {
    const rows = [...getKpis()];
    rows.unshift({
      id: `kpi-${Date.now()}`,
      scenario_id: `scenario-${scenario}`,
      name: "New KPI",
      target_value: 100,
      current_value: 0,
      unit: "%",
      owner: "Owner",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    setKpis(rows);
  };
  const deleteKpi = (id: string) => {
    const rows = getKpis().filter((k) => k.id !== id);
    setKpis(rows);
  };
  const updateKpi = (id: string, patch: Partial<KPI>) => {
    const rows = getKpis().map((k) => (k.id === id ? { ...k, ...patch, updated_at: new Date().toISOString() } : k));
    setKpis(rows);
  };

  const getGlossary = (): AnyRow[] => (Array.isArray(plan?.glossary) ? plan.glossary : []);
  const setGlossary = (rows: AnyRow[]) => setPlan((prev: any) => ({ ...prev, glossary: rows }));
  const addGlossary = () => {
    const rows = [...getGlossary()];
    rows.unshift(["New Term", "Definition"]);
    setGlossary(rows);
  };
  const deleteGlossary = (rowIndex: number) => {
    const rows = [...getGlossary()];
    rows.splice(rowIndex, 1);
    setGlossary(rows);
  };
  const updateGlossaryCell = (rowIndex: number, colIndex: number, value: any) => {
    const rows = [...getGlossary()];
    if (!rows[rowIndex]) return;
    rows[rowIndex] = [...rows[rowIndex]];
    rows[rowIndex][colIndex] = value;
    setGlossary(rows);
  };

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
    const row = getMeetings()[rowIndex] || [];
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
    const rows = [...getMeetings()];
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
    setMeetings(rows);
    setShowMeetingModal(false);
    setEditingMeetingIndex(null);
  };

  const exportMeetingSummary = (rowIndex: number) => {
    const row = getMeetings()[rowIndex] || [];
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

  function sumCapexTotal(rows: AnyRow[]): number {
    return rows.reduce((sum, r) => {
      const qty = Number(r?.[1]) || 0;
      const unit = Number(r?.[2]) || 0;
      const install = Number(r?.[3]) || 0;
      return sum + qty * unit + install;
    }, 0);
  }

  function sumOpexTotal(rows: AnyRow[]): number {
    return rows.reduce((sum, r) => {
      const qty = Number(r?.[2]) || 0;
      const unit = Number(r?.[3]) || 0;
      return sum + qty * unit;
    }, 0);
  }

  const generateCEOReportPDF = () => {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const left = 40;
    let y = 56;

    const projects = getProjects();
    const processes = getProcesses();
    const risks = getRisks();
    const kpis = getKpis();

    const capexRows = scenario === "50k" ? currentVariantData.capex50k || [] : currentVariantData.capex200k || [];
    const opexRows = scenario === "50k" ? currentVariantData.opex50k || [] : currentVariantData.opex200k || [];

    const capexTotal = sumCapexTotal(capexRows);
    const opexTotal = sumOpexTotal(opexRows);

    const sc = plan?.scenarios?.[scenario] || { unitsPerYear: scenario === "50k" ? 50000 : 200000, hoursPerDay: 8, shifts: 1 };
    const pricePerUnit = 45;
    const revenue = (sc.unitsPerYear || 0) * pricePerUnit;
    const cpu = sc.unitsPerYear ? opexTotal / sc.unitsPerYear : 0;
    const grossProfit = revenue - (capexTotal + opexTotal);
    const marginPct = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

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
        ? kpis.reduce((acc, k) => acc + (k.target_value ? (k.current_value / k.target_value) * 100 : 0), 0) / kpis.length
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
        ["CapEx Total (USD)", `$${capexTotal.toLocaleString()}`],
        ["OpEx Total (USD)", `$${opexTotal.toLocaleString()}`],
        ["Cost / Unit (OpEx only)", `$${cpu.toFixed(2)}`],
        ["Revenue (USD, est.)", `$${revenue.toLocaleString()}`],
        ["Gross Profit (USD, est.)", `$${grossProfit.toLocaleString()}`],
        ["Profit Margin (%)", `${marginPct.toFixed(1)}%`],
        ["Projects — Total / Completed / On-Track / At-Risk", `${totalProjects} / ${completedProjects} / ${onTrack} / ${atRisk}`],
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

  const [showMeetingModal, setShowMeetingModalState] = useState(false); // to keep TS happy if shadowed (noop)

  if (loading) {
    return (
      <div className="min-h-[50vh] grid place-items-center">
        <div className="flex items-center gap-2 text-slate-600">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading your dashboard…</span>
        </div>
      </div>
    );
  }

  const projectHeaders = [
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
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Scale-Up Dashboard</h1>
          <p className="text-sm text-slate-500">
            Variant:&nbsp;
            <select
              className="rounded-md border bg-background px-2 py-1 text-sm"
              value={variant}
              onChange={(e) => setVariant(e.target.value)}
            >
              <option>Recess Nanodispensing</option>
              <option>Dipcoating</option>
            </select>
            &nbsp;• Scenario:&nbsp;
            <select
              className="rounded-md border bg-background px-2 py-1 text-sm"
              value={scenario}
              onChange={(e) => setScenario(e.target.value as any)}
            >
              <option value="50k">50k</option>
              <option value="200k">200k</option>
            </select>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => saveProjectDataToDatabase()} className="gap-2">
            <Save className="h-4 w-4" /> Save now
          </Button>
          <Button onClick={generateCEOReportPDF} className="gap-2">
            <FileText className="h-4 w-4" />
            CEO Summary
          </Button>
          {saving ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
            </span>
          ) : (
            <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs text-emerald-700">All changes saved</span>
          )}
          {error ? <span className="rounded-md bg-rose-50 px-2 py-1 text-xs text-rose-600">Error: {error}</span> : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`rounded-full border px-3 py-1 text-sm ${
              activeTab === t ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border p-4 shadow-sm">
        {activeTab === "Overview" && (
          <OverviewPanel
            scenario={scenario}
            variant={variant}
            projects={currentVariantData.projects || []}
            processes={currentVariantData.processes || []}
            capexRows={scenario === "50k" ? currentVariantData.capex50k || [] : currentVariantData.capex200k || []}
            opexRows={scenario === "50k" ? currentVariantData.opex50k || [] : currentVariantData.opex200k || []}
            kpis={getKpis()}
            planScenarios={plan?.scenarios}
          />
        )}

        {activeTab === "Projects" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium">Projects</h2>
              <Button onClick={addProject} className="gap-2">
                <Plus className="h-4 w-4" /> Add Project
              </Button>
            </div>

            <div className="overflow-x-auto">
              <table className="dashboard-table w-full text-sm">
                <thead>
                  <tr className="text-left">
                    {projectHeaders.map((h) => (
                      <th key={h} className="whitespace-nowrap px-2 py-2 text-slate-600">
                        {h}
                      </th>
                    ))}
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {getProjects().map((row, rIdx) => (
                    <tr key={rIdx} className="border-t align-top">
                      <td className="px-2 py-2 min-w-[120px]">
                        <input
                          className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                          value={row[0] ?? ""}
                          onChange={(e) => updateProjectCell(rIdx, 0, e.target.value)}
                        />
                      </td>
                      <td className="px-2 py-2 min-w-[240px]">
                        <input
                          className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                          value={row[1] ?? ""}
                          onChange={(e) => updateProjectCell(rIdx, 1, e.target.value)}
                        />
                      </td>
                      <td className="px-2 py-2 min-w-[160px]">
                        <input
                          className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                          value={row[2] ?? ""}
                          onChange={(e) => updateProjectCell(rIdx, 2, e.target.value)}
                        />
                      </td>
                      <td className="px-2 py-2 min-w-[120px]">
                        <input
                          className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                          value={row[3] ?? ""}
                          onChange={(e) => updateProjectCell(rIdx, 3, e.target.value)}
                        />
                      </td>
                      <td className="px-2 py-2 min-w-[160px]">
                        <input
                          className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                          value={row[4] ?? ""}
                          onChange={(e) => updateProjectCell(rIdx, 4, e.target.value)}
                        />
                      </td>
                      <td className="px-2 py-2 min-w-[150px]">
                        <input
                          type="date"
                          className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                          value={row[5] ?? ""}
                          onChange={(e) => updateProjectCell(rIdx, 5, e.target.value)}
                        />
                      </td>
                      <td className="px-2 py-2 min-w-[150px]">
                        <input
                          type="date"
                          className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                          value={row[6] ?? ""}
                          onChange={(e) => updateProjectCell(rIdx, 6, e.target.value)}
                        />
                      </td>
                      <td className="px-2 py-2 min-w-[120px]">
                        <input
                          type="number"
                          className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                          value={row[7] ?? 0}
                          onChange={(e) => updateProjectCell(rIdx, 7, Number(e.target.value) || 0)}
                        />
                      </td>
                      <td className="px-2 py-2 min-w-[260px]">
                        <AutoTextarea value={row[8] ?? ""} onChange={(v) => updateProjectCell(rIdx, 8, v)} />
                      </td>
                      <td className="px-2 py-2 min-w-[260px]">
                        <AutoTextarea value={row[9] ?? ""} onChange={(v) => updateProjectCell(rIdx, 9, v)} />
                      </td>
                      <td className="px-2 py-2 min-w-[60px]">
                        <input
                          className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                          value={row[10] ?? ""}
                          onChange={(e) => updateProjectCell(rIdx, 10, e.target.value)}
                        />
                      </td>
                      <td className="px-2 py-2 min-w-[60px]">
                        <input
                          className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                          value={row[11] ?? ""}
                          onChange={(e) => updateProjectCell(rIdx, 11, e.target.value)}
                        />
                      </td>
                      <td className="px-2 py-2 min-w-[60px]">
                        <input
                          className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                          value={row[12] ?? ""}
                          onChange={(e) => updateProjectCell(rIdx, 12, e.target.value)}
                        />
                      </td>
                      <td className="px-2 py-2 min-w-[60px]">
                        <input
                          className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                          value={row[13] ?? ""}
                          onChange={(e) => updateProjectCell(rIdx, 13, e.target.value)}
                        />
                      </td>
                      <td className="px-2 py-2 min-w-[240px]">
                        <AutoTextarea value={row[14] ?? ""} onChange={(v) => updateProjectCell(rIdx, 14, v)} />
                      </td>
                      <td className="px-2 py-2 min-w-[240px]">
                        <AutoTextarea value={row[15] ?? ""} onChange={(v) => updateProjectCell(rIdx, 15, v)} />
                      </td>
                      <td className="px-2 py-2 min-w-[240px]">
                        <AutoTextarea value={row[16] ?? ""} onChange={(v) => updateProjectCell(rIdx, 16, v)} />
                      </td>
                      <td className="px-2 py-2 min-w-[140px]">
                        <input
                          type="number"
                          className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                          value={row[17] ?? 0}
                          onChange={(e) => updateProjectCell(rIdx, 17, Number(e.target.value) || 0)}
                        />
                      </td>
                      <td className="px-2 py-2 min-w-[140px]">
                        <input
                          type="number"
                          className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                          value={row[18] ?? 0}
                          onChange={(e) => updateProjectCell(rIdx, 18, Number(e.target.value) || 0)}
                        />
                      </td>
                      <td className="px-2 py-2 min-w-[140px]">
                        <input
                          type="number"
                          className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                          value={row[19] ?? 0}
                          onChange={(e) => updateProjectCell(rIdx, 19, Number(e.target.value) || 0)}
                        />
                      </td>
                      <td className="px-2 py-2 min-w-[240px]">
                        <AutoTextarea value={row[20] ?? ""} onChange={(v) => updateProjectCell(rIdx, 20, v)} />
                      </td>
                      <td className="px-2 py-2 min-w-[100px]">
                        <input
                          className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                          value={row[21] ?? ""}
                          onChange={(e) => updateProjectCell(rIdx, 21, e.target.value)}
                        />
                      </td>
                      <td className="px-2 py-2 min-w-[120px]">
                        <input
                          className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                          value={row[22] ?? ""}
                          onChange={(e) => updateProjectCell(rIdx, 22, e.target.value)}
                        />
                      </td>
                      <td className="px-2 py-2 min-w-[120px]">
                        <input
                          type="number"
                          className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                          value={row[23] ?? 0}
                          onChange={(e) => updateProjectCell(rIdx, 23, Number(e.target.value) || 0)}
                        />
                      </td>
                      <td className="px-2 py-2 min-w-[64px]">
                        <button
                          onClick={() => deleteProject(rIdx)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-md border hover:bg-rose-50"
                          title="Delete row"
                        >
                          <Trash2 className="h-4 w-4 text-rose-600" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "Manufacturing" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium">Manufacturing Processes</h2>
              <Button onClick={addProcess} className="gap-2">
                <Plus className="h-4 w-4" /> Add Process
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="dashboard-table w-full text-sm">
                <thead>
                  <tr className="text-left">
                    {["name", "ct_min", "batch_size", "yield", "takt_target_s", "equipment_family", "automation_level", "validation_stage", "owner", ""].map(
                      (h) => (
                        <th key={h} className="whitespace-nowrap px-2 py-2 text-slate-600">
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {getProcesses().map((row, rIdx) => (
                    <tr key={rIdx} className="border-t">
                      <td className="px-2 py-2 min-w-[220px]">
                        <input
                          className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                          value={row[0] ?? ""}
                          onChange={(e) => updateProcessCell(rIdx, 0, e.target.value)}
                        />
                      </td>
                      <td className="px-2 py-2 min-w-[120px]">
                        <input
                          type="number"
                          className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                          value={row[1] ?? 0}
                          onChange={(e) => updateProcessCell(rIdx, 1, Number(e.target.value) || 0)}
                        />
                      </td>
                      <td className="px-2 py-2 min-w-[120px]">
                        <input
                          type="number"
                          className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                          value={row[2] ?? 0}
                          onChange={(e) => updateProcessCell(rIdx, 2, Number(e.target.value) || 0)}
                        />
                      </td>
                      <td className="px-2 py-2 min-w-[120px]">
                        <input
                          type="number"
                          className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                          value={row[3] ?? 0}
                          onChange={(e) => updateProcessCell(rIdx, 3, Number(e.target.value) || 0)}
                        />
                      </td>
                      <td className="px-2 py-2 min-w-[140px]">
                        <input
                          type="number"
                          className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                          value={row[4] ?? 0}
                          onChange={(e) => updateProcessCell(rIdx, 4, Number(e.target.value) || 0)}
                        />
                      </td>
                      <td className="px-2 py-2 min-w-[180px]">
                        <input
                          className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                          value={row[5] ?? ""}
                          onChange={(e) => updateProcessCell(rIdx, 5, e.target.value)}
                        />
                      </td>
                      <td className="px-2 py-2 min-w-[160px]">
                        <input
                          className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                          value={row[6] ?? ""}
                          onChange={(e) => updateProcessCell(rIdx, 6, e.target.value)}
                        />
                      </td>
                      <td className="px-2 py-2 min-w-[160px]">
                        <input
                          className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                          value={row[7] ?? ""}
                          onChange={(e) => updateProcessCell(rIdx, 7, e.target.value)}
                        />
                      </td>
                      <td className="px-2 py-2 min-w-[160px]">
                        <input
                          className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                          value={row[8] ?? ""}
                          onChange={(e) => updateProcessCell(rIdx, 8, e.target.value)}
                        />
                      </td>
                      <td className="px-2 py-2 min-w-[64px]">
                        <button
                          onClick={() => deleteProcess(rIdx)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-md border hover:bg-rose-50"
                          title="Delete row"
                        >
                          <Trash2 className="h-4 w-4 text-rose-600" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "Resources" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium">Resources</h2>
              <Button onClick={addResource} className="gap-2">
                <Plus className="h-4 w-4" /> Add Resource
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="dashboard-table w-full text-sm">
                <thead>
                  <tr className="text-left">
                    {["Resource", "Type", "Quantity", "Cost", "Department", "Notes", ""].map((h) => (
                      <th key={h} className="whitespace-nowrap px-2 py-2 text-slate-600">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {getResources().map((row, rIdx) => (
                    <tr key={rIdx} className="border-t">
                      <td className="px-2 py-2 min-w-[220px]">
                        <input
                          className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                          value={row[0] ?? ""}
                          onChange={(e) => updateResourceCell(rIdx, 0, e.target.value)}
                        />
                      </td>
                      <td className="px-2 py-2 min-w-[150px]">
                        <input
                          className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                          value={row[1] ?? ""}
                          onChange={(e) => updateResourceCell(rIdx, 1, e.target.value)}
                        />
                      </td>
                      <td className="px-2 py-2 min-w-[120px]">
                        <input
                          type="number"
                          className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                          value={row[2] ?? 0}
                          onChange={(e) => updateResourceCell(rIdx, 2, Number(e.target.value) || 0)}
                        />
                      </td>
                      <td className="px-2 py-2 min-w-[140px]">
                        <input
                          type="number"
                          className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                          value={row[3] ?? 0}
                          onChange={(e) => updateResourceCell(rIdx, 3, Number(e.target.value) || 0)}
                        />
                      </td>
                      <td className="px-2 py-2 min-w-[180px]">
                        <input
                          className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                          value={row[4] ?? ""}
                          onChange={(e) => updateResourceCell(rIdx, 4, e.target.value)}
                        />
                      </td>
                      <td className="px-2 py-2 min-w-[240px]">
                        <AutoTextarea value={row[5] ?? ""} onChange={(v) => updateResourceCell(rIdx, 5, v)} />
                      </td>
                      <td className="px-2 py-2 min-w-[64px]">
                        <button
                          onClick={() => deleteResource(rIdx)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-md border hover:bg-rose-50"
                          title="Delete row"
                        >
                          <Trash2 className="h-4 w-4 text-rose-600" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "Risks" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium">Risks</h2>
              <Button onClick={addRisk} className="gap-2">
                <Plus className="h-4 w-4" /> Add Risk
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="dashboard-table w-full text-sm">
                <thead>
                  <tr className="text-left">
                    {["id", "risk", "impact", "prob", "mitigation", "owner", "due", "status", ""].map((h) => (
                      <th key={h} className="whitespace-nowrap px-2 py-2 text-slate-600">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {getRisks().map((row, rIdx) => (
                    <tr key={rIdx} className="border-t">
                      <td className="px-2 py-2 min-w-[120px]">
                        <input
                          className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                          value={row[0] ?? ""}
                          onChange={(e) => updateRiskCell(rIdx, 0, e.target.value)}
                        />
                      </td>
                      <td className="px-2 py-2 min-w-[260px]">
                        <AutoTextarea value={row[1] ?? ""} onChange={(v) => updateRiskCell(rIdx, 1, v)} />
                      </td>
                      <td className="px-2 py-2 min-w-[100px]">
                        <input
                          className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                          value={row[2] ?? ""}
                          onChange={(e) => updateRiskCell(rIdx, 2, e.target.value)}
                        />
                      </td>
                      <td className="px-2 py-2 min-w-[100px]">
                        <input
                          className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                          value={row[3] ?? ""}
                          onChange={(e) => updateRiskCell(rIdx, 3, e.target.value)}
                        />
                      </td>
                      <td className="px-2 py-2 min-w-[260px]">
                        <AutoTextarea value={row[4] ?? ""} onChange={(v) => updateRiskCell(rIdx, 4, v)} />
                      </td>
                      <td className="px-2 py-2 min-w-[160px]">
                        <input
                          className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                          value={row[5] ?? ""}
                          onChange={(e) => updateRiskCell(rIdx, 5, e.target.value)}
                        />
                      </td>
                      <td className="px-2 py-2 min-w-[150px]">
                        <input
                          type="date"
                          className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                          value={row[6] ?? ""}
                          onChange={(e) => updateRiskCell(rIdx, 6, e.target.value)}
                        />
                      </td>
                      <td className="px-2 py-2 min-w-[140px]">
                        <input
                          className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                          value={row[7] ?? ""}
                          onChange={(e) => updateRiskCell(rIdx, 7, e.target.value)}
                        />
                      </td>
                      <td className="px-2 py-2 min-w-[64px]">
                        <button
                          onClick={() => deleteRisk(rIdx)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-md border hover:bg-rose-50"
                          title="Delete row"
                        >
                          <Trash2 className="h-4 w-4 text-rose-600" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "Meetings" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium">Meetings</h2>
              <div className="flex items-center gap-2">
                <Button onClick={openNewMeetingModal} className="gap-2">
                  <Plus className="h-4 w-4" /> Schedule Meeting
                </Button>
                <Button variant="outline" onClick={addMeetingRow} className="gap-2">
                  <Plus className="h-4 w-4" /> Quick Add Row
                </Button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="dashboard-table w-full text-sm">
                <thead>
                  <tr className="text-left">
                    {[
                      "id",
                      "title",
                      "date",
                      "time",
                      "duration",
                      "attendees",
                      "location",
                      "status",
                      "agenda",
                      "objectives",
                      "notes",
                      "",
                    ].map((h) => (
                      <th key={h} className="whitespace-nowrap px-2 py-2 text-slate-600">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {getMeetings().map((row, rIdx) => (
                    <tr key={rIdx} className="border-t align-top">
                      <td className="px-2 py-2 min-w-[120px]">
                        <input
                          className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                          value={row[0] ?? ""}
                          onChange={(e) => updateMeetingCell(rIdx, 0, e.target.value)}
                        />
                      </td>
                      <td className="px-2 py-2 min-w-[200px]">
                        <input
                          className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                          value={row[1] ?? ""}
                          onChange={(e) => updateMeetingCell(rIdx, 1, e.target.value)}
                        />
                      </td>
                      <td className="px-2 py-2 min-w-[140px]">
                        <input
                          type="date"
                          className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                          value={row[2] ?? ""}
                          onChange={(e) => updateMeetingCell(rIdx, 2, e.target.value)}
                        />
                      </td>
                      <td className="px-2 py-2 min-w-[120px]">
                        <input
                          className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                          value={row[3] ?? ""}
                          onChange={(e) => updateMeetingCell(rIdx, 3, e.target.value)}
                        />
                      </td>
                      <td className="px-2 py-2 min-w-[120px]">
                        <input
                          className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                          value={row[4] ?? ""}
                          onChange={(e) => updateMeetingCell(rIdx, 4, e.target.value)}
                        />
                      </td>
                      <td className="px-2 py-2 min-w-[220px]">
                        <AutoTextarea value={row[5] ?? row[10] ?? ""} onChange={(v) => updateMeetingCell(rIdx, 5, v)} />
                      </td>
                      <td className="px-2 py-2 min-w-[200px]">
                        <input
                          className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                          value={row[6] ?? ""}
                          onChange={(e) => updateMeetingCell(rIdx, 6, e.target.value)}
                        />
                      </td>
                      <td className="px-2 py-2 min-w-[140px]">
                        <input
                          className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                          value={row[7] ?? ""}
                          onChange={(e) => updateMeetingCell(rIdx, 7, e.target.value)}
                        />
                      </td>
                      <td className="px-2 py-2 min-w-[260px]">
                        <AutoTextarea value={row[8] ?? ""} onChange={(v) => updateMeetingCell(rIdx, 8, v)} />
                      </td>
                      <td className="px-2 py-2 min-w-[260px]">
                        <AutoTextarea value={row[9] ?? ""} onChange={(v) => updateMeetingCell(rIdx, 9, v)} />
                      </td>
                      <td className="px-2 py-2 min-w-[260px]">
                        <AutoTextarea value={row[10] ?? ""} onChange={(v) => updateMeetingCell(rIdx, 10, v)} />
                      </td>
                      <td className="px-2 py-2 min-w-[220px]">
                        <div className="flex flex-wrap gap-2">
                          <Button variant="outline" size="sm" onClick={() => openEditMeetingModal(rIdx)} className="gap-1">
                            Edit
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => exportMeetingSummary(rIdx)} className="gap-1">
                            <FileText className="h-4 w-4" />
                            Export
                          </Button>
                          <button
                            onClick={() => deleteMeeting(rIdx)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-md border hover:bg-rose-50"
                            title="Delete row"
                          >
                            <Trash2 className="h-4 w-4 text-rose-600" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {showMeetingModal && (
              <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
                <div className="w-full max-w-3xl rounded-2xl bg-white p-6 shadow-xl">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">{editingMeetingIndex === null ? "Schedule Meeting" : "Edit Meeting"}</h3>
                    <button
                      onClick={() => setShowMeetingModal(false)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-md border hover:bg-slate-50"
                      title="Close"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="text-xs text-slate-500">Title</label>
                      <input
                        className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                        value={meetingForm.title}
                        onChange={(e) => setMeetingForm((f) => ({ ...f, title: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500">Status</label>
                      <input
                        className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                        value={meetingForm.status}
                        onChange={(e) => setMeetingForm((f) => ({ ...f, status: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500">Date</label>
                      <input
                        type="date"
                        className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                        value={meetingForm.date}
                        onChange={(e) => setMeetingForm((f) => ({ ...f, date: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500">Time</label>
                      <input
                        className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                        value={meetingForm.time}
                        onChange={(e) => setMeetingForm((f) => ({ ...f, time: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500">Duration</label>
                      <input
                        className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                        value={meetingForm.duration}
                        onChange={(e) => setMeetingForm((f) => ({ ...f, duration: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500">Location</label>
                      <input
                        className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                        value={meetingForm.location}
                        onChange={(e) => setMeetingForm((f) => ({ ...f, location: e.target.value }))}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-xs text-slate-500">Attendees (comma separated)</label>
                      <input
                        className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                        value={meetingForm.attendees}
                        onChange={(e) => setMeetingForm((f) => ({ ...f, attendees: e.target.value }))}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-xs text-slate-500">Objectives</label>
                      <textarea
                        className="mt-1 w-full min-h-[80px] rounded-md border px-2 py-1 text-sm"
                        value={meetingForm.objectives}
                        onChange={(e) => setMeetingForm((f) => ({ ...f, objectives: e.target.value }))}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-xs text-slate-500">Agenda</label>
                      <textarea
                        className="mt-1 w-full min-h-[120px] rounded-md border px-2 py-1 text-sm"
                        value={meetingForm.agenda}
                        onChange={(e) => setMeetingForm((f) => ({ ...f, agenda: e.target.value }))}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-xs text-slate-500">Notes / Minutes</label>
                      <textarea
                        className="mt-1 w-full min-h-[120px] rounded-md border px-2 py-1 text-sm"
                        value={meetingForm.notes}
                        onChange={(e) => setMeetingForm((f) => ({ ...f, notes: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="mt-6 flex items-center justify-end gap-2">
                    <Button variant="outline" onClick={() => setShowMeetingModal(false)}>
                      Cancel
                    </Button>
                    <Button onClick={saveMeetingFromModal} className="gap-2">
                      <Save className="h-4 w-4" /> Save Meeting
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "KPIs" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium">KPIs</h2>
              <Button onClick={addKpi} className="gap-2">
                <Plus className="h-4 w-4" /> Add KPI
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="dashboard-table w-full text-sm">
                <thead>
                  <tr className="text-left">
                    {["Name", "Current", "Target", "Unit", "Owner", ""].map((h) => (
                      <th key={h} className="whitespace-nowrap px-2 py-2 text-slate-600">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {getKpis().map((k) => (
                    <tr key={k.id} className="border-t">
                      <td className="px-2 py-2 min-w-[220px]">
                        <input
                          className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                          value={k.name}
                          onChange={(e) => updateKpi(k.id, { name: e.target.value })}
                        />
                      </td>
                      <td className="px-2 py-2 min-w-[120px]">
                        <input
                          type="number"
                          className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                          value={k.current_value}
                          onChange={(e) => updateKpi(k.id, { current_value: Number(e.target.value) || 0 })}
                        />
                      </td>
                      <td className="px-2 py-2 min-w-[120px]">
                        <input
                          type="number"
                          className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                          value={k.target_value}
                          onChange={(e) => updateKpi(k.id, { target_value: Number(e.target.value) || 0 })}
                        />
                      </td>
                      <td className="px-2 py-2 min-w-[100px]">
                        <input
                          className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                          value={k.unit}
                          onChange={(e) => updateKpi(k.id, { unit: e.target.value })}
                        />
                      </td>
                      <td className="px-2 py-2 min-w-[180px]">
                        <input
                          className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                          value={k.owner}
                          onChange={(e) => updateKpi(k.id, { owner: e.target.value })}
                        />
                      </td>
                      <td className="px-2 py-2 min-w-[64px]">
                        <button
                          onClick={() => deleteKpi(k.id)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-md border hover:bg-rose-50"
                          title="Delete KPI"
                        >
                          <Trash2 className="h-4 w-4 text-rose-600" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "Financials" && (
          <div className="space-y-8">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-medium">CapEx ({scenario})</h2>
                <Button onClick={addCapex} className="gap-2">
                  <Plus className="h-4 w-4" /> Add CapEx
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="dashboard-table w-full text-sm">
                  <thead>
                    <tr className="text-left">
                      {["item", "qty", "unit_cost", "install_cost", "computed_total", ""].map((h) => (
                        <th key={h} className="whitespace-nowrap px-2 py-2 text-slate-600">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {getCapexRows().map((row, rIdx) => {
                      const total = (Number(row?.[1]) || 0) * (Number(row?.[2]) || 0) + (Number(row?.[3]) || 0);
                      return (
                        <tr key={rIdx} className="border-t">
                          <td className="px-2 py-2 min-w-[260px]">
                            <input
                              className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                              value={row[0] ?? ""}
                              onChange={(e) => updateCapexCell(rIdx, 0, e.target.value)}
                            />
                          </td>
                          <td className="px-2 py-2 min-w-[120px]">
                            <input
                              type="number"
                              className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                              value={row[1] ?? 0}
                              onChange={(e) => updateCapexCell(rIdx, 1, Number(e.target.value) || 0)}
                            />
                          </td>
                          <td className="px-2 py-2 min-w-[140px]">
                            <input
                              type="number"
                              className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                              value={row[2] ?? 0}
                              onChange={(e) => updateCapexCell(rIdx, 2, Number(e.target.value) || 0)}
                            />
                          </td>
                          <td className="px-2 py-2 min-w-[140px]">
                            <input
                              type="number"
                              className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                              value={row[3] ?? 0}
                              onChange={(e) => updateCapexCell(rIdx, 3, Number(e.target.value) || 0)}
                            />
                          </td>
                          <td className="px-2 py-2 min-w-[160px]">{total.toLocaleString()}</td>
                          <td className="px-2 py-2 min-w-[64px]">
                            <button
                              onClick={() => deleteCapex(rIdx)}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-md border hover:bg-rose-50"
                              title="Delete row"
                            >
                              <Trash2 className="h-4 w-4 text-rose-600" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-medium">OpEx ({scenario})</h2>
                <Button onClick={addOpex} className="gap-2">
                  <Plus className="h-4 w-4" /> Add OpEx
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="dashboard-table w-full text-sm">
                  <thead>
                    <tr className="text-left">
                      {["item", "rate", "qty", "unit_cost", "computed_total", ""].map((h) => (
                        <th key={h} className="whitespace-nowrap px-2 py-2 text-slate-600">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {getOpexRows().map((row, rIdx) => {
                      const total = (Number(row?.[2]) || 0) * (Number(row?.[3]) || 0);
                      return (
                        <tr key={rIdx} className="border-t">
                          <td className="px-2 py-2 min-w-[260px]">
                            <input
                              className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                              value={row[0] ?? ""}
                              onChange={(e) => updateOpexCell(rIdx, 0, e.target.value)}
                            />
                          </td>
                          <td className="px-2 py-2 min-w-[160px]">
                            <input
                              className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                              value={row[1] ?? ""}
                              onChange={(e) => updateOpexCell(rIdx, 1, e.target.value)}
                            />
                          </td>
                          <td className="px-2 py-2 min-w-[120px]">
                            <input
                              type="number"
                              className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                              value={row[2] ?? 0}
                              onChange={(e) => updateOpexCell(rIdx, 2, Number(e.target.value) || 0)}
                            />
                          </td>
                          <td className="px-2 py-2 min-w-[140px]">
                            <input
                              type="number"
                              className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                              value={row[3] ?? 0}
                              onChange={(e) => updateOpexCell(rIdx, 3, Number(e.target.value) || 0)}
                            />
                          </td>
                          <td className="px-2 py-2 min-w-[160px]">{total.toLocaleString()}</td>
                          <td className="px-2 py-2 min-w-[64px]">
                            <button
                              onClick={() => deleteOpex(rIdx)}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-md border hover:bg-rose-50"
                              title="Delete row"
                            >
                              <Trash2 className="h-4 w-4 text-rose-600" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === "Glossary" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium">Glossary</h2>
              <Button onClick={addGlossary} className="gap-2">
                <Plus className="h-4 w-4" /> Add Term
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="dashboard-table w-full text-sm">
                <thead>
                  <tr className="text-left">
                    {["Term", "Definition", ""].map((h) => (
                      <th key={h} className="whitespace-nowrap px-2 py-2 text-slate-600">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {getGlossary().map((row, rIdx) => (
                    <tr key={rIdx} className="border-t">
                      <td className="px-2 py-2 min-w-[200px]">
                        <input
                          className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                          value={row[0] ?? ""}
                          onChange={(e) => updateGlossaryCell(rIdx, 0, e.target.value)}
                        />
                      </td>
                      <td className="px-2 py-2 min-w-[400px]">
                        <AutoTextarea value={row[1] ?? ""} onChange={(v) => updateGlossaryCell(rIdx, 1, v)} />
                      </td>
                      <td className="px-2 py-2 min-w-[64px]">
                        <button
                          onClick={() => deleteGlossary(rIdx)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-md border hover:bg-rose-50"
                          title="Delete row"
                        >
                          <Trash2 className="h-4 w-4 text-rose-600" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "Config" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-medium">Scenario Settings</h2>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="rounded-xl border p-3">
                  <p className="text-xs text-slate-500">Units / year ({scenario})</p>
                  <input
                    type="number"
                    className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                    value={plan?.scenarios?.[scenario]?.unitsPerYear || 0}
                    onChange={(e) =>
                      setPlan((prev: any) => ({
                        ...prev,
                        scenarios: {
                          ...prev.scenarios,
                          [scenario]: { ...prev.scenarios[scenario], unitsPerYear: Number(e.target.value) || 0 },
                        },
                      }))
                    }
                  />
                </div>
                <div className="rounded-xl border p-3">
                  <p className="text-xs text-slate-500">Hours / day ({scenario})</p>
                  <input
                    type="number"
                    className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                    value={plan?.scenarios?.[scenario]?.hoursPerDay || 8}
                    onChange={(e) =>
                      setPlan((prev: any) => ({
                        ...prev,
                        scenarios: {
                          ...prev.scenarios,
                          [scenario]: { ...prev.scenarios[scenario], hoursPerDay: Number(e.target.value) || 0 },
                        },
                      }))
                    }
                  />
                </div>
                <div className="rounded-xl border p-3">
                  <p className="text-xs text-slate-500">Shifts ({scenario})</p>
                  <input
                    type="number"
                    className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                    value={plan?.scenarios?.[scenario]?.shifts || 1}
                    onChange={(e) =>
                      setPlan((prev: any) => ({
                        ...prev,
                        scenarios: {
                          ...prev.scenarios,
                          [scenario]: { ...prev.scenarios[scenario], shifts: Number(e.target.value) || 0 },
                        },
                      }))
                    }
                  />
                </div>
                <div className="rounded-xl border p-3">
                  <p className="text-xs text-slate-500">Buffer (%)</p>
                  <input
                    type="number"
                    className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                    value={Math.round((plan?.bufferPct || 0) * 100)}
                    onChange={(e) => setPlan((prev: any) => ({ ...prev, bufferPct: Math.max(0, Number(e.target.value) || 0) / 100 }))}
                  />
                </div>
              </div>
            </div>

            <div>
              <h2 className="text-lg font-medium">Raw JSON (read-only snapshot)</h2>
              <pre className="mt-2 max-h-80 overflow-auto rounded-lg bg-slate-50 p-3 text-xs">
                {JSON.stringify({ scenario, variant, plan }, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
