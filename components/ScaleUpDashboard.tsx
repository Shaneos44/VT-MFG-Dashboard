// components/ScaleUpDashboard.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { jsPDF } from "jspdf";
import { Button } from "@/components/ui/button";
import { TrendingUp, Loader2, FileText } from "lucide-react";
import { generateWeeklySummary } from "@/lib/utils";
import { clone, SEED_PLAN } from "@/lib/constants";

/**
 * This component is a full, drop-in replacement for the Scale-Up Dashboard.
 * It includes:
 * - Safe normalization for Risks/Resources/Projects tables (fixes `.map is not a function`)
 * - PDF export for Weekly Summary
 * - PDF export for Comprehensive Analysis
 * - Financials auto-derived from Projects (CapEx/OpEx totals)
 * - Editable Overview controls that affect scenario calculations
 * - Save/Load via /api/configurations using authenticated Supabase session cookies
 */

/* ================================ Types & Helpers ================================ */

type Variant = "Recess Nanodispensing" | "Dipcoating";
type ScenarioKey = "50k" | "200k";

interface ScenarioDef {
  unitsPerYear: number;
  hoursPerDay: number;
  shifts: number;
}

interface ScenarioRow {
  id: string;
  name: string;
  description?: string;
  target_units: number;
  created_at?: string;
  updated_at?: string;
}

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

interface SavedConfiguration {
  id: string;
  name: string;
  description?: string;
  data: any;
  created_at: string;
  updated_at: string;
}

interface SyncStatus {
  isOnline: boolean;
  lastSync: Date;
  pendingChanges: number;
  connectedUsers: number;
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

const MOSCOW = ["Must", "Should", "Could", "Won't"] as const;

function toArray<T = any>(v: any): T[] {
  return Array.isArray(v) ? (v as T[]) : v == null ? [] : [v as T];
}
function as2D<T = any>(v: any): T[][] {
  if (!Array.isArray(v)) return [];
  return v.filter((row) => Array.isArray(row)) as T[][];
}
function num(n: any, d = 0): number {
  const x = Number(n);
  return Number.isFinite(x) ? x : d;
}
function pct(n: number): string {
  return `${Math.round(n)}%`;
}

/* ================================ Small UI Bits ================================ */

function SyncStatusIndicator({ syncStatus }: { syncStatus: SyncStatus }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <div className={`w-2 h-2 rounded-full ${syncStatus.isOnline ? "bg-green-500" : "bg-red-500"}`} />
      <span className="text-slate-600">
        {syncStatus.isOnline ? "Online" : "Offline"} • {syncStatus.connectedUsers} users •{" "}
        {syncStatus.pendingChanges > 0 ? `${syncStatus.pendingChanges} pending` : "no pending"}
      </span>
      <span className="text-xs text-slate-500">Last sync: {syncStatus.lastSync.toLocaleTimeString()}</span>
    </div>
  );
}

function OverviewControls({
  scenario,
  plan,
  setPlan,
}: {
  scenario: ScenarioKey;
  plan: any;
  setPlan: React.Dispatch<React.SetStateAction<any>>;
}) {
  const sc = plan?.scenarios?.[scenario] ?? { unitsPerYear: scenario === "50k" ? 50000 : 200000, hoursPerDay: 8, shifts: 1 };

  return (
    <div className="flex flex-wrap gap-3 items-end">
      <div className="flex flex-col">
        <label className="text-xs text-slate-500">Units / Year</label>
        <input
          type="number"
          className="border rounded px-2 py-1 w-40"
          value={Number(sc.unitsPerYear)}
          onChange={(e) =>
            setPlan((prev: any) => ({
              ...prev,
              scenarios: {
                ...prev.scenarios,
                [scenario]: { ...sc, unitsPerYear: Number(e.target.value) || 0 },
              },
            }))
          }
        />
      </div>
      <div className="flex flex-col">
        <label className="text-xs text-slate-500">Hours / Day</label>
        <input
          type="number"
          className="border rounded px-2 py-1 w-40"
          value={Number(sc.hoursPerDay)}
          onChange={(e) =>
            setPlan((prev: any) => ({
              ...prev,
              scenarios: {
                ...prev.scenarios,
                [scenario]: { ...sc, hoursPerDay: Number(e.target.value) || 0 },
              },
            }))
          }
        />
      </div>
      <div className="flex flex-col">
        <label className="text-xs text-slate-500">Shifts</label>
        <input
          type="number"
          className="border rounded px-2 py-1 w-40"
          value={Number(sc.shifts)}
          onChange={(e) =>
            setPlan((prev: any) => ({
              ...prev,
              scenarios: {
                ...prev.scenarios,
                [scenario]: { ...sc, shifts: Number(e.target.value) || 0 },
              },
            }))
          }
        />
      </div>
    </div>
  );
}

