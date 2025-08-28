"use client";

import React, { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  TrendingUp,
  Loader2,
  RefreshCcw,
  Save,
  Download,
  Upload,
  Plus,
  Trash2,
  Settings,
  Filter,
  FileText,
  Users,
  Factory,
  ClipboardList,
  AlertTriangle,
} from "lucide-react";
import { generateWeeklySummary } from "@/lib/utils";
import { clone, SEED_PLAN } from "@/lib/constants";

// ---------------- Types ----------------
interface Scenario {
  id: string;
  name: string;
  description: string;
  target_units: number;
  created_at: string;
  updated_at: string;
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

const WORK_DAYS = 240;
const MOSCOW = ["Must", "Should", "Could", "Won't"] as const;
const IMPACT = ["H", "M", "L"] as const;
const PROB = ["H", "M", "L"] as const;
const WHEN = ["Now", "Next", "Later"] as const;
const PRODUCT_VARIANTS = ["Recess Nanodispensing", "Dipcoating"] as const;

type Variant = (typeof PRODUCT_VARIANTS)[number];

interface SavedConfiguration {
  id: string;
  name: string;
  description?: string;
  data: any;
  created_at: string;
  updated_at: string;
}

interface VarianceAlert {
  id: string;
  kpi_id: string;
  kpi_name: string;
  type: "warning" | "critical";
  message: string;
  variance_percent: number;
  threshold: number;
  created_at: string;
  acknowledged: boolean;
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

interface SyncStatus {
  isOnline: boolean;
  lastSync: Date;
  pendingChanges: number;
  connectedUsers: number;
}

// ---------------- Small Components ----------------
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
  );
}

// put this near the top of the file with other helpers
function toArray<T = string>(v: any): T[] {
  if (Array.isArray(v)) return v as T[];
  if (v === null || v === undefined) return [];
  // if it’s a plain object, don’t wrap keys; stringify for the report
  if (typeof v === "object") return [JSON.stringify(v)];
  return [String(v)];
}

function CEOAnalysisButton({
  data,
  scenario,
  variant,
  onAnalysisComplete,
}: {
  data: any;
  scenario: string;
  variant: string;
  onAnalysisComplete: (analysis: { summary: string; tldr: string; ceoInsights?: string; meetingInsights?: string }) => void;
}) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const generateCEOAnalysis = async () => {
    setIsAnalyzing(true);
    // Simulate analysis work
    await new Promise((r) => setTimeout(r, 1500));

    const projects = data.projects || [];
    const kpis = data.kpis || [];
    const risks = data.risks || [];
    const costData = data.costData || [];

    const totalProjects = projects.length;
    const criticalProjects = projects.filter((p: any) => p?.[22] === "RED").length;
    const onTrackProjects = projects.filter((p: any) => p?.[22] === "GREEN").length;

    const budgetUtilization =
      costData.length > 0 ? (((costData[0].capex + costData[0].opex) / 2_000_000) * 100).toFixed(1) : "N/A";

    const kpiHealth =
      kpis.length > 0
        ? (
            (kpis.filter((kpi: any) => Math.abs(((kpi.current_value - kpi.target_value) / kpi.target_value) * 100) < 10)
              .length /
              kpis.length) *
            100
          ).toFixed(0)
        : "0";

    const highRisks = risks.filter((r: any) => r?.[2] === "H" || r?.[3] === "H").length;

    const ceoInsights = `
🎯 EXECUTIVE SNAPSHOT — ${scenario.toUpperCase()} / ${variant}

• Projects On Track: ${onTrackProjects}/${totalProjects}
• Critical Projects: ${criticalProjects}
• KPI Achievement: ${kpiHealth}%
• Budget Utilization: ${budgetUtilization}%
• High Risks: ${highRisks}

Recommendations:
${criticalProjects > 0 ? "• Immediate intervention on critical projects" : "• Portfolio operating within parameters"}
${Number.parseInt(kpiHealth) < 80 ? "• Improve KPI attainment via resourcing/prioritization" : "• KPI trajectory acceptable"}
${highRisks > 2 ? "• Mitigate top risks with executive owners" : "• Risk profile stable"}
`.trim();

    const analysis = {
      summary: ceoInsights,
      tldr: `${totalProjects} projects; ${onTrackProjects} on track, ${criticalProjects} critical; KPI ${kpiHealth}%`,
      ceoInsights,
    };

    setIsAnalyzing(false);
    onAnalysisComplete(analysis);
  };

  return (
    <Button
      variant="default"
      size="sm"
      onClick={generateCEOAnalysis}
      disabled={isAnalyzing}
      className="gap-2 bg-blue-600 hover:bg-blue-700"
    >
      {isAnalyzing ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Analyzing...
        </>
      ) : (
        <>
          <TrendingUp className="h-4 w-4" />
          CEO Analysis
        </>
      )}
    </Button>
  );
}

// ---------------- Main Content ----------------
const ScaleUpDashboardContent: React.FC = () => {
  // Core loading & error state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // View state
  const [activeTab, setActiveTab] = useState<
    "overview" | "projects" | "manufacturing" | "kpis" | "risks" | "meetings" | "resources" | "finance" | "glossary" | "analysis" | "settings"
  >("overview");
  const [filterText, setFilterText] = useState("");
  const [wrapText, setWrapText] = useState(true);

  // Scenario / Variant
  const [scenario, setScenario] = useState<"50k" | "200k">("50k");
  const [variant, setVariant] = useState<Variant>("Recess Nanodispensing");

  // Plan / data model
  const [plan, setPlan] = useState(() => {
    const initialPlan = clone(SEED_PLAN);
    if (!initialPlan.scenarios) {
      initialPlan.scenarios = {
        "50k": { unitsPerYear: 50000, hoursPerDay: 8, shifts: 1 },
        "200k": { unitsPerYear: 200000, hoursPerDay: 16, shifts: 2 },
      };
    }
    return initialPlan;
  });

  const [costData, setCostData] = useState<CostData[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);

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

  const [editingKpi, setEditingKpi] = useState<KPI | null>(null);
  const [editForm, setEditForm] = useState<Partial<KPI>>({});

  const [sliderLimits] = useState({
    productionVolume: { min: 10000, max: 500000 },
    sellingPrice: { min: 20, max: 200 },
    unitCost: { min: 10, max: 100 },
    laborCostMultiplier: { min: 0.5, max: 2.0 },
    materialCostMultiplier: { min: 0.5, max: 2.0 },
    overheadMultiplier: { min: 0.5, max: 2.0 },
  });

  const [whatIfParams, setWhatIfParams] = useState({
    productionVolume: 50000,
    unitCost: 25.0,
    sellingPrice: 45.0,
    laborCostMultiplier: 1.0,
    materialCostMultiplier: 1.0,
    overheadMultiplier: 1.0,
  });

  const [whatIfMode, setWhatIfMode] = useState(false);

  const [savedConfigurations, setSavedConfigurations] = useState<SavedConfiguration[]>([]);
  const [loadingConfigs, setLoadingConfigs] = useState(false);
  const [currentScenario, setCurrentScenario] = useState<Scenario | null>(null);

  const [analysis, setAnalysis] = useState<{ summary: string; tldr: string }>({ summary: "", tldr: "" });

  const [meetingAgenda, setMeetingAgenda] = useState({
    title: "Weekly Project Update",
    date: new Date().toISOString().split("T")[0],
    time: "10:00",
    duration: "60 minutes",
    attendees: "Project Team, Stakeholders",
    location: "Conference Room A / Zoom",
    agenda: [
      "1. Welcome & Introductions (5 min)",
      "2. Previous Meeting Action Items Review (10 min)",
      "3. Project Status Updates (20 min)",
      "4. Risk & Issue Discussion (10 min)",
      "5. Resource Requirements (10 min)",
      "6. Next Steps & Action Items (5 min)",
    ],
    objectives: "Review project progress, address blockers, align on priorities",
    preparation: "Please review project dashboard and prepare status updates",
  });

  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
  ]);

  const [glossaryTerms, setGlossaryTerms] = useState<any[][]>([
    ["IHCL", "Ion-Implanted Hydrophilic Coating Layer - Surface treatment process"],
    ["OCP", "Open Circuit Potential - Electrochemical measurement technique"],
    ["Plasma", "Plasma surface treatment for enhanced adhesion"],
    ["Monolayer", "Single molecular layer coating application"],
    ["Dipcoating", "Controlled immersion coating process"],
    ["Takt Time", "Available production time divided by customer demand"],
    ["Cycle Time", "Time required to complete one production cycle"],
    ["Yield", "Percentage of good units produced vs total units processed"],
    ["QC", "Quality Control - Inspection and testing processes"],
    ["CapEx", "Capital Expenditure - Investment in equipment and facilities"],
    ["OpEx", "Operating Expenditure - Ongoing operational costs"],
    ["KPI", "Key Performance Indicator - Metrics for measuring success"],
    ["Variance Analysis", "Comparison of actual vs target performance"],
    ["Production Efficiency", "Ratio of actual output to maximum possible output"],
    ["Quality Score", "Composite metric of product quality measures"],
    ["Cost Reduction", "Percentage decrease in production costs"],
    ["Time to Market", "Duration from concept to product launch"],
    ["Batch Size", "Number of units processed together"],
    ["Validation Stage", "Level of process qualification and approval"],
    ["Semi-Auto", "Semi-automated process requiring operator intervention"],
    ["Auto", "Fully automated process"],
    ["Manual", "Process requiring full operator control"],
    ["Vision System", "Automated optical inspection equipment"],
    ["Cleanroom", "Controlled environment with low contamination levels"],
    ["Nanodispensing", "Precise dispensing of nanoliter volumes"],
  ]);

  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    isOnline: true,
    lastSync: new Date(),
    pendingChanges: 0,
    connectedUsers: 1,
  });

  const [_wsConnection, _setWsConnection] = useState<WebSocket | null>(null);

  const [enhancedAnalysis, setEnhancedAnalysis] = useState<{
    summary: string;
    tldr: string;
    ceoInsights?: string;
    meetingInsights?: string;
  }>({
    summary: "",
    tldr: "",
    meetingInsights: "",
  });

  function toArray<T = string>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value === null || value === undefined) return [];
  if (typeof value === "object") return [JSON.stringify(value)];
  return [String(value)];
}

