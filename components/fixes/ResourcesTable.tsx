// components/fixes/ResourcesTable.tsx
"use client";

import React from "react";

type Row = any[];

function safeArray<T = any>(v: any): T[] {
  if (Array.isArray(v)) return v as T[];
  return [];
}

function safeMatrix<T = any>(v: any): T[][] {
  return safeArray<any>(v).map((row) => (Array.isArray(row) ? (row as T[]) : []));
}

function num(n: any, d = 0): number {
  const x = Number(n);
  return Number.isFinite(x) ? x : d;
}

export default function ResourcesTable(props: {
  rows: any;
  onCellChange: (rowIndex: number, colIndex: number, value: any) => void;
  onAdd: () => void;
  onDelete: (index: number) => void;
}) {
  const rows = safeMatrix<Row>(props.rows);
  const headers = ["Resource", "Type", "Quantity", "Cost", "Department", "Notes", "Actions"];

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>Resources</h2>
        <button
          type="button"
          onClick={props.onAdd}
          style={{ padding: "8px 12px", border: "1px solid #ccc", borderRadius: 8, cursor: "pointer", background: "#fff" }}
        >
          + Add Resource
        </button>
      </div>
      <div style={{ width: "100%", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {headers.map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: "left",
                    padding: "10px 8px",
                    background: "#f7f7f8",
                    borderBottom: "1px solid #e5e7eb",
                    fontWeight: 600,
                    fontSize: 13,
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: 8 }}>
                  <input
                    value={String(r[0] ?? "")}
                    onChange={(e) => props.onCellChange(ri, 0, e.target.value)}
                    style={{ width: "100%" }}
                  />
                </td>
                <td style={{ padding: 8 }}>
                  <select
                    value={String(r[1] ?? "Personnel")}
                    onChange={(e) => props.onCellChange(ri, 1, e.target.value)}
                    style={{ width: "100%" }}
                  >
                    <option value="Personnel">Personnel</option>
                    <option value="Equipment">Equipment</option>
                    <option value="Software">Software</option>
                    <option value="Facility">Facility</option>
                    <option value="Other">Other</option>
                  </select>
                </td>
                <td style={{ padding: 8 }}>
                  <input
                    type="number"
                    value={String(num(r[2] ?? 0))}
                    onChange={(e) => props.onCellChange(ri, 2, Number(e.target.value))}
                    style={{ width: "100%" }}
                  />
                </td>
                <td style={{ padding: 8 }}>
                  <input
                    type="number"
                    step="0.01"
                    value={String(num(r[3] ?? 0))}
                    onChange={(e) => props.onCellChange(ri, 3, Number(e.target.value))}
                    style={{ width: "100%" }}
                  />
                </td>
                <td style={{ padding: 8 }}>
                  <input
                    value={String(r[4] ?? "")}
                    onChange={(e) => props.onCellChange(ri, 4, e.target.value)}
                    style={{ width: "100%" }}
                  />
                </td>
                <td style={{ padding: 8 }}>
                  <input
                    value={String(r[5] ?? "")}
                    onChange={(e) => props.onCellChange(ri, 5, e.target.value)}
                    style={{ width: "100%" }}
                  />
                </td>
                <td style={{ padding: 8 }}>
                  <button
                    type="button"
                    onClick={() => props.onDelete(ri)}
                    style={{ padding: "6px 10px", border: "1px solid #ccc", borderRadius: 6, cursor: "pointer", background: "#fff" }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={headers.length} style={{ padding: 16, color: "#6b7280" }}>
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
