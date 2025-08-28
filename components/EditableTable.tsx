"use client"

import type React from "react"

import { useState, useMemo, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Trash2, Plus } from "lucide-react"

interface EditableTableProps {
  rows: any[][]
  headers: string[]
  types?: string[]
  setRows?: (rows: any[][]) => void
  onCellChange?: (rowIndex: number, colIndex: number, value: any) => void
  onDeleteRow?: (rowIndex: number) => void
  options?: string[][]
  widths?: number[]
}

export function EditableTable({
  rows,
  headers,
  types = [],
  setRows,
  onCellChange,
  onDeleteRow,
  options = [],
  widths = [],
}: EditableTableProps) {
  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editingCell])

  const validatedRows = useMemo(() => {
    console.log("[v0] EditableTable validating rows:", {
      rowsType: typeof rows,
      isArray: Array.isArray(rows),
      length: rows?.length,
      sample: rows?.[0],
    })

    if (!Array.isArray(rows)) {
      console.log("[v0] EditableTable: rows is not an array, returning empty array")
      return []
    }

    const validated = rows.map((row, index) => {
      if (!row) {
        console.log(`[v0] EditableTable: row ${index} is null/undefined, creating empty row`)
        return headers.map(() => "")
      }

      if (Array.isArray(row)) {
        return row
      }

      // Convert object to array based on headers
      if (typeof row === "object") {
        console.log(`[v0] EditableTable: converting object row ${index} to array`)
        return headers.map((header) => {
          const key = header.toLowerCase().replace(/\s+/g, "")
          return row[key] || row[header] || ""
        })
      }

      // Fallback: create empty row
      console.log(`[v0] EditableTable: unknown row type ${typeof row}, creating empty row`)
      return headers.map(() => "")
    })

    console.log("[v0] EditableTable validation complete:", {
      originalCount: rows.length,
      validatedCount: validated.length,
      allArrays: validated.every((row) => Array.isArray(row)),
    })

    return validated
  }, [rows, headers])

  const addRow = () => {
    const newRow = headers.map((_, index) => {
      const type = types?.[index] || "text"
      switch (type) {
        case "number":
          return 0
        case "date":
          return new Date().toISOString().split("T")[0]
        case "boolean":
          return false
        default:
          return ""
      }
    })

    if (setRows) {
      setRows([...validatedRows, newRow])
    }
  }

  const deleteRow = (rowIndex: number) => {
    if (onDeleteRow) {
      onDeleteRow(rowIndex)
    } else if (setRows) {
      const newRows = validatedRows.filter((_, index) => index !== rowIndex)
      setRows(newRows)
    }
  }

  const handleCellEdit = (rowIndex: number, colIndex: number, value: any) => {
    console.log("[v0] EditableTable handleCellEdit:", { rowIndex, colIndex, value })

    if (onCellChange) {
      onCellChange(rowIndex, colIndex, value)
    } else if (setRows) {
      const newRows = [...validatedRows]
      newRows[rowIndex] = [...newRows[rowIndex]]
      newRows[rowIndex][colIndex] = value
      setRows(newRows)
    }
  }

  const handleCellClick = (rowIndex: number, colIndex: number, event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    console.log("[v0] Cell clicked for editing:", { rowIndex, colIndex })
    setEditingCell({ row: rowIndex, col: colIndex })
  }

  const handleInputChange = (rowIndex: number, colIndex: number, value: string) => {
    console.log("[v0] Input value changed:", { rowIndex, colIndex, value })
    handleCellEdit(rowIndex, colIndex, value)
  }

  const handleInputBlur = () => {
    console.log("[v0] Input blur - saving changes")
    setEditingCell(null)
  }

  const handleInputKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault()
      setEditingCell(null)
    } else if (event.key === "Escape") {
      event.preventDefault()
      setEditingCell(null)
    } else if (event.key === "Tab") {
      // Allow tab to move to next cell
      event.preventDefault()
      const { row, col } = editingCell || { row: 0, col: 0 }
      const nextCol = col + 1
      const nextRow = nextCol >= headers.length ? row + 1 : row
      const finalCol = nextCol >= headers.length ? 0 : nextCol

      if (nextRow < validatedRows.length) {
        setEditingCell({ row: nextRow, col: finalCol })
      } else {
        setEditingCell(null)
      }
    }
  }

  const renderCell = (value: any, rowIndex: number, colIndex: number) => {
    const type = types?.[colIndex] || "text"
    const isEditing = editingCell?.row === rowIndex && editingCell?.col === colIndex

    if (isEditing) {
      if (type === "select" && options?.[colIndex] && Array.isArray(options[colIndex])) {
        return (
          <select
            value={value || ""}
            onChange={(e) => handleInputChange(rowIndex, colIndex, e.target.value)}
            onBlur={handleInputBlur}
            onKeyDown={handleInputKeyDown}
            className="w-full px-2 py-1 border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            autoFocus
          >
            <option value="">Select...</option>
            {(options[colIndex] || []).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        )
      }

      if (type === "textarea") {
        return (
          <textarea
            value={value || ""}
            onChange={(e) => handleInputChange(rowIndex, colIndex, e.target.value)}
            onBlur={handleInputBlur}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setEditingCell(null)
              }
            }}
            className="w-full px-2 py-1 border rounded resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            rows={2}
            autoFocus
            placeholder="Enter text..."
          />
        )
      }

      return (
        <input
          ref={inputRef}
          type={type === "number" ? "number" : type === "date" ? "date" : "text"}
          value={value || ""}
          onChange={(e) => {
            console.log("[v0] Native input onChange:", e.target.value)
            handleInputChange(rowIndex, colIndex, e.target.value)
          }}
          onBlur={handleInputBlur}
          onKeyDown={handleInputKeyDown}
          className="w-full px-2 py-1 border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
          placeholder="Enter text..."
          autoComplete="off"
        />
      )
    }

    return (
      <div
        className="px-2 py-1 cursor-text hover:bg-blue-50 min-h-[32px] flex items-center border border-transparent hover:border-blue-200 rounded transition-colors"
        onClick={(e) => handleCellClick(rowIndex, colIndex, e)}
        onDoubleClick={(e) => handleCellClick(rowIndex, colIndex, e)}
        title="Click to edit"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            handleCellClick(rowIndex, colIndex, e as any)
          }
        }}
      >
        {type === "boolean" ? (
          value ? (
            "Yes"
          ) : (
            "No"
          )
        ) : String(value || "").trim() ? (
          <span className="text-gray-900">{String(value)}</span>
        ) : (
          <span className="text-gray-400 italic">Click to edit</span>
        )}
      </div>
    )
  }

  if (validatedRows.length === 0) {
    return (
      <div className="border rounded-lg p-8 text-center">
        <p className="text-gray-500 mb-4">No data available</p>
        <Button onClick={addRow} variant="outline" className="gap-2 bg-transparent">
          <Plus className="h-4 w-4" />
          Add First Row
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <span className="text-sm text-gray-600">{validatedRows.length} rows</span>
        <Button onClick={addRow} variant="outline" size="sm" className="gap-2 bg-transparent">
          <Plus className="h-4 w-4" />
          Add Row
        </Button>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                {headers.map((header, index) => (
                  <th
                    key={index}
                    className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r last:border-r-0"
                    style={{ width: widths[index] ? `${widths[index]}px` : "auto" }}
                  >
                    {header}
                  </th>
                ))}
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {validatedRows.map((row, rowIndex) => (
                <tr key={rowIndex} className="hover:bg-gray-50">
                  {(row || []).map((cell, colIndex) => (
                    <td
                      key={colIndex}
                      className="border-r last:border-r-0 text-sm"
                      style={{ width: widths?.[colIndex] ? `${widths[colIndex]}px` : "auto" }}
                    >
                      {renderCell(cell, rowIndex, colIndex)}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-sm">
                    <Button
                      onClick={() => deleteRow(rowIndex)}
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:text-red-800 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
