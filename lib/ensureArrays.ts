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
    // tabular arrays of row arrays
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

    // nested objects that some code maps over
    kpis: asArray(p.kpis),
    scenarios: asArray(p.scenarios),
    costData: asArray(p.costData),

    // simple launch object with ISO strings
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

/**
 * Normalize the full dashboard plan so that anything your UI maps over is always an array.
 * Call this on any plan loaded from Supabase before setting state.
 */
export function normalizePlan(rawPlan: AnyRecord): AnyRecord {
  const plan = rawPlan || {};
  const products = plan.products || {};
  const normProducts: AnyRecord = {};

  // normalize known scenarios if present
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
    // also normalize top-level kpis if present in some shapes
    kpis: asArray(plan.kpis),
  };
}

/**
 * Normalize a “currentVariantData” object derived from plan.products[scenario].
 * Use this right after computing currentVariantData and before rendering.
 */
export function normalizeVariantData(raw: AnyRecord): AnyRecord {
  return normalizeProduct(raw || {});
}

/**
 * Utility for safely mapping over unknown data. Use as drop-in replacement for .map().
 * Example: mapArray(data.maybeArray, (row) => <Row {...row} />)
 */
export function mapArray<T = any, U = any>(value: any, fn: (item: T, index: number) => U): U[] {
  return asArray<T>(value).map(fn);
}

/**
 * Utility for safely flatMapping over unknown data.
 */
export function flatMapArray<T = any, U = any>(value: any, fn: (item: T, index: number) => U | U[]): U[] {
  return asArray<T>(value).flatMap(fn as any);
}

/**
 * Expose a simple toArray if you want to keep using native .map later.
 */
export function toArray<T = any>(value: any): T[] {
  return asArray<T>(value);
}
