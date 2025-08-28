// lib/ensureArrays.ts
export type AnyRecord = Record<string, any>;

function asArray<T = any>(v: any): T[] {
  if (Array.isArray(v)) return v as T[];
  if (v === null || v === undefined) return [];
  if (typeof v === "object") {
    const values = Object.values(v);
    return Array.isArray(values) ? (values as T[]) : [];
  }
  return [];
}

function coerceMatrix<T = any>(v: any): T[][] {
  const arr = asArray<any>(v);
  return arr.map((row) => (Array.isArray(row) ? row : asArray<any>(row)));
}

function normalizeProduct(product: AnyRecord): AnyRecord {
  const p = product || {};
  return {
    ...p,
    projects: coerceMatrix(p.projects),
    equipment: coerceMatrix(p.equipment),
    capex50k: coerceMatrix(p.capex50k),
    capex200k: coerceMatrix(p.capex200k),
    opex50k: coerceMatrix(p.opex50k),
    opex200k: coerceMatrix(p.opex200k),
    resources: coerceMatrix(p.resources),
    hiring: coerceMatrix(p.hiring),
    risks: coerceMatrix(p.risks),
    actions: coerceMatrix(p.actions),
    processes: coerceMatrix(p.processes),
    manufacturing: coerceMatrix(p.manufacturing),
    meetings: coerceMatrix(p.meetings),
    kpis: asArray(p.kpis),
    scenarios: asArray(p.scenarios),
    costData: asArray(p.costData),
    launch: {
      fiftyK: String(p?.launch?.fiftyK ?? new Date().toISOString()),
      twoHundredK: String(p?.launch?.twoHundredK ?? new Date().toISOString()),
    },
  };
}

function ensureScenarios(sc: AnyRecord | undefined): AnyRecord {
  const s = sc || {};
  const safe50 = s["50k"] || { unitsPerYear: 50000, hoursPerDay: 8, shifts: 1 };
  const safe200 = s["200k"] || { unitsPerYear: 200000, hoursPerDay: 16, shifts: 2 };
  return { ...s, "50k": safe50, "200k": safe200 };
}

export function normalizePlan(rawPlan: AnyRecord): AnyRecord {
  const plan = rawPlan || {};
  const products = plan.products || {};
  const normProducts: AnyRecord = {};
  const keys = Object.keys(products);
  if (keys.length === 0) {
    normProducts["50k"] = normalizeProduct({});
    normProducts["200k"] = normalizeProduct({});
  } else {
    for (const key of keys) {
      normProducts[key] = normalizeProduct(products[key]);
    }
  }
  return {
    ...plan,
    bufferPct: typeof plan.bufferPct === "number" ? plan.bufferPct : 0.15,
    scenarios: ensureScenarios(plan.scenarios),
    products: normProducts,
    kpis: asArray(plan.kpis),
  };
}

export function normalizeVariantData(raw: AnyRecord): AnyRecord {
  return normalizeProduct(raw || {});
}

export function toArray<T = any>(value: any): T[] {
  return asArray<T>(value);
}