function RisksTable(props: {
  rows: any;
  onCellChange: (rowIndex: number, colIndex: number, value: any) => void;
  onAdd: () => void;
  onDelete: (index: number) => void;
}) {
  const rows = as2D(props.rows);
  const headers = ["ID", "Risk", "Impact", "Probability", "Mitigation", "Owner", "Due", "Status", "Actions"];

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">Risks</h3>
        <Button variant="outline" size="sm" onClick={props.onAdd}>
          + Add Risk
        </Button>
      </div>
      <div className="w-full overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {headers.map((h) => (
                <th key={h} className="text-left bg-slate-50 border-b px-3 py-2 text-[13px] font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri} className="border-b">
                <td className="p-2">
                  <input className="w-full border rounded px-2 py-1" value={String(r[0] ?? "")} onChange={(e) => props.onCellChange(ri, 0, e.target.value)} />
                </td>
                <td className="p-2">
                  <textarea className="w-full border rounded px-2 py-1" rows={2} value={String(r[1] ?? "")} onChange={(e) => props.onCellChange(ri, 1, e.target.value)} />
                </td>
                <td className="p-2">
                  <select className="w-full border rounded px-2 py-1" value={String(r[2] ?? "")} onChange={(e) => props.onCellChange(ri, 2, e.target.value)}>
                    <option value="">—</option>
                    <option value="H">H</option>
                    <option value="M">M</option>
                    <option value="L">L</option>
                  </select>
                </td>
                <td className="p-2">
                  <select className="w-full border rounded px-2 py-1" value={String(r[3] ?? "")} onChange={(e) => props.onCellChange(ri, 3, e.target.value)}>
                    <option value="">—</option>
                    <option value="H">H</option>
                    <option value="M">M</option>
                    <option value="L">L</option>
                  </select>
                </td>
                <td className="p-2">
                  <textarea className="w-full border rounded px-2 py-1" rows={2} value={String(r[4] ?? "")} onChange={(e) => props.onCellChange(ri, 4, e.target.value)} />
                </td>
                <td className="p-2">
                  <input className="w-full border rounded px-2 py-1" value={String(r[5] ?? "")} onChange={(e) => props.onCellChange(ri, 5, e.target.value)} />
                </td>
                <td className="p-2">
                  <input type="date" className="w-full border rounded px-2 py-1" value={String(r[6] ?? "")} onChange={(e) => props.onCellChange(ri, 6, e.target.value)} />
                </td>
                <td className="p-2">
                  <select className="w-full border rounded px-2 py-1" value={String(r[7] ?? "Open")} onChange={(e) => props.onCellChange(ri, 7, e.target.value)}>
                    <option value="Open">Open</option>
                    <option value="Monitoring">Monitoring</option>
                    <option value="Mitigated">Mitigated</option>
                    <option value="Closed">Closed</option>
                  </select>
                </td>
                <td className="p-2">
                  <Button variant="outline" size="sm" onClick={() => props.onDelete(ri)}>
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="p-4 text-slate-500" colSpan={headers.length}>
                  No risks yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ResourcesTable(props: {
  rows: any;
  onCellChange: (rowIndex: number, colIndex: number, value: any) => void;
  onAdd: () => void;
  onDelete: (index: number) => void;
}) {
  const rows = as2D(props.rows);
  const headers = ["Resource", "Type", "Quantity", "Cost", "Department", "Notes", "Actions"];
  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">Resources</h3>
        <Button variant="outline" size="sm" onClick={props.onAdd}>
          + Add Resource
        </Button>
      </div>
      <div className="w-full overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {headers.map((h) => (
                <th key={h} className="text-left bg-slate-50 border-b px-3 py-2 text-[13px] font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri} className="border-b">
                <td className="p-2">
                  <input className="w-full border rounded px-2 py-1" value={String(r[0] ?? "")} onChange={(e) => props.onCellChange(ri, 0, e.target.value)} />
                </td>
                <td className="p-2">
                  <select className="w-full border rounded px-2 py-1" value={String(r[1] ?? "Personnel")} onChange={(e) => props.onCellChange(ri, 1, e.target.value)}>
                    <option value="Personnel">Personnel</option>
                    <option value="Equipment">Equipment</option>
                    <option value="Software">Software</option>
                    <option value="Facility">Facility</option>
                    <option value="Other">Other</option>
                  </select>
                </td>
                <td className="p-2">
                  <input
                    type="number"
                    className="w-full border rounded px-2 py-1"
                    value={String(num(r[2] ?? 0))}
                    onChange={(e) => props.onCellChange(ri, 2, Number(e.target.value))}
                  />
                </td>
                <td className="p-2">
                  <input
                    type="number"
                    step="0.01"
                    className="w-full border rounded px-2 py-1"
                    value={String(num(r[3] ?? 0))}
                    onChange={(e) => props.onCellChange(ri, 3, Number(e.target.value))}
                  />
                </td>
                <td className="p-2">
                  <input className="w-full border rounded px-2 py-1" value={String(r[4] ?? "")} onChange={(e) => props.onCellChange(ri, 4, e.target.value)} />
                </td>
                <td className="p-2">
                  <input className="w-full border rounded px-2 py-1" value={String(r[5] ?? "")} onChange={(e) => props.onCellChange(ri, 5, e.target.value)} />
                </td>
                <td className="p-2">
                  <Button variant="outline" size="sm" onClick={() => props.onDelete(ri)}>
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="p-4 text-slate-500" colSpan={headers.length}>
                  No resources yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProjectsTable(props: {
  rows: any[][];
  onCellChange: (rowIndex: number, colIndex: number, value: any) => void;
  onAdd: () => void;
  onDelete: (index: number) => void;
}) {
  // headers aligned to user's earlier schema
  const headers = [
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
    "Actions",
  ];
  const rows = as2D(props.rows);

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">Projects</h3>
        <Button variant="outline" size="sm" onClick={props.onAdd}>
          + Add Project
        </Button>
      </div>
      <div className="w-full overflow-x-auto">
        <table className="w-[1200px] max-w-none border-collapse">
          <thead>
            <tr>
              {headers.map((h) => (
                <th key={h} className="text-left bg-slate-50 border-b px-3 py-2 text-[13px] font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri} className="border-b">
                {headers.slice(0, -1).map((_, ci) => (
                  <td key={ci} className="p-2">
                    {ci === 3 ? (
                      <select
                        className="w-full border rounded px-2 py-1"
                        value={String(r[ci] ?? "")}
                        onChange={(e) => props.onCellChange(ri, ci, e.target.value)}
                      >
                        <option value="">—</option>
                        {Array.from(MOSCOW).map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    ) : ci === 5 || ci === 6 ? (
                      <input
                        type="date"
                        className="w-full border rounded px-2 py-1"
                        value={String(r[ci] ?? "")}
                        onChange={(e) => props.onCellChange(ri, ci, e.target.value)}
                      />
                    ) : ci === 17 || ci === 18 || ci === 19 || ci === 23 ? (
                      <input
                        type="number"
                        className="w-full border rounded px-2 py-1"
                        value={String(num(r[ci] ?? 0))}
                        onChange={(e) => props.onCellChange(ri, ci, Number(e.target.value))}
                      />
                    ) : ci === 21 ? (
                      <select
                        className="w-full border rounded px-2 py-1"
                        value={String(r[ci] ?? "false")}
                        onChange={(e) => props.onCellChange(ri, ci, e.target.value)}
                      >
                        <option value="false">false</option>
                        <option value="true">true</option>
                      </select>
                    ) : (
                      <input
                        className="w-full border rounded px-2 py-1"
                        value={String(r[ci] ?? "")}
                        onChange={(e) => props.onCellChange(ri, ci, e.target.value)}
                      />
                    )}
                  </td>
                ))}
                <td className="p-2">
                  <Button variant="outline" size="sm" onClick={() => props.onDelete(ri)}>
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="p-4 text-slate-500" colSpan={headers.length}>
                  No projects yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ================================ Main Component ================================ */

export default function ScaleUpDashboard() {
  /* ---------- Core page state ---------- */

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [scenario, setScenario] = useState<ScenarioKey>("50k");
  const [variant, setVariant] = useState<Variant>("Recess Nanodispensing");

  const [plan, setPlan] = useState(() => {
    const initialPlan = clone(SEED_PLAN);
    if (!initialPlan.scenarios) {
      initialPlan.scenarios = {
        "50k": { unitsPerYear: 50000, hoursPerDay: 8, shifts: 1 },
        "200k": { unitsPerYear: 200000, hoursPerDay: 16, shifts: 2 },
      } as Record<ScenarioKey, ScenarioDef>;
    }
    return initialPlan;
  });

  const [analysis, setAnalysis] = useState<{ summary: string; tldr: string }>({ summary: "", tldr: "" });

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
  ]);

  const [costData, setCostData] = useState<CostData[]>([]);
  const [scenarios, setScenarios] = useState<ScenarioRow[]>([]);
  const [currentScenario, setCurrentScenario] = useState<ScenarioRow | null>(null);

  const [savedConfigurations, setSavedConfigurations] = useState<SavedConfiguration[]>([]);
  const [loadingConfigs, setLoadingConfigs] = useState(false);

  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    isOnline: true,
    lastSync: new Date(),
    pendingChanges: 0,
    connectedUsers: 1,
  });

  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  /* ---------- Derived: normalize current variant block ---------- */

  const currentVariantData = useMemo(() => {
    const baseData =
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
      };

    // normalize to 2D arrays where applicable
    const normalized = {
      ...baseData,
      projects: as2D(baseData.projects),
      resources: as2D(baseData.resources),
      risks: as2D(baseData.risks),
      manufacturing: as2D(baseData.manufacturing),
      meetings: as2D(baseData.meetings),
    };

    const result = {
      ...normalized,
      kpis: kpis.length > 0 ? kpis : normalized.kpis || [],
      scenarios: scenarios.length > 0 ? scenarios : normalized.scenarios || [],
      costData: costData.length > 0 ? costData : normalized.costData || [],
      projectsCount: normalized.projects.length,
      processesCount: normalized.processes?.length || 0,
      manufacturingCount: normalized.manufacturing.length,
      hiringCount: normalized.hiring?.length || 0,
      resourcesCount: normalized.resources.length,
    };

    return result;
  }, [plan.products, scenario, kpis, scenarios, costData, plan]);

  /* ---------- Load/Save via /api/configurations ---------- */

  const loadProjectDataFromDatabase = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const res = await fetch("/api/configurations", { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!res.ok) {
        setError("Failed to load data. Using defaults.");
        setLoading(false);
        return;
      }
      const configs: SavedConfiguration[] = await res.json();

      let latestConfig =
        configs.find((c: any) => c.name === "ScaleUp-Dashboard-Config") ||
        configs.sort((a: any, b: any) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())?.[0];

      if (latestConfig && latestConfig.data) {
        const { plan: loadedPlan, scenario: loadedScenario, variant: loadedVariant } = latestConfig.data;
        if (loadedPlan && Object.keys(loadedPlan).length > 0) setPlan(loadedPlan);
        if (loadedScenario) setScenario(loadedScenario);
        if (loadedVariant) setVariant(loadedVariant);
      }
    } catch (e: any) {
      setError("Failed to load data. Using defaults.");
    } finally {
      setLoading(false);
    }
  }, []);

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
          currentVariantData,
          lastSaved: new Date().toISOString(),
        },
        modified_by: "user",
        upsert: true,
      };
      const res = await fetch("/api/configurations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j?.error || "Failed to save configuration.");
        return;
      }
      setSyncStatus((prev) => ({ ...prev, isOnline: true, lastSync: new Date(), pendingChanges: 0 }));
    } catch (e) {
      setSyncStatus((prev) => ({ ...prev, isOnline: false }));
      setError("Failed to save data.");
    } finally {
      setSaving(false);
    }
  }, [plan, scenario, variant, currentVariantData]);

  useEffect(() => {
    loadProjectDataFromDatabase();
    const fallback = setTimeout(() => setLoading(false), 15000);
    return () => clearTimeout(fallback);
  }, [loadProjectDataFromDatabase]);

  useEffect(() => {
    if (!loading) {
      if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
      autoSaveTimeoutRef.current = setTimeout(() => {
        saveProjectDataToDatabase();
      }, 1000);
    }
    return () => {
      if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
    };
  }, [plan, scenario, variant, currentVariantData, loading, saveProjectDataToDatabase]);

  /* ---------- Derived Metrics ---------- */

  const scenarioDef: ScenarioDef =
    plan?.scenarios?.[scenario] ?? (scenario === "50k" ? { unitsPerYear: 50000, hoursPerDay: 8, shifts: 1 } : { unitsPerYear: 200000, hoursPerDay: 16, shifts: 2 });

  const capexTotal50 = useMemo(
    () => (currentVariantData.capex50k || []).reduce((s: number, r: any[]) => s + (Number(r?.[1]) * Number(r?.[2]) + Number(r?.[3]) || 0), 0),
    [currentVariantData.capex50k]
  );
  const capexTotal200 = useMemo(
    () => (currentVariantData.capex200k || []).reduce((s: number, r: any[]) => s + (Number(r?.[1]) * Number(r?.[2]) + Number(r?.[3]) || 0), 0),
    [currentVariantData.capex200k]
  );
  const opexTotal50 = useMemo(
    () => (currentVariantData.opex50k || []).reduce((s: number, r: any[]) => s + Number(r?.[2]) * Number(r?.[3]) || 0, 0),
    [currentVariantData.opex50k]
  );
  const opexTotal200 = useMemo(
    () => (currentVariantData.opex200k || []).reduce((s: number, r: any[]) => s + Number(r?.[2]) * Number(r?.[3]) || 0, 0),
    [currentVariantData.opex200k]
  );

  // Financials auto-derived from projects
  const financeFromProjects = useMemo(() => {
    const rows = Array.isArray(currentVariantData.projects) ? currentVariantData.projects : [];
    const capex = rows.reduce((s: number, r: any[]) => s + (Number(r?.[17]) || 0), 0);
    const opex = rows.reduce((s: number, r: any[]) => s + (Number(r?.[18]) || 0), 0);
    return { capex, opex, total: capex + opex };
  }, [currentVariantData.projects]);

  // local financial state (table) that includes derived rows
  const [financialData, setFinancialData] = useState<any[][]>([
    ["Revenue", "Product Sales", 2250000, "Income", "Projected annual revenue"],
    ["COGS", "Manufacturing Costs", 1350000, "Expense", "Direct production costs"],
    ["OpEx", "Operating Expenses", 450000, "Expense", "Ongoing operational costs"],
    ["CapEx", "Equipment Investment", 750000, "Investment", "Initial capital expenditure"],
  ]);

  useEffect(() => {
    setFinancialData((prev) => {
      const others = prev.filter(
        (r) =>
          r?.[0] !== "CapEx (from Projects)" && r?.[0] !== "OpEx (from Projects)" && r?.[0] !== "Total Budget (Projects)"
      );
      return [
        ["CapEx (from Projects)", "Projects Budget", financeFromProjects.capex, "Expense", "Derived from Projects"],
        ["OpEx (from Projects)", "Projects Budget", financeFromProjects.opex, "Expense", "Derived from Projects"],
        ["Total Budget (Projects)", "Projects Budget", financeFromProjects.total, "Expense", "CapEx + OpEx"],
        ...others,
      ];
    });
  }, [financeFromProjects.capex, financeFromProjects.opex, financeFromProjects.total]);

  const overviewMetrics = useMemo(() => {
    const currentCostData = costData.find((c) => c.scenario_id === currentScenario?.id);

    return {
      // Production Metrics
      targetProduction: scenarioDef.unitsPerYear,
      productionEfficiency: currentCostData ? (100 - ((currentCostData.cost_per_unit - 25) / 25) * 100).toFixed(1) : "85.2",
      costPerUnit: currentCostData ? currentCostData.cost_per_unit : 32.06,

      // Project Metrics
      totalProjects: currentVariantData.projectsCount || 0,
      activeProjects: Math.floor((currentVariantData.projectsCount || 0) * 0.7),
      completedProjects: Math.floor((currentVariantData.projectsCount || 0) * 0.2),

      // Manufacturing Metrics
      manufacturingProcesses: currentVariantData.manufacturingCount || 0,
      equipmentSystems: currentVariantData.manufacturingCount || 0,
      capacityUtilization: ((scenarioDef.unitsPerYear / (scenario === "50k" ? 60000 : 250000)) * 100).toFixed(0),

      // Financial Metrics
      annualRevenue: currentCostData ? scenarioDef.unitsPerYear * 45 : 2250000,
      totalInvestment: currentCostData ? currentCostData.capex + currentCostData.opex : 1708250,
      profitMargin: currentCostData
        ? ((((scenarioDef.unitsPerYear * 45) - currentCostData.capex - currentCostData.opex) / (scenarioDef.unitsPerYear * 45)) * 100).toFixed(1)
        : "28.7",

      // Team Metrics
      teamSize: (currentVariantData.hiringCount || 0) + 15,
      newHires: currentVariantData.hiringCount || 0,
      resourcesAllocated: currentVariantData.resourcesCount || 0,

      // Risk Metrics
      totalRisks: (currentVariantData.risks || []).length,
      highPriorityRisks: Math.floor((currentVariantData.risks || []).length * 0.3),

      // KPI Health
      kpiHealth:
        kpis.length > 0 ? (kpis.filter((kpi) => kpi.current_value >= kpi.target_value * 0.9).length / kpis.length) * 100 : 85,
    };
  }, [currentVariantData, scenarioDef, scenario, costData, currentScenario, kpis]);

  /* ---------- Handlers: Tables ---------- */

  const setProductsPath = (nextProducts: any) => {
    setPlan((prev: any) => ({
      ...prev,
      products: {
        ...(prev.products || {}),
        [scenario]: {
          ...(prev.products?.[scenario] || {}),
          ...nextProducts,
        },
      },
    }));
    setSyncStatus((prev) => ({ ...prev, pendingChanges: prev.pendingChanges + 1, lastSync: new Date() }));
  };

  const handleProjectCellChange = (rowIndex: number, colIndex: number, value: any) => {
    const updated = as2D(currentVariantData.projects).map((r) => [...r]);
    if (updated[rowIndex]) {
      updated[rowIndex][colIndex] = value;
      setProductsPath({ projects: updated });
    }
  };
  const addNewProject = () => {
    const newRow = [
      `PROJ-${Date.now()}`,
      "New Project",
      "Development",
      "Must",
      "Project Manager",
      new Date().toISOString().split("T")[0],
      new Date(Date.now() + 30 * 864e5).toISOString().split("T")[0],
      "",
      "Project deliverables",
      "Project goals and objectives",
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
    const updated = [...as2D(currentVariantData.projects), newRow];
    setProductsPath({ projects: updated });
  };
  const deleteProject = (index: number) => {
    const updated = as2D(currentVariantData.projects).filter((_, i) => i !== index);
    setProductsPath({ projects: updated });
  };

  const handleResourceCellChange = (rowIndex: number, colIndex: number, value: any) => {
    const updated = as2D(currentVariantData.resources).map((r) => [...r]);
    if (updated[rowIndex]) {
      updated[rowIndex][colIndex] = value;
      setProductsPath({ resources: updated });
    }
  };
  const addNewResource = () => {
    const newRow = ["New Resource", "Personnel", 1, 0, "Department", ""];
    const updated = [...as2D(currentVariantData.resources), newRow];
    setProductsPath({ resources: updated });
  };
  const deleteResource = (index: number) => {
    const updated = as2D(currentVariantData.resources).filter((_, i) => i !== index);
    setProductsPath({ resources: updated });
  };

  const handleRiskCellChange = (rowIndex: number, colIndex: number, value: any) => {
    const updated = as2D(currentVariantData.risks).map((r) => [...r]);
    if (updated[rowIndex]) {
      updated[rowIndex][colIndex] = value;
      setProductsPath({ risks: updated });
    }
  };
  const addNewRisk = () => {
    const newRow = [
      `RISK-${Date.now()}`,
      "New Risk Description",
      "M",
      "M",
      "Mitigation strategy",
      "Owner",
      new Date(Date.now() + 30 * 864e5).toISOString().split("T")[0],
      "Open",
    ];
    const updated = [...as2D(currentVariantData.risks), newRow];
    setProductsPath({ risks: updated });
  };
  const deleteRisk = (index: number) => {
    const updated = as2D(currentVariantData.risks).filter((_, i) => i !== index);
    setProductsPath({ risks: updated });
  };

  /* ---------- Export: Weekly Summary (PDF) ---------- */

  const exportWeeklySummary = () => {
    const summary = (typeof generateWeeklySummary === "function" ? generateWeeklySummary() : {}) as Partial<WeeklySummary>;

    const weekLabel = String(summary?.week ?? new Date().toISOString().slice(0, 10));
    const projectsCompleted = Number(summary?.projectsCompleted ?? 0);
    const projectsOnTrack = Number(summary?.projectsOnTrack ?? 0);
    const projectsAtRisk = Number(summary?.projectsAtRisk ?? 0);
    const totalActiveProjects = projectsCompleted + projectsOnTrack + projectsAtRisk;

    const listify = <T,>(v: any): T[] => (Array.isArray(v) ? v : v ? [v] : []);
    const keyMilestones = listify<string>(summary?.keyMilestones);
    const criticalIssues = listify<string>(summary?.criticalIssues);
    const nextWeekPriorities = listify<string>(summary?.nextWeekPriorities);
    const kpiSummary = listify<{ name: string; current: number; target: number; trend: "up" | "down" | "stable" }>(summary?.kpiSummary);

    const tldr = analysis?.tldr?.length ? analysis.tldr : "Analysis pending...";
    const detailed = analysis?.summary?.length ? analysis.summary : "Detailed analysis will be available after CEO analysis is generated.";

    const kpiLines =
      kpiSummary.length > 0
        ? kpiSummary
            .map((k) => {
              const name = typeof k?.name === "string" ? k.name : "KPI";
              const current = Number((k as any)?.current ?? 0);
              const target = Number((k as any)?.target ?? 0);
              const trend = (k as any)?.trend === "up" ? "↗️" : (k as any)?.trend === "down" ? "↘️" : "→";
              return `• ${name}: ${current}/${target} ${trend}`;
            })
            .join("\n")
        : "• —";

    const milestoneLines = keyMilestones.length ? keyMilestones.map((m) => `• ${m}`).join("\n") : "• —";
    const issuesLines = criticalIssues.length ? criticalIssues.map((i) => `• ${i}`).join("\n") : "• No critical issues identified";
    const priorityLines = nextWeekPriorities.length ? nextWeekPriorities.map((p) => `• ${p}`).join("\n") : "• —";

    const content = `
WEEKLY PROJECT SUMMARY - ${weekLabel}
VitalTrace Manufacturing Scale-Up Dashboard
Scenario: ${scenario} | Variant: ${variant}

═══════════════════════════════════════════════════════════════

📊 PROJECT STATUS OVERVIEW
• Projects Completed: ${projectsCompleted}
• Projects On Track: ${projectsOnTrack}
• Projects At Risk: ${projectsAtRisk}
• Total Active Projects: ${totalActiveProjects}

🎯 KEY MILESTONES ACHIEVED
${milestoneLines}

⚠️ CRITICAL ISSUES REQUIRING ATTENTION
${issuesLines}

📈 KPI PERFORMANCE SUMMARY
${kpiLines}

🚀 NEXT WEEK PRIORITIES
${priorityLines}

═══════════════════════════════════════════════════════════════

📋 EXECUTIVE SUMMARY
${tldr}

🔍 DETAILED ANALYSIS
${detailed}

═══════════════════════════════════════════════════════════════
Generated: ${new Date().toLocaleString()}
Dashboard Version: v63
`.trim();

    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const margin = 40;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const maxWidth = pageWidth - margin * 2;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);

    const paragraphs = content.split("\n");
    let y = margin;

    for (const para of paragraphs) {
      const lines = doc.splitTextToSize(para, maxWidth);
      for (const line of lines) {
        if (y > pageHeight - margin) {
          doc.addPage();
          y = margin;
        }
        doc.text(line, margin, y);
        y += 16;
      }
      y += 8;
    }

    doc.save(`Weekly_Summary_${weekLabel}_${variant}_${scenario}.pdf`);
  };

  /* ---------- Generate Comprehensive Analysis (PDF) ---------- */

  const generateComprehensiveReportPDF = () => {
    const projects = as2D(currentVariantData.projects);
    const risks = as2D(currentVariantData.risks);
    const resources = as2D(currentVariantData.resources);
    const manufacturing = as2D(currentVariantData.manufacturing);

    const totalProjects = projects.length;
    const activeProjects = Math.floor(totalProjects * 0.7);
    const completedProjects = Math.floor(totalProjects * 0.2);
    const atRiskProjects = Math.max(totalProjects - activeProjects - completedProjects, 0);

    const totalTeamSize = resources.length + 15;
    const manufacturingProcesses = manufacturing.length;
    const equipmentCount = manufacturing.length; // simple proxy if you don't have separate equipment right now
    const resourcesAllocated = resources.length;

    const scenarioData: ScenarioDef = scenarioDef;
    const curCost = costData.find((c) => c.scenario_id === currentScenario?.id) || null;
    const annualRevenue = curCost ? scenarioData.unitsPerYear * 45 : 2250000;
    const totalCosts = curCost ? curCost.capex + curCost.opex : 1708250;
    const grossProfit = annualRevenue - totalCosts;
    const profitMargin = Math.max((grossProfit / Math.max(annualRevenue, 1)) * 100, 0);
    const roi = curCost ? Math.max(((annualRevenue - curCost.opex) / Math.max(curCost.capex, 1)) * 100, 0) : 131.7;
    const breakEvenMonths = curCost ? Math.max(Math.ceil(curCost.capex / Math.max(grossProfit / 12, 1)), 1) : 8;
    const cashFlowPositive = breakEvenMonths <= 12 ? "Yes" : "Delayed";

    const marketSize = scenario === "50k" ? 2.5 : 10.0;
    const marketShare = ((annualRevenue / 1_000_000) / (marketSize * 1000)) * 100;
    const timeToMarket = atRiskProjects <= 2 ? "On Schedule" : atRiskProjects <= 5 ? "Minor Delays" : "Significant Delays";

    const kpiHealthList = toArray(kpis).map((kpi) => {
      const performance = ((num(kpi.current_value) / Math.max(num(kpi.target_value), 1)) * 100);
      const variance = ((num(kpi.current_value) - num(kpi.target_value)) / Math.max(num(kpi.target_value), 1)) * 100;
      const trend = variance > 5 ? "Exceeding" : variance > -10 ? "On Track" : "Below Target";
      const status =
        num(kpi.current_value) >= num(kpi.target_value) * 0.9
          ? "On Track"
          : num(kpi.current_value) >= num(kpi.target_value) * 0.7
          ? "At Risk"
          : "Critical";
      return {
        name: kpi.name,
        performance: Math.round(performance),
        variance: Math.round(variance * 10) / 10,
        trend,
        status,
      };
    });

    const avgKpiPerformance =
      kpiHealthList.length > 0
        ? Math.round(kpiHealthList.reduce((s, k) => s + k.performance, 0) / kpiHealthList.length)
        : 85;

    const resourceEfficiency = resourcesAllocated > 0 ? Math.round((activeProjects / resourcesAllocated) * 100) : 100;
    const teamProductivity = totalTeamSize > 0 ? (activeProjects / totalTeamSize).toFixed(2) : "1.50";
    const capacityUtilization = Math.round((scenarioData.unitsPerYear / (scenario === "50k" ? 60000 : 250000)) * 100);

    const summaryText = `
# VitalTrace Manufacturing Scale-Up Executive Analysis
## ${variant} — ${scenario.toUpperCase()} Scenario

**Overall Health**: ${avgKpiPerformance >= 85 ? "EXCELLENT" : avgKpiPerformance >= 75 ? "GOOD" : avgKpiPerformance >= 65 ? "FAIR" : "NEEDS ATTENTION"}

- Projects: ${totalProjects} total (${activeProjects} active, ${completedProjects} completed, ${atRiskProjects} at-risk)
- Team: ${totalTeamSize} total, ${resourcesAllocated} allocated resources
- Processes: ${manufacturingProcesses}, Equipment: ${equipmentCount}
- Capacity Utilization: ${capacityUtilization}%
- Revenue Target: $${(annualRevenue / 1_000_000).toFixed(1)}M, Margin: ${profitMargin.toFixed(1)}%, ROI: ${roi.toFixed(1)}%, Break-even: ${breakEvenMonths} months, Cash Flow Positive: ${cashFlowPositive}
- Market Share (est.): ${marketShare.toFixed(3)}%
- Time to Market: ${timeToMarket}

### KPI Summary
${kpiHealthList.map((k) => `- ${k.name}: ${k.performance}% (${k.trend}, variance ${k.variance}%)`).join("\n")}
`.trim();

    setAnalysis({
      summary: summaryText,
      tldr: `VitalTrace ${variant}: ${totalProjects} projects (${activeProjects} active, ${atRiskProjects} at-risk). ${capacityUtilization}% capacity. $${(annualRevenue / 1_000_000).toFixed(1)}M revenue, ${profitMargin.toFixed(1)}% margin, ${roi.toFixed(1)}% ROI, ${breakEvenMonths}mo breakeven. KPIs avg ${avgKpiPerformance}%. ${timeToMarket}.`,
    });

    // Create PDF
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const margin = 40;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const maxWidth = pageWidth - margin * 2;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);

    const paragraphs = summaryText.split("\n");
    let y = margin;

    for (const para of paragraphs) {
      const lines = doc.splitTextToSize(para, maxWidth);
      for (const line of lines) {
        if (y > pageHeight - margin) {
          doc.addPage();
          y = margin;
        }
        doc.text(line, margin, y);
        y += 16;
      }
      y += 8;
    }

    doc.save(`Comprehensive_Analysis_${variant}_${scenario}.pdf`);
  };

  /* ---------- UI State: Tabs ---------- */

  const [activeTab, setActiveTab] = useState<"overview" | "projects" | "resources" | "risks" | "financials" | "analysis">(
    "overview"
  );

  /* ---------- Render ---------- */

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center space-x-2">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="text-lg font-medium">Loading Your Project</span>
          </div>
          <p className="text-sm text-muted-foreground">Retrieving your latest data from the database...</p>
          <Button variant="outline" onClick={() => setLoading(false)} className="mt-4">
            Skip Loading
          </Button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-rose-600 font-semibold text-lg">Error</div>
          <div className="text-slate-600">{error}</div>
          <Button variant="outline" onClick={() => setError(null)}>
            Dismiss
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">VitalTrace Manufacturing Scale-Up Dashboard</h1>
          <span className="text-xs px-2 py-1 rounded bg-slate-100 text-slate-700">Scenario: {scenario}</span>
          <span className="text-xs px-2 py-1 rounded bg-slate-100 text-slate-700">Variant: {variant}</span>
        </div>
        <SyncStatusIndicator syncStatus={syncStatus} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={activeTab === "overview" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveTab("overview")}
        >
          Overview
        </Button>
        <Button
          variant={activeTab === "projects" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveTab("projects")}
        >
          Projects
        </Button>
        <Button
          variant={activeTab === "resources" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveTab("resources")}
        >
          Resources
        </Button>
        <Button variant={activeTab === "risks" ? "default" : "outline"} size="sm" onClick={() => setActiveTab("risks")}>
          Risks
        </Button>
        <Button
          variant={activeTab === "financials" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveTab("financials")}
        >
          Financials
        </Button>
        <Button
          variant={activeTab === "analysis" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveTab("analysis")}
        >
          Analysis
        </Button>

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="default"
            size="sm"
            onClick={generateComprehensiveReportPDF}
            className="gap-2 bg-blue-600 hover:bg-blue-700"
          >
            <TrendingUp className="h-4 w-4" />
            Generate Comprehensive PDF
          </Button>
          <Button variant="secondary" size="sm" onClick={exportWeeklySummary} className="gap-2">
            <FileText className="h-4 w-4" />
            Export Weekly Summary PDF
          </Button>
        </div>
      </div>

      {/* Scenario/Variant selectors */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-700">Scenario</label>
          <select
            className="border rounded px-2 py-1"
            value={scenario}
            onChange={(e) => setScenario(e.target.value as ScenarioKey)}
          >
            <option value="50k">50k</option>
            <option value="200k">200k</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-700">Variant</label>
          <select
            className="border rounded px-2 py-1"
            value={variant}
            onChange={(e) => setVariant(e.target.value as Variant)}
          >
            <option value="Recess Nanodispensing">Recess Nanodispensing</option>
            <option value="Dipcoating">Dipcoating</option>
          </select>
        </div>
      </div>

      {/* Tabs */}
      {activeTab === "overview" && (
        <div className="space-y-4">
          <OverviewControls scenario={scenario} plan={plan} setPlan={setPlan} />
          <div className="grid md:grid-cols-3 gap-4">
            <div className="rounded-xl border p-4">
              <div className="text-sm text-slate-500">Target Production</div>
              <div className="text-2xl font-semibold">{overviewMetrics.targetProduction.toLocaleString()}</div>
            </div>
            <div className="rounded-xl border p-4">
              <div className="text-sm text-slate-500">Capacity Utilization</div>
              <div className="text-2xl font-semibold">{overviewMetrics.capacityUtilization}%</div>
            </div>
            <div className="rounded-xl border p-4">
              <div className="text-sm text-slate-500">Cost per Unit</div>
              <div className="text-2xl font-semibold">
                {typeof overviewMetrics.costPerUnit === "number" ? `$${overviewMetrics.costPerUnit.toFixed(2)}` : `$${overviewMetrics.costPerUnit}`}
              </div>
            </div>
            <div className="rounded-xl border p-4">
              <div className="text-sm text-slate-500">Projects</div>
              <div className="text-2xl font-semibold">
                {overviewMetrics.totalProjects} total • {overviewMetrics.activeProjects} active
              </div>
            </div>
            <div className="rounded-xl border p-4">
              <div className="text-sm text-slate-500">Risks</div>
              <div className="text-2xl font-semibold">
                {overviewMetrics.totalRisks} total • {overviewMetrics.highPriorityRisks} high
              </div>
            </div>
            <div className="rounded-xl border p-4">
              <div className="text-sm text-slate-500">Profit Margin</div>
              <div className="text-2xl font-semibold">
                {typeof overviewMetrics.profitMargin === "string" ? overviewMetrics.profitMargin : `${overviewMetrics.profitMargin}%`}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "projects" && (
        <ProjectsTable
          rows={as2D(currentVariantData.projects)}
          onCellChange={handleProjectCellChange}
          onAdd={addNewProject}
          onDelete={deleteProject}
        />
      )}

      {activeTab === "resources" && (
        <ResourcesTable
          rows={as2D(currentVariantData.resources)}
          onCellChange={handleResourceCellChange}
          onAdd={addNewResource}
          onDelete={deleteResource}
        />
      )}

      {activeTab === "risks" && (
        <RisksTable rows={as2D(currentVariantData.risks)} onCellChange={handleRiskCellChange} onAdd={addNewRisk} onDelete={deleteRisk} />
      )}

      {activeTab === "financials" && (
        <div className="grid gap-3">
          <div className="rounded-xl border p-4 grid gap-2">
            <div className="text-sm text-slate-600 font-semibold">Derived from Projects</div>
            <div className="grid md:grid-cols-3 gap-3">
              <div className="rounded-lg border p-3">
                <div className="text-xs text-slate-500">CapEx (Projects)</div>
                <div className="text-lg font-semibold">${financeFromProjects.capex.toLocaleString()}</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-slate-500">OpEx (Projects)</div>
                <div className="text-lg font-semibold">${financeFromProjects.opex.toLocaleString()}</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-slate-500">Total Budget (Projects)</div>
                <div className="text-lg font-semibold">${financeFromProjects.total.toLocaleString()}</div>
              </div>
            </div>
          </div>

          <div className="w-full overflow-x-auto">
            <table className="w-[900px] max-w-none border-collapse">
              <thead>
                <tr>
                  {["Category", "Item", "Amount", "Type", "Notes", "Actions"].map((h) => (
                    <th key={h} className="text-left bg-slate-50 border-b px-3 py-2 text-[13px] font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {financialData.map((r, i) => (
                  <tr key={i} className="border-b">
                    <td className="p-2">
                      <input
                        className="w-full border rounded px-2 py-1"
                        value={String(r[0] ?? "")}
                        onChange={(e) =>
                          setFinancialData((prev) => {
                            const copy = prev.map((row) => [...row]);
                            copy[i][0] = e.target.value;
                            return copy;
                          })
                        }
                      />
                    </td>
                    <td className="p-2">
                      <input
                        className="w-full border rounded px-2 py-1"
                        value={String(r[1] ?? "")}
                        onChange={(e) =>
                          setFinancialData((prev) => {
                            const copy = prev.map((row) => [...row]);
                            copy[i][1] = e.target.value;
                            return copy;
                          })
                        }
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        className="w-full border rounded px-2 py-1"
                        value={String(num(r[2] ?? 0))}
                        onChange={(e) =>
                          setFinancialData((prev) => {
                            const copy = prev.map((row) => [...row]);
                            copy[i][2] = Number(e.target.value);
                            return copy;
                          })
                        }
                      />
                    </td>
                    <td className="p-2">
                      <select
                        className="w-full border rounded px-2 py-1"
                        value={String(r[3] ?? "Expense")}
                        onChange={(e) =>
                          setFinancialData((prev) => {
                            const copy = prev.map((row) => [...row]);
                            copy[i][3] = e.target.value;
                            return copy;
                          })
                        }
                      >
                        <option value="Income">Income</option>
                        <option value="Expense">Expense</option>
                        <option value="Investment">Investment</option>
                      </select>
                    </td>
                    <td className="p-2">
                      <input
                        className="w-full border rounded px-2 py-1"
                        value={String(r[4] ?? "")}
                        onChange={(e) =>
                          setFinancialData((prev) => {
                            const copy = prev.map((row) => [...row]);
                            copy[i][4] = e.target.value;
                            return copy;
                          })
                        }
                      />
                    </td>
                    <td className="p-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setFinancialData((prev) => prev.filter((_, idx) => idx !== i))
                        }
                      >
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))}
                {financialData.length === 0 && (
                  <tr>
                    <td className="p-4 text-slate-500" colSpan={6}>
                      No financial rows yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setFinancialData((prev) => [...prev, ["New Category", "New Item", 0, "Expense", ""]])}
          >
            + Add Financial Row
          </Button>
        </div>
      )}

      {activeTab === "analysis" && (
        <div className="grid gap-3">
          <div className="rounded-xl border p-4 grid gap-2">
            <div className="text-sm text-slate-500">TL;DR</div>
            <div className="whitespace-pre-wrap">{analysis.tldr || "Run Generate Comprehensive PDF to produce an analysis."}</div>
          </div>
          <div className="rounded-xl border p-4 grid gap-2">
            <div className="text-sm text-slate-500">Detailed Analysis</div>
            <div className="whitespace-pre-wrap">{analysis.summary || "Detailed analysis will appear here."}</div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between pt-4">
        <div className="text-xs text-slate-500">Dashboard Version: v64</div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setPlan(clone(SEED_PLAN));
              setScenario("50k");
              setVariant("Recess Nanodispensing");
              setError(null);
            }}
          >
            Reset
          </Button>
          <Button variant="outline" size="sm" onClick={() => saveProjectDataToDatabase()}>
            {saving ? "Saving..." : "Save Now"}
          </Button>
        </div>
      </div>
    </div>
  );
}
