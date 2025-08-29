"use client";

import * as React from "react";

type AnyRow = any[];

/**
 * High-level overview with:
 * - Target units, KPI health, project completion
 * - Budget: sum(Project budgets) vs Planned (CapEx+OpEx)
 * - Takt vs Cycle time (top bottlenecks)
 * - Lightweight KPI sparkline (current/target)
 *
 * No external chart libs required.
 */
export default function OverviewPanel({
  scenario = "50k",
  variant = "Recess Nanodispensing",
  projects = [],
  processes = [],
  capexRows = [],
  opexRows = [],
  kpis = [],
  planScenarios = { "50k": { unitsPerYear: 50000, hoursPerDay: 8, shifts: 1 }, "200k": { unitsPerYear: 200000, hoursPerDay: 16, shifts: 2 } },
}: {
  scenario?: "50k" | "200k" | string;
  variant?: string;
  projects?: AnyRow[];
  processes?: AnyRow[];
  capexRows?: AnyRow[]; // [["item", qty, unit_cost, install_cost], ...]
  opexRows?: AnyRow[];  // [["item","per_unit|per_year", qty, unit_cost], ...]
  kpis?: { name: string; current_value?: number; target_value?: number; unit?: string }[];
  planScenarios?: Record<string, { unitsPerYear: number; hoursPerDay: number; shifts: number }>;
}) {
  // ----- Helpers
  const toNum = (v: any, d = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  };
  const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
  const fmt = (n: number) =>
    n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` :
    n >= 1_000 ? `$${(n / 1_000).toFixed(0)}k` : `$${n.toFixed(0)}`;
  const pct = (v: number) => `${Math.max(0, Math.min(100, Math.round(v)))}%`;

  // ----- Scenario
  const sc = planScenarios?.[scenario] ?? { unitsPerYear: 50000, hoursPerDay: 8, shifts: 1 };
  const targetUnits = toNum(sc.unitsPerYear, 50000);

  // ----- Projects
  // projectsHeaders (for reference): id, name, type, moscow, owner, start, finish, dependencies, deliverables, goal, R, A, C, I, needs, barriers, risks, budget_capex, budget_opex, percent_complete, process_link, critical, status, slack_days
  const idxBudgetCapex = 17;
  const idxBudgetOpex = 18;
  const idxPercent = 19;
  const idxStatus = 22;

  const totalProjects = projects.length;
  const completePct = totalProjects
    ? sum(projects.map(r => toNum(r[idxPercent]))) / (totalProjects * 100) * 100
    : 0;

  const onTrack = projects.filter(r => String(r[idxStatus] ?? "").toUpperCase() === "GREEN").length;
  const atRisk  = projects.filter(r => String(r[idxStatus] ?? "").toUpperCase() === "RED").length;

  const projBudgetCapex = sum(projects.map(r => toNum(r[idxBudgetCapex])));
  const projBudgetOpex  = sum(projects.map(r => toNum(r[idxBudgetOpex])));
  const projBudgetTotal = projBudgetCapex + projBudgetOpex;

  // ----- Planned CapEx / OpEx from dedicated tables
  const plannedCapex = sum(capexRows.map(r => toNum(r?.[1]) * toNum(r?.[2]) + toNum(r?.[3]))); // qty*unit + install
  const plannedOpex  = sum(opexRows.map(r => toNum(r?.[2]) * toNum(r?.[3])));                   // qty*unit
  const plannedTotal = plannedCapex + plannedOpex;

  // ----- KPI Health
  const kpiPerf = kpis.map(k => {
    const cur = toNum(k.current_value);
    const tar = Math.max(1e-9, toNum(k.target_value, 100));
    return Math.max(0, Math.min(1, cur / tar));
  });
  const avgKpi = kpiPerf.length ? (sum(kpiPerf) / kpiPerf.length) * 100 : 0;

  // sparkline points (current/target ratio)
  const sparkPts = kpiPerf.length ? kpiPerf : [0.8, 0.82, 0.78, 0.85, 0.87];
  const sparkW = 140, sparkH = 40, pad = 4;
  const step = (sparkW - pad * 2) / Math.max(1, sparkPts.length - 1);
  const sparkPath = sparkPts
    .map((v, i) => {
      const x = pad + i * step;
      // invert y so higher perf is higher line
      const y = pad + (1 - Math.max(0, Math.min(1, v))) * (sparkH - pad * 2);
      return `${i === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");

  // ----- Takt vs Cycle (bottlenecks)
  // Process columns (your Manufacturing page example): [name, ct_min, batch_size, yield, takt_target_s, ...]
  const pName = (r: AnyRow) => String(r?.[0] ?? "");
  const pCtS  = (r: AnyRow) => toNum(r?.[1]) * 60;
  const pTakt = (r: AnyRow) => toNum(r?.[4]);
  const procRows = processes.filter(r => pName(r));
  const bottlenecks = procRows
    .map(r => {
      const ct = pCtS(r);
      const tk = Math.max(1, pTakt(r));
      return { name: pName(r), ct, tk, ratio: ct / tk };
    })
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, 6);

  const maxCt = Math.max(1, ...bottlenecks.map(b => b.ct));
  const maxTk = Math.max(1, ...bottlenecks.map(b => b.tk));

  // ----- Bars helpers
  const Bar = ({ value, max, className = "" }: { value: number; max: number; className?: string }) => {
    const w = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
    return (
      <div className="h-2.5 w-full rounded bg-slate-200">
        <div className={`h-2.5 rounded ${className}`} style={{ width: `${w}%` }} />
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Overview</h2>
          <p className="text-sm text-slate-500">
            Variant: <span className="font-medium">{variant}</span> • Scenario: <span className="font-medium">{String(scenario).toUpperCase()}</span>
          </p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border p-4 shadow-sm">
          <p className="text-xs text-slate-500">Target units / year</p>
          <p className="mt-1 text-2xl font-semibold">{targetUnits.toLocaleString()}</p>
          <p className="mt-2 text-xs text-slate-500">Based on scenario configuration</p>
        </div>

        <div className="rounded-2xl border p-4 shadow-sm">
          <p className="text-xs text-slate-500">Project completion</p>
          <p className="mt-1 text-2xl font-semibold">{pct(completePct)}</p>
          <div className="mt-2">
            <Bar value={completePct} max={100} className="bg-emerald-500" />
            <p className="mt-2 text-xs text-slate-500">
              {onTrack} on track • {atRisk} at risk • {totalProjects} total
            </p>
          </div>
        </div>

        <div className="rounded-2xl border p-4 shadow-sm">
          <p className="text-xs text-slate-500">Average KPI performance</p>
          <p className="mt-1 text-2xl font-semibold">{pct(avgKpi)}</p>
          <svg width={sparkW} height={sparkH} className="mt-2">
            <path d={sparkPath} fill="none" stroke="currentColor" className="text-blue-600" strokeWidth="2" />
          </svg>
          <p className="mt-1 text-xs text-slate-500">Current / target (sparkline)</p>
        </div>

        <div className="rounded-2xl border p-4 shadow-sm">
          <p className="text-xs text-slate-500">Budget (Total)</p>
          <p className="mt-1 text-2xl font-semibold">{fmt(plannedTotal)}</p>
          <p className="mt-1 text-xs text-slate-500">
            CapEx {fmt(plannedCapex)} • OpEx {fmt(plannedOpex)}
          </p>
        </div>
      </div>

      {/* Budget comparison */}
      <div className="rounded-2xl border p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-medium">Actual vs Estimated Budget</p>
          <p className="text-xs text-slate-500">Planned (CapEx+OpEx) vs sum of project budgets</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="text-slate-600">Planned Total</span>
              <span className="font-medium">{fmt(plannedTotal)}</span>
            </div>
            <Bar value={plannedTotal} max={Math.max(plannedTotal, projBudgetTotal, 1)} className="bg-indigo-600" />
            <p className="mt-2 text-xs text-slate-500">
              CapEx {fmt(plannedCapex)} • OpEx {fmt(plannedOpex)}
            </p>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="text-slate-600">Project Budgets (sum)</span>
              <span className="font-medium">{fmt(projBudgetTotal)}</span>
            </div>
            <Bar value={projBudgetTotal} max={Math.max(plannedTotal, projBudgetTotal, 1)} className="bg-rose-600" />
            <p className="mt-2 text-xs text-slate-500">
              CapEx {fmt(projBudgetCapex)} • OpEx {fmt(projBudgetOpex)}
            </p>
          </div>
        </div>
      </div>

      {/* Takt vs Cycle (bottlenecks) */}
      <div className="rounded-2xl border p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-medium">Takt vs Cycle Time — Bottlenecks</p>
          <p className="text-xs text-slate-500">Top stations by (cycle / takt)</p>
        </div>

        {bottlenecks.length === 0 ? (
          <p className="text-sm text-slate-500">No manufacturing process data available.</p>
        ) : (
          <div className="space-y-3">
            {bottlenecks.map((b, i) => (
              <div key={i} className="grid grid-cols-12 items-center gap-3">
                <div className="col-span-12 sm:col-span-3">
                  <p className="truncate text-sm font-medium">{b.name}</p>
                  <p className="text-xs text-slate-500">Ratio {b.ratio.toFixed(2)}×</p>
                </div>
                <div className="col-span-12 sm:col-span-9 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="w-12 shrink-0 text-xs text-slate-500">Cycle</span>
                    <Bar value={b.ct} max={maxCt} className="bg-amber-500" />
                    <span className="w-12 shrink-0 text-right text-xs text-slate-500">{Math.round(b.ct)}s</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-12 shrink-0 text-xs text-slate-500">Takt</span>
                    <Bar value={b.tk} max={maxTk} className="bg-emerald-500" />
                    <span className="w-12 shrink-0 text-right text-xs text-slate-500">{Math.round(b.tk)}s</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* KPI table mini (optional quick glance) */}
      <div className="rounded-2xl border p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-medium">Key KPIs</p>
          <p className="text-xs text-slate-500">Current vs target</p>
        </div>
        {kpis.length === 0 ? (
          <p className="text-sm text-slate-500">No KPIs defined.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {kpis.map((k, i) => {
              const cur = toNum(k.current_value);
              const tar = Math.max(1e-9, toNum(k.target_value, 100));
              const ratio = cur / tar;
              return (
                <div key={i} className="rounded-xl border p-3">
                  <p className="truncate text-sm font-medium">{k.name}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {cur}{k.unit ? ` ${k.unit}` : ""} / {tar}{k.unit ? ` ${k.unit}` : ""}
                  </p>
                  <div className="mt-2">
                    <Bar value={ratio * 100} max={100} className={ratio >= 1 ? "bg-emerald-600" : ratio >= 0.9 ? "bg-amber-600" : "bg-rose-600"} />
                    <p className="mt-1 text-xs text-slate-500">{pct(ratio * 100)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