const exportWeeklySummary = () => {
  const summary = (typeof generateWeeklySummary === "function" ? generateWeeklySummary() : {}) as any;

  const weekLabel = String(summary?.week ?? new Date().toISOString().slice(0, 10));
  const projectsCompleted = Number(summary?.projectsCompleted ?? 0);
  const projectsOnTrack = Number(summary?.projectsOnTrack ?? 0);
  const projectsAtRisk = Number(summary?.projectsAtRisk ?? 0);
  const totalActiveProjects = projectsCompleted + projectsOnTrack + projectsAtRisk;

  const keyMilestones = toArray<string>(summary?.keyMilestones);
  const criticalIssues = toArray<string>(summary?.criticalIssues);
  const nextWeekPriorities = toArray<string>(summary?.nextWeekPriorities);
  const kpiSummary = toArray<{ name: string; current: number; target: number; trend: "up" | "down" | "stable" }>(
    summary?.kpiSummary,
  );

  const tldr = analysis && typeof analysis.tldr === "string" && analysis.tldr.length > 0 ? analysis.tldr : "Analysis pending...";
  const detailed =
    analysis && typeof analysis.summary === "string" && analysis.summary.length > 0
      ? analysis.summary
      : "Detailed analysis will be available after CEO analysis is generated.";

  const kpiLines =
    kpiSummary.length > 0
      ? kpiSummary
          .map((kpi) => {
            const name = typeof kpi?.name === "string" ? kpi.name : "KPI";
            const current = Number((kpi as any)?.current ?? 0);
            const target = Number((kpi as any)?.target ?? 0);
            const trend =
              (kpi as any)?.trend === "up" ? "↗️" : (kpi as any)?.trend === "down" ? "↘️" : "→";
            return `• ${name}: ${current}/${target} ${trend}`;
          })
          .join("\n")
      : "• —";

  const milestoneLines = keyMilestones.length > 0 ? keyMilestones.map((m) => `• ${m}`).join("\n") : "• —";
  const issuesLines =
    criticalIssues.length > 0 ? criticalIssues.map((i) => `• ${i}`).join("\n") : "• No critical issues identified";
  const priorityLines =
    nextWeekPriorities.length > 0 ? nextWeekPriorities.map((p) => `• ${p}`).join("\n") : "• —";

  const reportContent = `
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

  const blob = new Blob([reportContent], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Weekly_Summary_${weekLabel}_${variant}_${scenario}.txt`;
  a.click();
  URL.revokeObjectURL(url);
};

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

    const result = {
      ...baseData,
      kpis: kpis.length > 0 ? kpis : baseData.kpis || [],
      scenarios: scenarios.length > 0 ? scenarios : baseData.scenarios || [],
      costData: costData.length > 0 ? costData : baseData.costData || [],
      projectsCount: (baseData.projects && baseData.projects.length) || 0,
      processesCount: (baseData.processes && baseData.processes.length) || 0,
      manufacturingCount: (baseData.manufacturing && baseData.manufacturing.length) || 0,
      hiringCount: (baseData.hiring && baseData.hiring.length) || 0,
      resourcesCount: (baseData.resources && baseData.resources.length) || 0,
    };

    return result;
  }, [plan.products, scenario, kpis, scenarios, costData, plan]);

  const capexTotal50 = useMemo(
    () => (currentVariantData.capex50k || []).reduce((s: number, r: any) => s + (Number(r[1]) * Number(r[2]) + Number(r[3])), 0),
    [currentVariantData.capex50k]
  );
  const capexTotal200 = useMemo(
    () => (currentVariantData.capex200k || []).reduce((s: number, r: any) => s + (Number(r[1]) * Number(r[2]) + Number(r[3])), 0),
    [currentVariantData.capex200k]
  );
  const opexTotal50 = useMemo(
    () =>
      (currentVariantData.opex50k || []).reduce(
        (s: number, r: any) => s + Number(r[2]) * Number(r[3]) * (String(r[1]) === "per_unit" ? 1 : 1),
        0
      ),
    [currentVariantData.opex50k]
  );
  const opexTotal200 = useMemo(
    () =>
      (currentVariantData.opex200k || []).reduce(
        (s: number, r: any) => s + Number(r[2]) * Number(r[3]) * (String(r[1]) === "per_unit" ? 1 : 1),
        0
      ),
    [currentVariantData.opex200k]
  );

  const calculateWhatIfImpact = () => {
    if (!costData || !Array.isArray(costData) || costData.length === 0 || !scenarios || scenarios.length === 0) {
      return null;
    }
    const baseVolume = scenario === "50k" ? 50000 : 200000;
    const volumeRatio = whatIfParams.productionVolume / baseVolume;

    const currentScenarioObj = scenarios.find((s) => s.name === scenario);
    const baseCosts = currentScenarioObj ? costData.find((c) => c.scenario_id === currentScenarioObj.id) : null;
    if (!baseCosts) return null;

    const adjustedCapEx = baseCosts.capex * Math.sqrt(volumeRatio);
    const adjustedOpEx =
      baseCosts.opex *
      volumeRatio *
      whatIfParams.laborCostMultiplier *
      whatIfParams.materialCostMultiplier *
      whatIfParams.overheadMultiplier;
    const adjustedCPU = (adjustedCapEx + adjustedOpEx) / whatIfParams.productionVolume;

    const revenue = whatIfParams.productionVolume * whatIfParams.sellingPrice;
    const profit = revenue - adjustedOpEx;
    const profitMargin = (profit / revenue) * 100;

    return {
      capex: adjustedCapEx,
      opex: adjustedOpEx,
      cpu: adjustedCPU,
      revenue,
      profit,
      profitMargin,
      volumeChange: ((whatIfParams.productionVolume - baseVolume) / baseVolume) * 100,
    };
  };

  const [currentVariantDataState, setCurrentVariantData] = useState<any>(currentVariantData);

  const setSavingState = (value: boolean) => setSaving(value);

  const saveProjectDataToDatabase = async () => {
    try {
      setSavingState(true);
      const projectData = {
        plan,
        scenario,
        variant,
        currentVariantData,
        lastSaved: new Date().toISOString(),
      };

      const configName = `ScaleUp-Dashboard-Config`;
      const response = await fetch("/api/configurations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: configName,
          description: "ScaleUp Dashboard Configuration",
          data: projectData,
          modified_by: "user",
          upsert: true,
        }),
      });

      if (response.ok) {
        setSyncStatus((prev) => ({
          ...prev,
          lastSync: new Date(),
          pendingChanges: 0,
          isOnline: true,
        }));
      } else {
        setError("Failed to save data. Please try again.");
      }
    } catch (_error) {
      setError("Failed to save data. Please check your connection.");
      setSyncStatus((prev) => ({ ...prev, isOnline: false }));
    } finally {
      setSavingState(false);
    }
  };

  const loadProjectDataFromDatabase = async () => {
    try {
      setLoading(true);
      setError(null);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch("/api/configurations", { signal: controller.signal });
      clearTimeout(timeoutId);

      if (response.ok) {
        const configs = await response.json();

        let latestConfig = configs.find((c: any) => c.name === "ScaleUp-Dashboard-Config");
        if (!latestConfig) {
          latestConfig = configs
            .filter((c: any) => c.name.startsWith("Project-Data-") || c.name.includes("ScaleUp"))
            .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
        }

        if (latestConfig && latestConfig.data) {
          const {
            plan: loadedPlan,
            scenario: loadedScenario,
            variant: loadedVariant,
            currentVariantData: loadedVariantData,
          } = latestConfig.data;

          if (loadedPlan && Object.keys(loadedPlan).length > 0) setPlan(loadedPlan);
          if (loadedScenario) setScenario(loadedScenario);
          if (loadedVariant) setVariant(loadedVariant);
          if (loadedVariantData) setCurrentVariantData(loadedVariantData);
        }
      } else {
        setError("Failed to load data. Using default values.");
      }
    } catch (e: any) {
      if (e?.name === "AbortError") {
        setError("Loading timed out. Using default values.");
      } else {
        setError("Failed to load data. Please check your connection.");
      }
    } finally {
      setLoading(false);
    }
  };

  const generateComprehensiveCEOAnalysis = () => {
    const currentData = currentVariantData;
    const scenarioData =
      plan.scenarios && plan.scenarios[scenario]
        ? plan.scenarios[scenario]
        : { unitsPerYear: scenario === "50k" ? 50000 : 200000 };
    const currentCostData = costData.find((c) => c.scenario_id === currentScenario?.id);

    const meetings = currentData.meetings || [];
    const recentMeetings = meetings.filter((m: any) => {
      const meetingDate = new Date(m?.[2] || new Date().toISOString());
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
      return meetingDate >= oneMonthAgo;
    });

    const totalProjects = currentData.projectsCount || 0;
    const activeProjects = Math.floor(totalProjects * 0.7);
    const completedProjects = Math.floor(totalProjects * 0.2);
    const atRiskProjects = Math.max(totalProjects - activeProjects - completedProjects, 0);

    const totalTeamSize = (currentData.hiringCount || 0) + 15;
    const manufacturingProcessCount = currentData.processesCount || 0;
    const equipmentCount = currentData.manufacturingCount || 0;
    const resourcesAllocated = currentData.resourcesCount || 0;

    const annualRevenue = currentCostData ? scenarioData.unitsPerYear * 45 : 2_250_000;
    const totalCosts = currentCostData ? currentCostData.capex + currentCostData.opex : 1_708_250;
    const grossProfit = annualRevenue - totalCosts;
    const profitMargin = ((grossProfit / annualRevenue) * 100).toFixed(1);
    const roi = currentCostData ? (((annualRevenue - currentCostData.opex) / currentCostData.capex) * 100).toFixed(1) : "131.7";
    const breakEvenMonths = currentCostData ? Math.ceil(currentCostData.capex / (grossProfit / 12)) : 8;

    const kpiHealth =
      kpis.length > 0
        ? kpis.map((kpi) => {
            const performance = ((kpi.current_value / kpi.target_value) * 100).toFixed(0);
            const variance = (((kpi.current_value - kpi.target_value) / kpi.target_value) * 100).toFixed(1);
            const trend = parseFloat(variance) > 5 ? "Exceeding" : parseFloat(variance) > -10 ? "On Track" : "Below Target";
            return { name: kpi.name, performance, variance, trend };
          })
        : [];

    const avgKpiPerformance =
      kpiHealth.length > 0
        ? (kpiHealth.reduce((sum, k) => sum + Number.parseFloat(k.performance), 0) / kpiHealth.length).toFixed(1)
        : "85.0";

    const analysisText = `
# VitalTrace Manufacturing Scale-Up Executive Analysis
## ${variant} — ${scenario.toUpperCase()} Scenario

**Summary:** ${totalProjects} projects (${activeProjects} active, ${atRiskProjects} at risk). Team ${totalTeamSize}. ${manufacturingProcessCount} processes, ${equipmentCount} systems. ${resourcesAllocated} resources allocated.

**Financials:** Revenue $${(annualRevenue / 1_000_000).toFixed(1)}M, margin ${profitMargin}%, ROI ${roi}%, break-even ${breakEvenMonths} months.

**KPI Average:** ${avgKpiPerformance}%.
${kpiHealth.map((k) => `- ${k.name}: ${k.performance}% (${k.trend}; variance ${k.variance}%)`).join("\n")}
`.trim();

    const tldr = `Rev $${(annualRevenue / 1_000_000).toFixed(1)}M | Margin ${profitMargin}% | ROI ${roi}% | Break-even ${breakEvenMonths} mo | KPIs avg ${avgKpiPerformance}%`;

    setEnhancedAnalysis({ summary: analysisText, tldr });
    setActiveTab("analysis");
  };

  const initializePollingSync = useCallback(() => {
    setSyncStatus((prev) => ({ ...prev, isOnline: true }));
    return () => {};
  }, []);

  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const broadcastDataUpdate = useCallback((section: string, _data: any) => {
    setSyncStatus((prev) => ({
      ...prev,
      pendingChanges: prev.pendingChanges + 1,
      lastSync: new Date(),
    }));
  }, []);

  useEffect(() => {
    loadProjectDataFromDatabase();
    const fallbackTimeout = setTimeout(() => setLoading(false), 15000);
    return () => clearTimeout(fallbackTimeout);
  }, []);

  useEffect(() => {
    if (!loading && plan && Object.keys(plan).length > 0) {
      if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
      autoSaveTimeoutRef.current = setTimeout(() => {
        saveProjectDataToDatabase();
      }, 3000);
      return () => {
        if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
      };
    }
  }, [plan, scenario, variant, currentVariantData, loading]);

  useEffect(() => {
    if (!loading) {
      broadcastDataUpdate("plan", plan);
    }
  }, [plan, scenario, variant, loading, broadcastDataUpdate]);

  const overviewMetrics = useMemo(() => {
    const scenarioData =
      plan.scenarios && plan.scenarios[scenario]
        ? plan.scenarios[scenario]
        : { unitsPerYear: scenario === "50k" ? 50000 : 200000 };
    const currentCostData = costData.find((c) => c.scenario_id === currentScenario?.id);

    return {
      targetProduction: scenarioData.unitsPerYear,
      productionEfficiency: currentCostData ? (100 - ((currentCostData.cost_per_unit - 25) / 25) * 100).toFixed(1) : "85.2",
      costPerUnit: currentCostData ? currentCostData.cost_per_unit : 32.06,
      totalProjects: currentVariantData.projectsCount || 0,
      activeProjects: Math.floor((currentVariantData.projectsCount || 0) * 0.7),
      completedProjects: Math.floor((currentVariantData.projectsCount || 0) * 0.2),
      manufacturingProcesses: currentVariantData.processesCount || 0,
      equipmentSystems: currentVariantData.manufacturingCount || 0,
      capacityUtilization: (
        (scenarioData.unitsPerYear / (scenario === "50k" ? 60000 : 250000)) *
        100
      ).toFixed(0),
      annualRevenue: currentCostData ? scenarioData.unitsPerYear * 45 : 2_250_000,
      totalInvestment: currentCostData ? currentCostData.capex + currentCostData.opex : 1_708_250,
      profitMargin: currentCostData
        ? (
            ((scenarioData.unitsPerYear * 45 - currentCostData.capex - currentCostData.opex) / (scenarioData.unitsPerYear * 45)) *
            100
          ).toFixed(1)
        : "28.7",
      teamSize: (currentVariantData.hiringCount || 0) + 15,
      newHires: currentVariantData.hiringCount || 0,
      resourcesAllocated: currentVariantData.resourcesCount || 0,
      totalRisks: (currentVariantData.risks || []).length,
      highPriorityRisks: Math.floor((currentVariantData.risks || []).length * 0.3),
      kpiHealth: kpis.length > 0 ? (kpis.filter((k) => k.current_value >= k.target_value * 0.9).length / kpis.length) * 100 : 85,
    };
  }, [currentVariantData, plan, scenario, costData, currentScenario, kpis]);

  const capexBuffered50 = capexTotal50 * (1 + plan.bufferPct);
  const capexBuffered200 = capexTotal200 * (1 + plan.bufferPct);

  const requiredUPH = (unitsPerYear: number, hoursPerDay: number, shifts: number) =>
    unitsPerYear / (WORK_DAYS * hoursPerDay * shifts);

  const sc =
    (plan && plan.scenarios && plan.scenarios[scenario]) || { unitsPerYear: 50000, hoursPerDay: 8, shifts: 1 };
  const uph = requiredUPH(sc.unitsPerYear, sc.hoursPerDay, sc.shifts);
  const opexSelected = scenario === "50k" ? opexTotal50 : opexTotal200;
  const cpu = sc.unitsPerYear > 0 ? opexSelected / sc.unitsPerYear : 0;

  const currentLaunch =
    scenario === "50k"
      ? (currentVariantData.launch && currentVariantData.launch.fiftyK) || new Date().toISOString()
      : (currentVariantData.launch && currentVariantData.launch.twoHundredK) || new Date().toISOString();

  const projectRows = useMemo(() => {
    const projects = currentVariantData.projects || [];
    const projectArrays = projects.map((project: any, index: number) => {
      if (Array.isArray(project)) return project;
      if (!project || typeof project !== "object") {
        return [
          `PROJ-${Date.now()}-${index}`,
          "New Project",
          "Planning",
          "Medium",
          "",
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
          false,
          "Planning",
          0,
        ];
      }
      return [
        project.id || `PROJ-${Date.now()}-${index}`,
        project.name || "",
        project.phase || "Planning",
        project.priority || "Medium",
        project.owner || project.assignee || "",
        project.startDate || project.start_date || "",
        project.endDate || project.end_date || "",
        project.budget || 0,
        project.deliverables || "",
        project.objectives || project.description || "",
        project.raciR || "",
        project.raciA || "",
        project.raciC || "",
        project.raciI || "",
        project.resources || "",
        project.barriers || "",
        project.risks || "",
        project.progress || 0,
        project.cost || project.budget || 0,
        project.revenue || 0,
        project.notes || "",
        project.complete || false,
        project.status || "Planning",
        project.score || 0,
      ];
    });
    return projectArrays;
  }, [currentVariantData.projects]);

  // --- Cell handlers (wire to tables) ---
  const handleProjectCellChange = (rowIndex: number, colIndex: number, value: any) => {
    const updatedProjects = [...(currentVariantData.projects || [])];
    if (updatedProjects[rowIndex]) {
      if (!Array.isArray(updatedProjects[rowIndex])) {
        updatedProjects[rowIndex] = projectRows[rowIndex];
      }
      updatedProjects[rowIndex][colIndex] = value;
      setPlan((prev: any) => ({
        ...prev,
        products: {
          ...prev.products,
          [scenario]: {
            ...prev.products[scenario],
            projects: updatedProjects,
          },
        },
      }));
      broadcastDataUpdate("projects", updatedProjects);
    }
  };

  const handleManufacturingCellChange = (rowIndex: number, colIndex: number, value: any) => {
    const updated = [...manufacturingProcesses];
    if (updated[rowIndex]) {
      updated[rowIndex][colIndex] = value;
      setManufacturingProcesses(updated);
      setPlan((prev: any) => ({
        ...prev,
        products: {
          ...prev.products,
          [scenario]: {
            ...prev.products[scenario],
            manufacturing: updated,
          },
        },
      }));
      broadcastDataUpdate("manufacturing", updated);
    }
  };

  const handleResourceCellChange = (rowIndex: number, colIndex: number, value: any) => {
    const updated = [...(currentVariantData.resources || [])];
    if (updated[rowIndex]) {
      updated[rowIndex][colIndex] = value;
      setPlan((prev: any) => ({
        ...prev,
        products: {
          ...prev.products,
          [scenario]: {
            ...prev.products[scenario],
            resources: updated,
          },
        },
      }));
      broadcastDataUpdate("resources", updated);
    }
  };

  const handleRiskCellChange = (rowIndex: number, colIndex: number, value: any) => {
    const updated = [...(currentVariantData.risks || [])];
    if (updated[rowIndex]) {
      updated[rowIndex][colIndex] = value;
      setPlan((prev: any) => ({
        ...prev,
        products: {
          ...prev.products,
          [scenario]: {
            ...prev.products[scenario],
            risks: updated,
          },
        },
      }));
      broadcastDataUpdate("risks", updated);
    }
  };

  const handleKpiCellChange = (rowIndex: number, colIndex: number, value: any) => {
    const updatedKpis = [...kpis];
    if (updatedKpis[rowIndex]) {
      const kpiFieldMap: Record<number, keyof KPI> = {
        0: "name",
        1: "current_value",
        2: "target_value",
        3: "unit",
        4: "owner",
      };
      const fieldName = kpiFieldMap[colIndex];
      if (fieldName) {
        let processedValue: any = value;
        if (fieldName === "current_value" || fieldName === "target_value") {
          processedValue = Number.parseFloat(value) || 0;
        }
        updatedKpis[rowIndex] = {
          ...updatedKpis[rowIndex],
          [fieldName]: processedValue,
          updated_at: new Date().toISOString(),
        };
        setKpis(updatedKpis);
        broadcastDataUpdate("kpis", updatedKpis);
      }
    }
  };

  const handleMeetingCellChange = (rowIndex: number, colIndex: number, value: any) => {
    const updatedMeetings = [...(currentVariantData.meetings || [])];
    if (updatedMeetings[rowIndex]) {
      updatedMeetings[rowIndex][colIndex] = value;
      setPlan((prev: any) => ({
        ...prev,
        products: {
          ...prev.products,
          [scenario]: {
            ...prev.products[scenario],
            meetings: updatedMeetings,
          },
        },
      }));
      broadcastDataUpdate("meetings", updatedMeetings);
    }
  };

  // --- Row add/delete helpers ---
  const addNewProject = () => {
    const newProject = [
      `PROJ-${Date.now()}`,
      "New Project",
      "Development",
      "Must",
      "Project Manager",
      new Date().toISOString().split("T")[0],
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
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
    setPlan((prev: any) => ({
      ...prev,
      products: {
        ...prev.products,
        [scenario]: {
          ...prev.products[scenario],
          projects: [...(prev.products[scenario]?.projects || []), newProject],
        },
      },
    }));
  };

  const deleteProject = (index: number) => {
    const updatedProjects = (currentVariantData.projects || []).filter((_: any, i: number) => i !== index);
    setPlan((prev: any) => ({
      ...prev,
      products: {
        ...prev.products,
        [scenario]: {
          ...prev.products[scenario],
          projects: updatedProjects,
        },
      },
    }));
  };

  const addNewManufacturingItem = () => {
    const newItem = ["New Manufacturing Process", 0, 1, 100, 0, "Manual Station", "Manual", "In Development", "Operator"];
    setManufacturingProcesses((prev) => [...prev, newItem]);
    setPlan((prev: any) => ({
      ...prev,
      products: {
        ...prev.products,
        [scenario]: {
          ...prev.products[scenario],
          manufacturing: [...(prev.products[scenario]?.manufacturing || []), newItem],
        },
      },
    }));
  };

  const deleteManufacturingItem = (index: number) => {
    const updatedItems = manufacturingProcesses.filter((_, i) => i !== index);
    setManufacturingProcesses(updatedItems);
    setPlan((prev: any) => ({
      ...prev,
      products: {
        ...prev.products,
        [scenario]: {
          ...prev.products[scenario],
          manufacturing: updatedItems,
        },
      },
    }));
  };

  const addNewKPI = () => {
    const newKPI: KPI = {
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
    setKpis((prev) => [...prev, newKPI]);
    broadcastDataUpdate("kpis", [...kpis, newKPI]);
  };

  const deleteKPI = (kpiId: string) => {
    const updated = kpis.filter((k) => k.id !== kpiId);
    setKpis(updated);
    broadcastDataUpdate("kpis", updated);
  };

  const addNewRisk = () => {
    const newRisk = [
      `RISK-${Date.now()}`,
      "New Risk Description",
      "Medium",
      "Medium",
      "Mitigation strategy",
      "Risk Owner",
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      "Open",
    ];
    setPlan((prev: any) => ({
      ...prev,
      products: {
        ...prev.products,
        [scenario]: {
          ...prev.products[scenario],
          risks: [...(prev.products[scenario]?.risks || []), newRisk],
        },
      },
    }));
  };

  const deleteRisk = (index: number) => {
    const updatedRisks = (currentVariantData.risks || []).filter((_: any, i: number) => i !== index);
    setPlan((prev: any) => ({
      ...prev,
      products: {
        ...prev.products,
        [scenario]: {
          ...prev.products[scenario],
          risks: updatedRisks,
        },
      },
    }));
  };

  const addNewMeeting = () => {
    const newMeeting = [
      `MEET-${Date.now()}`,
      "New Project Meeting",
      new Date().toISOString().split("T")[0],
      "Team Members",
      "Scheduled",
      "60 minutes",
      "Meeting agenda and notes",
    ];
    setPlan((prev: any) => ({
      ...prev,
      products: {
        ...prev.products,
        [scenario]: {
          ...prev.products[scenario],
          meetings: [...(prev.products[scenario]?.meetings || []), newMeeting],
        },
      },
    }));
  };

  const deleteMeeting = (index: number) => {
    const updatedMeetings = (currentVariantData.meetings || []).filter((_: any, i: number) => i !== index);
    setPlan((prev: any) => ({
      ...prev,
      products: {
        ...prev.products,
        [scenario]: {
          ...prev.products[scenario],
          meetings: updatedMeetings,
        },
      },
    }));
  };

  const addNewResource = () => {
    const newResource = ["New Resource", "Department", "Notes about the new resource", "Available", "Resource Manager"];
    setPlan((prev: any) => ({
      ...prev,
      products: {
        ...prev.products,
        [scenario]: {
          ...prev.products[scenario],
          resources: [...(prev.products[scenario]?.resources || []), newResource],
        },
      },
    }));
  };

  const deleteResource = (index: number) => {
    const updatedResources = (currentVariantData.resources || []).filter((_: any, i: number) => i !== index);
    setPlan((prev: any) => ({
      ...prev,
      products: {
        ...prev.products,
        [scenario]: {
          ...prev.products[scenario],
          resources: updatedResources,
        },
      },
    }));
  };

  const addNewGlossaryTerm = () => {
    const newTerm = ["New Term", "Definition of the new term"];
    setGlossaryTerms((prev) => [...prev, newTerm]);
  };

  const deleteGlossaryTerm = (index: number) => {
    const updated = glossaryTerms.filter((_, i) => i !== index);
    setGlossaryTerms(updated);
  };

  const reset = () => {
    setPlan(clone(SEED_PLAN));
    setScenario("50k");
    setVariant("Recess Nanodispensing");
    setFilterText("");
    setError(null);
  };

  // --------- Loading & Error UIs ----------
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
        <div className="max-w-md w-full p-6 rounded-xl border bg-white shadow-sm space-y-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-amber-600" />
            <h2 className="text-xl font-semibold">Something went wrong</h2>
          </div>
          <p className="text-slate-600">{error}</p>
          <div className="flex items-center gap-2">
            <Button onClick={() => { setError(null); loadProjectDataFromDatabase(); }}>
              <RefreshCcw className="w-4 h-4 mr-2" />
              Retry
            </Button>
            <Button variant="outline" onClick={() => setError(null)}>
              Dismiss
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // --------- Helpers for rendering ----------
  const sectionCard = (title: string, icon?: React.ReactNode, right?: React.ReactNode) => (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2 text-slate-800">
        {icon}
        <h3 className="text-base font-semibold">{title}</h3>
      </div>
      {right}
    </div>
  );

  const metricTile = (label: string, value: string | number, sub?: string) => (
    <div className="p-4 rounded-xl border bg-white shadow-sm">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
      {sub ? <div className="text-xs text-slate-500 mt-1">{sub}</div> : null}
    </div>
  );

  // --------- Main UI ----------
  return (
    <div className="min-h-screen w-full bg-slate-50">
      {/* Header Bar */}
      <header className="sticky top-0 z-20 bg-white border-b">
        <div className="mx-auto max-w-[1400px] px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold">VT</div>
            <div>
              <div className="text-lg font-semibold leading-tight">Manufacturing Scale-Up Dashboard</div>
              <div className="text-xs text-slate-500">VitalTrace • Strategic Operations</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <SyncStatusIndicator syncStatus={syncStatus} />
          </div>
        </div>
      </header>

      {/* Toolbar */}
      <div className="mx-auto max-w-[1400px] px-6 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-600">Scenario</label>
            <select
              value={scenario}
              onChange={(e) => setScenario(e.target.value as "50k" | "200k")}
              className="h-9 rounded-md border px-3 text-sm bg-white"
            >
              <option value="50k">50k units</option>
              <option value="200k">200k units</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-600">Variant</label>
            <select
              value={variant}
              onChange={(e) => setVariant(e.target.value as Variant)}
              className="h-9 rounded-md border px-3 text-sm bg-white"
            >
              {PRODUCT_VARIANTS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <div className="hidden md:block">
              <CEOAnalysisButton
                data={currentVariantData}
                scenario={scenario}
                variant={variant}
                onAnalysisComplete={(a) => setAnalysis({ summary: a.summary, tldr: a.tldr })}
              />
            </div>
            <Button variant="outline" onClick={exportWeeklySummary} className="gap-2">
              <Download className="w-4 h-4" />
              Export Weekly Summary
            </Button>
            <Button onClick={saveProjectDataToDatabase} className="gap-2" disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save
            </Button>
            <Button variant="secondary" onClick={reset} className="gap-2">
              <RefreshCcw className="w-4 h-4" />
              Reset
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs (simple) */}
      <div className="mx-auto max-w-[1400px] px-6">
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            className={`px-3 py-2 rounded-md text-sm border ${
              activeTab === "overview" ? "bg-blue-600 text-white border-blue-600" : "bg-white"
            }`}
            onClick={() => setActiveTab("overview")}
          >
            Overview
          </button>
          <button
            className={`px-3 py-2 rounded-md text-sm border ${
              activeTab === "projects" ? "bg-blue-600 text-white border-blue-600" : "bg-white"
            }`}
            onClick={() => setActiveTab("projects")}
          >
            Projects
          </button>
          <button
            className={`px-3 py-2 rounded-md text-sm border ${
              activeTab === "manufacturing" ? "bg-blue-600 text-white border-blue-600" : "bg-white"
            }`}
            onClick={() => setActiveTab("manufacturing")}
          >
            Manufacturing
          </button>
          <button
            className={`px-3 py-2 rounded-md text-sm border ${
              activeTab === "kpis" ? "bg-blue-600 text-white border-blue-600" : "bg-white"
            }`}
            onClick={() => setActiveTab("kpis")}
          >
            KPIs
          </button>
          <button
            className={`px-3 py-2 rounded-md text-sm border ${
              activeTab === "risks" ? "bg-blue-600 text-white border-blue-600" : "bg-white"
            }`}
            onClick={() => setActiveTab("risks")}
          >
            Risks
          </button>
          <button
            className={`px-3 py-2 rounded-md text-sm border ${
              activeTab === "meetings" ? "bg-blue-600 text-white border-blue-600" : "bg-white"
            }`}
            onClick={() => setActiveTab("meetings")}
          >
            Meetings
          </button>
          <button
            className={`px-3 py-2 rounded-md text-sm border ${
              activeTab === "resources" ? "bg-blue-600 text-white border-blue-600" : "bg-white"
            }`}
            onClick={() => setActiveTab("resources")}
          >
            Resources
          </button>
          <button
            className={`px-3 py-2 rounded-md text-sm border ${
              activeTab === "finance" ? "bg-blue-600 text-white border-blue-600" : "bg-white"
            }`}
            onClick={() => setActiveTab("finance")}
          >
            Finance
          </button>
          <button
            className={`px-3 py-2 rounded-md text-sm border ${
              activeTab === "glossary" ? "bg-blue-600 text-white border-blue-600" : "bg-white"
            }`}
            onClick={() => setActiveTab("glossary")}
          >
            Glossary
          </button>
          <button
            className={`px-3 py-2 rounded-md text-sm border ${
              activeTab === "analysis" ? "bg-blue-600 text-white border-blue-600" : "bg-white"
            }`}
            onClick={() => {
              if (!enhancedAnalysis.summary) generateComprehensiveCEOAnalysis();
              setActiveTab("analysis");
            }}
          >
            Analysis
          </button>
          <button
            className={`px-3 py-2 rounded-md text-sm border ${
              activeTab === "settings" ? "bg-blue-600 text-white border-blue-600" : "bg-white"
            }`}
            onClick={() => setActiveTab("settings")}
          >
            Settings
          </button>
        </div>

        {/* CONTENT AREA */}
        <div className="pb-24">
          {/* OVERVIEW */}
          {activeTab === "overview" && (
            <div>
              {sectionCard("Overview", <FileText className="w-4 h-4" />)}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                {metricTile("Target Production", overviewMetrics.targetProduction.toLocaleString(), `${scenario} units`)}
                {metricTile("Capacity Utilization", `${overviewMetrics.capacityUtilization}%`)}
                {metricTile("Profit Margin", `${overviewMetrics.profitMargin}%`)}
                {metricTile("Cost per Unit", `$${(overviewMetrics.costPerUnit as number).toFixed ? (overviewMetrics.costPerUnit as number).toFixed(2) : overviewMetrics.costPerUnit}`)}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
                {metricTile("Total Projects", overviewMetrics.totalProjects)}
                {metricTile("Active Projects", overviewMetrics.activeProjects)}
                {metricTile("Completed Projects", overviewMetrics.completedProjects)}
                {metricTile("High Priority Risks", overviewMetrics.highPriorityRisks)}
              </div>

              {sectionCard("What-If Analysis", <Settings className="w-4 h-4" />, (
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={whatIfMode}
                    onChange={(e) => setWhatIfMode(e.target.checked)}
                  />
                  Enable live what-if mode
                </label>
              ))}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl border bg-white p-4">
                  <div className="grid grid-cols-1 gap-4">
                    <div className="flex items-center justify-between gap-4">
                      <label className="text-sm text-slate-600">Production Volume</label>
                      <input
                        type="number"
                        className="h-9 w-40 rounded-md border px-3 text-sm bg-white"
                        value={whatIfParams.productionVolume}
                        min={sliderLimits.productionVolume.min}
                        max={sliderLimits.productionVolume.max}
                        onChange={(e) =>
                          setWhatIfParams((p) => ({ ...p, productionVolume: Number(e.target.value) || 0 }))
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <label className="text-sm text-slate-600">Selling Price</label>
                      <input
                        type="number"
                        step="0.01"
                        className="h-9 w-40 rounded-md border px-3 text-sm bg-white"
                        value={whatIfParams.sellingPrice}
                        onChange={(e) =>
                          setWhatIfParams((p) => ({ ...p, sellingPrice: Number(e.target.value) || 0 }))
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <label className="text-sm text-slate-600">Labor Multiplier</label>
                      <input
                        type="number"
                        step="0.1"
                        className="h-9 w-40 rounded-md border px-3 text-sm bg-white"
                        value={whatIfParams.laborCostMultiplier}
                        onChange={(e) =>
                          setWhatIfParams((p) => ({ ...p, laborCostMultiplier: Number(e.target.value) || 0 }))
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <label className="text-sm text-slate-600">Material Multiplier</label>
                      <input
                        type="number"
                        step="0.1"
                        className="h-9 w-40 rounded-md border px-3 text-sm bg-white"
                        value={whatIfParams.materialCostMultiplier}
                        onChange={(e) =>
                          setWhatIfParams((p) => ({ ...p, materialCostMultiplier: Number(e.target.value) || 0 }))
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <label className="text-sm text-slate-600">Overhead Multiplier</label>
                      <input
                        type="number"
                        step="0.1"
                        className="h-9 w-40 rounded-md border px-3 text-sm bg-white"
                        value={whatIfParams.overheadMultiplier}
                        onChange={(e) =>
                          setWhatIfParams((p) => ({ ...p, overheadMultiplier: Number(e.target.value) || 0 }))
                        }
                      />
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border bg-white p-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2 text-sm text-slate-500">Computed Impact</div>
                    {(() => {
                      const result =
                        calculateWhatIfImpact() || {
                          capex: 0,
                          opex: 0,
                          cpu: 0,
                          revenue: 0,
                          profit: 0,
                          profitMargin: 0,
                          volumeChange: 0,
                        };
                      return (
                        <>
                          {metricTile("CapEx", `$${(result.capex / 1000).toFixed(1)}k`)}
                          {metricTile("OpEx", `$${(result.opex / 1000).toFixed(1)}k`)}
                          {metricTile("CPU", `$${result.cpu.toFixed(2)}`)}
                          {metricTile("Revenue", `$${(result.revenue / 1_000_000).toFixed(2)}M`)}
                          {metricTile("Profit", `$${(result.profit / 1_000_000).toFixed(2)}M`)}
                          {metricTile("Margin", `${result.profitMargin.toFixed(1)}%`)}
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* PROJECTS */}
          {activeTab === "projects" && (
            <div>
              {sectionCard(
                "Projects",
                <ClipboardList className="w-4 h-4" />,
                <div className="flex items-center gap-2">
                  <Button variant="outline" className="gap-2" onClick={() => setWrapText((w) => !w)}>
                    <Filter className="w-4 h-4" />
                    {wrapText ? "Unwrap" : "Wrap"} Cells
                  </Button>
                  <Button className="gap-2" onClick={addNewProject}>
                    <Plus className="w-4 h-4" />
                    Add Project
                  </Button>
                </div>
              )}
              <div className="rounded-xl border bg-white overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-[1200px] w-full text-sm">
                    <thead className="bg-slate-50 sticky top-0">
                      <tr className="text-left">
                        {[
                          "ID",
                          "Name",
                          "Phase",
                          "Priority",
                          "Owner",
                          "Start",
                          "End",
                          "Budget",
                          "Deliverables",
                          "Objectives",
                          "R",
                          "A",
                          "C",
                          "I",
                          "Resources",
                          "Barriers",
                          "Risks",
                          "Progress",
                          "Cost",
                          "Revenue",
                          "Notes",
                          "Complete",
                          "Status",
                          "Score",
                          "Actions",
                        ].map((h) => (
                          <th key={h} className="px-3 py-2 border-b font-medium text-slate-700 whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {projectRows.map((row, ri) => (
                        <tr key={ri} className="odd:bg-white even:bg-slate-50/50">
                          {row.map((cell: any, ci: number) => (
                            <td key={ci} className={`px-3 py-2 border-b align-top ${wrapText ? "whitespace-pre-wrap" : "whitespace-nowrap"}`}>
                              {typeof cell === "boolean" ? (
                                <input
                                  type="checkbox"
                                  checked={cell}
                                  onChange={(e) => handleProjectCellChange(ri, ci, e.target.checked)}
                                />
                              ) : ci === 17 || ci === 18 || ci === 19 ? (
                                <input
                                  className="h-8 w-32 rounded-md border px-2 text-sm bg-white"
                                  type="number"
                                  value={Number(cell) || 0}
                                  onChange={(e) => handleProjectCellChange(ri, ci, Number(e.target.value) || 0)}
                                />
                              ) : (
                                <input
                                  className="h-8 w-52 rounded-md border px-2 text-sm bg-white"
                                  value={cell ?? ""}
                                  onChange={(e) => handleProjectCellChange(ri, ci, e.target.value)}
                                />
                              )}
                            </td>
                          ))}
                          <td className="px-3 py-2 border-b">
                            <Button variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => deleteProject(ri)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                      {projectRows.length === 0 && (
                        <tr>
                          <td colSpan={26} className="px-3 py-6 text-center text-slate-500">
                            No projects yet. Click <strong>Add Project</strong> to create one.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* MANUFACTURING */}
          {activeTab === "manufacturing" && (
            <div>
              {sectionCard(
                "Manufacturing",
                <Factory className="w-4 h-4" />,
                <div className="flex items-center gap-2">
                  <Button className="gap-2" onClick={addNewManufacturingItem}>
                    <Plus className="w-4 h-4" />
                    Add Process
                  </Button>
                </div>
              )}
              <div className="rounded-xl border bg-white overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-[1000px] w-full text-sm">
                    <thead className="bg-slate-50 sticky top-0">
                      <tr className="text-left">
                        {["Process", "Time (min)", "Batch Size", "Yield (%)", "Cycle Time (s)", "Equipment", "Type", "Status", "Operator", "Actions"].map(
                          (h) => (
                            <th key={h} className="px-3 py-2 border-b font-medium text-slate-700 whitespace-nowrap">
                              {h}
                            </th>
                          )
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {manufacturingProcesses.map((row, ri) => (
                        <tr key={ri} className="odd:bg-white even:bg-slate-50/50">
                          {row.map((cell: any, ci: number) => (
                            <td key={ci} className={`px-3 py-2 border-b ${wrapText ? "whitespace-pre-wrap" : "whitespace-nowrap"}`}>
                              <input
                                className="h-8 w-44 rounded-md border px-2 text-sm bg-white"
                                value={cell ?? ""}
                                onChange={(e) => handleManufacturingCellChange(ri, ci, e.target.value)}
                              />
                            </td>
                          ))}
                          <td className="px-3 py-2 border-b">
                            <Button variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => deleteManufacturingItem(ri)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                      {manufacturingProcesses.length === 0 && (
                        <tr>
                          <td colSpan={10} className="px-3 py-6 text-center text-slate-500">
                            No processes defined. Click <strong>Add Process</strong> to create one.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* KPIs */}
          {activeTab === "kpis" && (
            <div>
              {sectionCard(
                "KPIs",
                <TrendingUp className="w-4 h-4" />,
                <div className="flex items-center gap-2">
                  <Button className="gap-2" onClick={addNewKPI}>
                    <Plus className="w-4 h-4" />
                    Add KPI
                  </Button>
                </div>
              )}
              <div className="rounded-xl border bg-white overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-[900px] w-full text-sm">
                    <thead className="bg-slate-50 sticky top-0">
                      <tr className="text-left">
                        {["Name", "Current", "Target", "Unit", "Owner", "Actions"].map((h) => (
                          <th key={h} className="px-3 py-2 border-b font-medium text-slate-700 whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {kpis.map((k, ri) => (
                        <tr key={k.id} className="odd:bg-white even:bg-slate-50/50">
                          <td className="px-3 py-2 border-b">
                            <input
                              className="h-8 w-56 rounded-md border px-2 text-sm bg-white"
                              value={k.name}
                              onChange={(e) => handleKpiCellChange(ri, 0, e.target.value)}
                            />
                          </td>
                          <td className="px-3 py-2 border-b">
                            <input
                              type="number"
                              className="h-8 w-24 rounded-md border px-2 text-sm bg-white"
                              value={k.current_value}
                              onChange={(e) => handleKpiCellChange(ri, 1, Number(e.target.value) || 0)}
                            />
                          </td>
                          <td className="px-3 py-2 border-b">
                            <input
                              type="number"
                              className="h-8 w-24 rounded-md border px-2 text-sm bg-white"
                              value={k.target_value}
                              onChange={(e) => handleKpiCellChange(ri, 2, Number(e.target.value) || 0)}
                            />
                          </td>
                          <td className="px-3 py-2 border-b">
                            <input
                              className="h-8 w-24 rounded-md border px-2 text-sm bg-white"
                              value={k.unit}
                              onChange={(e) => handleKpiCellChange(ri, 3, e.target.value)}
                            />
                          </td>
                          <td className="px-3 py-2 border-b">
                            <input
                              className="h-8 w-40 rounded-md border px-2 text-sm bg-white"
                              value={k.owner}
                              onChange={(e) => handleKpiCellChange(ri, 4, e.target.value)}
                            />
                          </td>
                          <td className="px-3 py-2 border-b">
                            <Button variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => deleteKPI(k.id)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                      {kpis.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                            No KPIs yet. Click <strong>Add KPI</strong> to create one.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* RISKS */}
          {activeTab === "risks" && (
            <div>
              {sectionCard(
                "Risks",
                <AlertTriangle className="w-4 h-4" />,
                <div className="flex items-center gap-2">
                  <Button className="gap-2" onClick={addNewRisk}>
                    <Plus className="w-4 h-4" />
                    Add Risk
                  </Button>
                </div>
              )}
              <div className="rounded-xl border bg-white overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-[1000px] w-full text-sm">
                    <thead className="bg-slate-50 sticky top-0">
                      <tr className="text-left">
                        {["ID", "Risk", "Impact", "Probability", "Mitigation", "Owner", "Due", "Status", "Actions"].map((h) => (
                          <th key={h} className="px-3 py-2 border-b font-medium text-slate-700 whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(currentVariantData.risks || []).map((row: any[], ri: number) => (
                        <tr key={ri} className="odd:bg-white even:bg-slate-50/50">
                          {row.map((cell: any, ci: number) => (
                            <td key={ci} className="px-3 py-2 border-b">
                              <input
                                className="h-8 w-48 rounded-md border px-2 text-sm bg-white"
                                value={cell ?? ""}
                                onChange={(e) => handleRiskCellChange(ri, ci, e.target.value)}
                              />
                            </td>
                          ))}
                          <td className="px-3 py-2 border-b">
                            <Button variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => deleteRisk(ri)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                      {(currentVariantData.risks || []).length === 0 && (
                        <tr>
                          <td colSpan={9} className="px-3 py-6 text-center text-slate-500">
                            No risks captured. Click <strong>Add Risk</strong> to start tracking.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* MEETINGS */}
          {activeTab === "meetings" && (
            <div>
              {sectionCard(
                "Meetings",
                <Users className="w-4 h-4" />,
                <div className="flex items-center gap-2">
                  <Button className="gap-2" onClick={addNewMeeting}>
                    <Plus className="w-4 h-4" />
                    Add Meeting
                  </Button>
                </div>
              )}
              <div className="rounded-xl border bg-white overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-[1000px] w-full text-sm">
                    <thead className="bg-slate-50 sticky top-0">
                      <tr className="text-left">
                        {["ID", "Title", "Date", "Attendees", "Status", "Duration", "Notes", "Actions"].map((h) => (
                          <th key={h} className="px-3 py-2 border-b font-medium text-slate-700 whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(currentVariantData.meetings || []).map((row: any[], ri: number) => (
                        <tr key={ri} className="odd:bg-white even:bg-slate-50/50">
                          {row.map((cell: any, ci: number) => (
                            <td key={ci} className="px-3 py-2 border-b">
                              <input
                                className="h-8 w-48 rounded-md border px-2 text-sm bg-white"
                                value={cell ?? ""}
                                onChange={(e) => handleMeetingCellChange(ri, ci, e.target.value)}
                              />
                            </td>
                          ))}
                          <td className="px-3 py-2 border-b">
                            <Button variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => deleteMeeting(ri)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                      {(currentVariantData.meetings || []).length === 0 && (
                        <tr>
                          <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                            No meetings logged. Click <strong>Add Meeting</strong> to capture one.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* RESOURCES */}
          {activeTab === "resources" && (
            <div>
              {sectionCard(
                "Resources",
                <Users className="w-4 h-4" />,
                <div className="flex items-center gap-2">
                  <Button className="gap-2" onClick={addNewResource}>
                    <Plus className="w-4 h-4" />
                    Add Resource
                  </Button>
                </div>
              )}
              <div className="rounded-xl border bg-white overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-[1000px] w-full text-sm">
                    <thead className="bg-slate-50 sticky top-0">
                      <tr className="text-left">
                        {["Name", "Department", "Notes", "Availability", "Owner", "Actions"].map((h) => (
                          <th key={h} className="px-3 py-2 border-b font-medium text-slate-700 whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(currentVariantData.resources || []).map((row: any[], ri: number) => (
                        <tr key={ri} className="odd:bg-white even:bg-slate-50/50">
                          {row.map((cell: any, ci: number) => (
                            <td key={ci} className="px-3 py-2 border-b">
                              <input
                                className="h-8 w-48 rounded-md border px-2 text-sm bg-white"
                                value={cell ?? ""}
                                onChange={(e) => handleResourceCellChange(ri, ci, e.target.value)}
                              />
                            </td>
                          ))}
                          <td className="px-3 py-2 border-b">
                            <Button variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => deleteResource(ri)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                      {(currentVariantData.resources || []).length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                            No resources listed. Click <strong>Add Resource</strong> to add one.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* FINANCE */}
          {activeTab === "finance" && (
            <div>
              {sectionCard("Finance Snapshot", <FileText className="w-4 h-4" />)}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                {metricTile("CapEx (Buffered 50k)", `$${(capexBuffered50 / 1000).toFixed(1)}k`)}
                {metricTile("CapEx (Buffered 200k)", `$${(capexBuffered200 / 1000).toFixed(1)}k`)}
                {metricTile("OpEx (50k)", `$${(opexTotal50 / 1000).toFixed(1)}k`)}
                {metricTile("OpEx (200k)", `$${(opexTotal200 / 1000).toFixed(1)}k`)}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {metricTile("Scenario UPH", uph.toFixed(2), `${sc.hoursPerDay}h/day • ${sc.shifts} shift(s)`)}
                {metricTile("Selected CPU", `$${cpu.toFixed(2)}`, scenario)}
                {metricTile("Launch", new Date(currentLaunch).toLocaleDateString(), variant)}
              </div>
            </div>
          )}

          {/* GLOSSARY */}
          {activeTab === "glossary" && (
            <div>
              {sectionCard(
                "Glossary",
                <FileText className="w-4 h-4" />,
                <div className="flex items-center gap-2">
                  <Button className="gap-2" onClick={addNewGlossaryTerm}>
                    <Plus className="w-4 h-4" />
                    Add Term
                  </Button>
                </div>
              )}
              <div className="rounded-xl border bg-white overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-[800px] w-full text-sm">
                    <thead className="bg-slate-50 sticky top-0">
                      <tr className="text-left">
                        {["Term", "Definition", "Actions"].map((h) => (
                          <th key={h} className="px-3 py-2 border-b font-medium text-slate-700 whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {glossaryTerms.map((row, ri) => (
                        <tr key={ri} className="odd:bg-white even:bg-slate-50/50">
                          <td className="px-3 py-2 border-b">
                            <input
                              className="h-8 w-64 rounded-md border px-2 text-sm bg-white"
                              value={row[0] ?? ""}
                              onChange={(e) => {
                                const updated = [...glossaryTerms];
                                updated[ri][0] = e.target.value;
                                setGlossaryTerms(updated);
                              }}
                            />
                          </td>
                          <td className="px-3 py-2 border-b">
                            <input
                              className="h-8 w-[600px] max-w-full rounded-md border px-2 text-sm bg-white"
                              value={row[1] ?? ""}
                              onChange={(e) => {
                                const updated = [...glossaryTerms];
                                updated[ri][1] = e.target.value;
                                setGlossaryTerms(updated);
                              }}
                            />
                          </td>
                          <td className="px-3 py-2 border-b">
                            <Button variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => deleteGlossaryTerm(ri)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                      {glossaryTerms.length === 0 && (
                        <tr>
                          <td colSpan={3} className="px-3 py-6 text-center text-slate-500">
                            No terms added. Click <strong>Add Term</strong> to create one.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ANALYSIS */}
          {activeTab === "analysis" && (
            <div>
              {sectionCard(
                "Executive Analysis",
                <TrendingUp className="w-4 h-4" />,
                <div className="flex items-center gap-2">
                  <CEOAnalysisButton
                    data={currentVariantData}
                    scenario={scenario}
                    variant={variant}
                    onAnalysisComplete={(a) => setAnalysis({ summary: a.summary, tldr: a.tldr })}
                  />
                  <Button className="gap-2" onClick={generateComprehensiveCEOAnalysis}>
                    <FileText className="w-4 h-4" />
                    Generate Comprehensive Report
                  </Button>
                </div>
              )}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-1 p-4 rounded-xl border bg-white">
                  <div className="text-sm text-slate-500 mb-2">TL;DR</div>
                  <div className="text-sm whitespace-pre-wrap">{analysis.tldr || enhancedAnalysis.tldr || "No summary yet."}</div>
                </div>
                <div className="lg:col-span-2 p-4 rounded-xl border bg-white">
                  <div className="text-sm text-slate-500 mb-2">Details</div>
                  <div className="text-sm whitespace-pre-wrap">
                    {analysis.summary || enhancedAnalysis.summary || "Run the analysis to populate this section."}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SETTINGS */}
          {activeTab === "settings" && (
            <div>
              {sectionCard("Settings", <Settings className="w-4 h-4" />)}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border bg-white">
                  <div className="text-sm text-slate-500 mb-3">Data</div>
                  <div className="flex items-center gap-2">
                    <Button className="gap-2" onClick={saveProjectDataToDatabase} disabled={saving}>
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      Save Now
                    </Button>
                    <Button variant="secondary" className="gap-2" onClick={loadProjectDataFromDatabase}>
                      <Upload className="w-4 h-4" />
                      Load
                    </Button>
                    <Button variant="outline" className="gap-2" onClick={reset}>
                      <RefreshCcw className="w-4 h-4" />
                      Reset
                    </Button>
                  </div>
                </div>
                <div className="p-4 rounded-xl border bg-white">
                  <div className="text-sm text-slate-500 mb-3">Filters</div>
                  <div className="flex items-center gap-2">
                    <input
                      value={filterText}
                      onChange={(e) => setFilterText(e.target.value)}
                      placeholder="Quick filter text…"
                      className="h-9 w-full rounded-md border px-3 text-sm bg-white"
                    />
                  </div>
                  <div className="mt-3">
                    <label className="inline-flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={wrapText} onChange={(e) => setWrapText(e.target.checked)} />
                      Wrap table cell text
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Default export wrapper so importing `@/components/ScaleUpDashboard` works
const ScaleUpDashboard: React.FC = () => {
  return <ScaleUpDashboardContent />;
};

export default ScaleUpDashboard;
