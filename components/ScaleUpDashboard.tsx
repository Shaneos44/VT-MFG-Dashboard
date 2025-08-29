"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { clone, SEED_PLAN } from "@/lib/constants";
import AutoTextarea from "@/components/AutoTextarea";
import OverviewPanel from "@/components/OverviewPanel";
import { Loader2, Plus, Trash2 } from "lucide-react";

/** ----------------------------------------------------------------
 * Types (aligned to your previous shapes)
 * ---------------------------------------------------------------- */
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

/** ----------------------------------------------------------------
 * Component
 * ---------------------------------------------------------------- */
export default function ScaleUpDashboard() {
  /** ---------------- Core state ---------------- */
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [scenario, setScenario] = useState<"50k" | "200k">("50k");
  const [variant, setVariant] = useState<VariantName>("Recess Nanodispensing");

  const [plan, setPlan] = useState<any>(() => {
    // start with SEED_PLAN but ensure required branches exist
    const p = clone(SEED_PLAN) || {};
    if (!p.scenarios) {
      p.scenarios = {
        "50k": { unitsPerYear: 50000, hoursPerDay: 8, shifts: 1 },
        "200k": { unitsPerYear: 200000, hoursPerDay: 16, shifts: 2 },
      };
    }
    if (!p.products) {
      p.products = {};
    }
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
    if (typeof p.bufferPct !== "number") p.bufferPct = 0.15;
    return p;
  });

  // small local standalone lists (optional)
  const [manufacturingProcesses, setManufacturingProcesses] = useState<AnyRow[]>(
    plan?.products?.[scenario]?.processes || []
  );

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
  ]);

  /** ---------------- Debounced autosave ---------------- */
  const autoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queueSave = useCallback(() => {
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    autoSaveRef.current = setTimeout(() => {
      void saveProjectDataToDatabase();
    }, 1200);
  }, []);

  /** ---------------- Current product for selected scenario ---------------- */
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

  /** ---------------- Load (on mount) ---------------- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);

        const r = await fetch("/api/configurations", { method: "GET" });
        if (!r.ok) {
          // 401 is ok (not signed in) -> continue with local state
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

  /** ---------------- Save (debounced on changes) ---------------- */
  useEffect(() => {
    if (loading) return;
    queueSave();
  }, [plan, scenario, variant, loading, queueSave]);

  /** ---------------- Save to DB ---------------- */
  const saveProjectDataToDatabase = useCallback(async () => {
    try {
      setSaving(true);
      const payload = {
        name: "ScaleUp-Dashboard-Config",
        description: "ScaleUp Dashboard Configuration",
        data: {
          plan,
          scenario,
          variant,
        },
        modified_by: "user",
        upsert: true,
      };

      const r = await fetch("/api/configurations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!r.ok) {
        // If 401, we silently ignore to allow local-only usage
        if (r.status !== 401) {
          try {
            const data = await r.json();
            setError(data?.error || `Save failed (${r.status})`);
          } catch {
            setError(`Save failed (${r.status})`);
          }
        }
      }
    } catch (e: any) {
      setError(e?.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  }, [plan, scenario, variant]);

  /** ---------------- Tabs ---------------- */
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

  /** ---------------- Projects table logic ---------------- */
  const projectHeaders = [
    "id",
    "name",
    "type",
    "moscow",
    "owner",
    "start",
    "finish",
    "dependencies",
    "deliverables", // -> textarea
    "goal", // -> textarea
    "R",
    "A",
    "C",
    "I",
    "needs", // -> textarea
    "barriers", // -> textarea
    "risks", // -> textarea
    "budget_capex",
    "budget_opex",
    "percent_complete",
    "process_link", // -> textarea
    "critical",
    "status",
    "slack_days",
  ];

  const getProjects = () => (currentVariantData?.projects || []) as AnyRow[];
  const setProjects = (rows: AnyRow[]) => {
    setPlan((prev: any) => ({
      ...prev,
      products: {
        ...prev.products,
        [scenario]: {
          ...prev.products[scenario],
          projects: rows,
        },
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

  /** ---------------- Simple inputs ---------------- */
  const TextCell = ({
    value,
    onChange,
    className = "w-full rounded-md border bg-background px-2 py-1 text-sm",
    type = "text",
  }: {
    value: any;
    onChange: (v: string) => void;
    className?: string;
    type?: string;
  }) => (
    <input
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      type={type}
      className={className}
    />
  );

  const NumCell = ({
    value,
    onChange,
    className = "w-full rounded-md border bg-background px-2 py-1 text-sm",
  }: {
    value: any;
    onChange: (v: number) => void;
    className?: string;
  }) => (
    <input
      value={value ?? 0}
      onChange={(e) => onChange(Number(e.target.value) || 0)}
      type="number"
      className={className}
    />
  );

  const DateCell = ({
    value,
    onChange,
    className = "w-full rounded-md border bg-background px-2 py-1 text-sm",
  }: {
    value: any;
    onChange: (v: string) => void;
    className?: string;
  }) => (
    <input
      value={value ? String(value) : ""}
      onChange={(e) => onChange(e.target.value)}
      type="date"
      className={className}
    />
  );

  /** ---------------- Layout ---------------- */
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

  return (
    <div className="space-y-6">
      {/* Top bar */}
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

        <div className="flex items-center gap-2">
          {saving ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
            </span>
          ) : (
            <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs text-emerald-700">All changes saved</span>
          )}
          {error ? (
            <span className="rounded-md bg-rose-50 px-2 py-1 text-xs text-rose-600">Error: {error}</span>
          ) : null}
        </div>
      </div>

      {/* Tabs */}
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

      {/* Content */}
      <div className="rounded-2xl border p-4 shadow-sm">
        {activeTab === "Overview" && (
          <OverviewPanel
            scenario={scenario}
            variant={variant}
            projects={currentVariantData.projects || []}
            processes={manufacturingProcesses || currentVariantData.processes || []}
            capexRows={scenario === "50k" ? currentVariantData.capex50k || [] : currentVariantData.capex200k || []}
            opexRows={scenario === "50k" ? currentVariantData.opex50k || [] : currentVariantData.opex200k || []}
            kpis={kpis}
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
                  {(getProjects() as AnyRow[]).map((row, rIdx) => (
                    <tr key={rIdx} className="border-t">
                      {/* id */}
                      <td className="px-2 py-2 min-w-[120px]">
                        <TextCell value={row[0]} onChange={(v) => updateProjectCell(rIdx, 0, v)} />
                      </td>
                      {/* name */}
                      <td className="px-2 py-2 min-w-[200px]">
                        <TextCell value={row[1]} onChange={(v) => updateProjectCell(rIdx, 1, v)} />
                      </td>
                      {/* type */}
                      <td className="px-2 py-2 min-w-[140px]">
                        <TextCell value={row[2]} onChange={(v) => updateProjectCell(rIdx, 2, v)} />
                      </td>
                      {/* moscow */}
                      <td className="px-2 py-2 min-w-[120px]">
                        <TextCell value={row[3]} onChange={(v) => updateProjectCell(rIdx, 3, v)} />
                      </td>
                      {/* owner */}
                      <td className="px-2 py-2 min-w-[150px]">
                        <TextCell value={row[4]} onChange={(v) => updateProjectCell(rIdx, 4, v)} />
                      </td>
                      {/* start */}
                      <td className="px-2 py-2 min-w-[150px]">
                        <DateCell value={row[5]} onChange={(v) => updateProjectCell(rIdx, 5, v)} />
                      </td>
                      {/* finish */}
                      <td className="px-2 py-2 min-w-[150px]">
                        <DateCell value={row[6]} onChange={(v) => updateProjectCell(rIdx, 6, v)} />
                      </td>
                      {/* dependencies */}
                      <td className="px-2 py-2 min-w-[120px]">
                        <NumCell value={row[7]} onChange={(v) => updateProjectCell(rIdx, 7, v)} />
                      </td>
                      {/* deliverables (wrap) */}
                      <td className="px-2 py-2 min-w-[260px] dashboard-wrap">
                        <AutoTextarea
                          value={row[8] ?? ""}
                          onChange={(v) => updateProjectCell(rIdx, 8, v)}
                        />
                      </td>
                      {/* goal (wrap) */}
                      <td className="px-2 py-2 min-w-[260px] dashboard-wrap">
                        <AutoTextarea
                          value={row[9] ?? ""}
                          onChange={(v) => updateProjectCell(rIdx, 9, v)}
                        />
                      </td>
                      {/* R */}
                      <td className="px-2 py-2 min-w-[60px]">
                        <TextCell value={row[10]} onChange={(v) => updateProjectCell(rIdx, 10, v)} />
                      </td>
                      {/* A */}
                      <td className="px-2 py-2 min-w-[60px]">
                        <TextCell value={row[11]} onChange={(v) => updateProjectCell(rIdx, 11, v)} />
                      </td>
                      {/* C */}
                      <td className="px-2 py-2 min-w-[60px]">
                        <TextCell value={row[12]} onChange={(v) => updateProjectCell(rIdx, 12, v)} />
                      </td>
                      {/* I */}
                      <td className="px-2 py-2 min-w-[60px]">
                        <TextCell value={row[13]} onChange={(v) => updateProjectCell(rIdx, 13, v)} />
                      </td>
                      {/* needs (wrap) */}
                      <td className="px-2 py-2 min-w-[240px] dashboard-wrap">
                        <AutoTextarea value={row[14] ?? ""} onChange={(v) => updateProjectCell(rIdx, 14, v)} />
                      </td>
                      {/* barriers (wrap) */}
                      <td className="px-2 py-2 min-w-[240px] dashboard-wrap">
                        <AutoTextarea value={row[15] ?? ""} onChange={(v) => updateProjectCell(rIdx, 15, v)} />
                      </td>
                      {/* risks (wrap) */}
                      <td className="px-2 py-2 min-w-[240px] dashboard-wrap">
                        <AutoTextarea value={row[16] ?? ""} onChange={(v) => updateProjectCell(rIdx, 16, v)} />
                      </td>
                      {/* budget_capex */}
                      <td className="px-2 py-2 min-w-[140px]">
                        <NumCell value={row[17]} onChange={(v) => updateProjectCell(rIdx, 17, v)} />
                      </td>
                      {/* budget_opex */}
                      <td className="px-2 py-2 min-w-[140px]">
                        <NumCell value={row[18]} onChange={(v) => updateProjectCell(rIdx, 18, v)} />
                      </td>
                      {/* percent_complete */}
                      <td className="px-2 py-2 min-w-[140px]">
                        <NumCell value={row[19]} onChange={(v) => updateProjectCell(rIdx, 19, v)} />
                      </td>
                      {/* process_link / notes (wrap) */}
                      <td className="px-2 py-2 min-w-[240px] dashboard-wrap">
                        <AutoTextarea value={row[20] ?? ""} onChange={(v) => updateProjectCell(rIdx, 20, v)} />
                      </td>
                      {/* critical */}
                      <td className="px-2 py-2 min-w-[100px]">
                        <TextCell value={row[21]} onChange={(v) => updateProjectCell(rIdx, 21, v)} />
                      </td>
                      {/* status */}
                      <td className="px-2 py-2 min-w-[120px]">
                        <TextCell value={row[22]} onChange={(v) => updateProjectCell(rIdx, 22, v)} />
                      </td>
                      {/* slack_days */}
                      <td className="px-2 py-2 min-w-[120px]">
                        <NumCell value={row[23]} onChange={(v) => updateProjectCell(rIdx, 23, v)} />
                      </td>

                      {/* delete */}
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

        {activeTab !== "Overview" && activeTab !== "Projects" && (
          <div className="text-sm text-slate-600">
            The <span className="font-medium">{activeTab}</span> tab is available; your data will be saved automatically
            as you edit in the implemented sections. (If you’d like me to wire up this tab with the same wrapped inputs
            and autosave, say the word and I’ll drop it in.)
          </div>
        )}
      </div>
    </div>
  );
}
