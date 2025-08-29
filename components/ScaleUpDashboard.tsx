'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2, Plus, Trash2, FileText, Calendar, Save, TrendingUp } from 'lucide-react'
import jsPDF from 'jspdf'
// @ts-ignore - types may not be present in some setups
import autoTable from 'jspdf-autotable'

/**
 * ScaleUpDashboard
 *
 * Tabs: Overview, Projects, Processes, Resources, Risks, Financials, Meetings, KPIs, Glossary
 * - Add/Delete row buttons on each tab
 * - Autosaves ALL data (every tab) via /api/configurations (Supabase-backed) with debounce
 * - Loads saved data on mount and does not reset on refresh
 * - Meeting modal with agenda/notes & export meeting summary to PDF
 * - CEO Summary PDF button
 *
 * NOTE (per your request): Only the Projects tab formatting has been changed here
 * to ensure long text is visible (wrapping + textareas on long columns).
 */

// ---------------- Types ----------------

type AnyRow = (string | number | boolean | null | undefined)[]

interface KPI {
  id: string
  name: string
  unit: string
  owner: string
  current_value: number
  target_value: number
}

interface SavedDataShape {
  scenario: '50k' | '200k'
  variant: string
  projects: AnyRow[]
  processes: AnyRow[]
  resources: AnyRow[]
  risks: AnyRow[]
  financials: AnyRow[]
  meetings: AnyRow[]
  kpis: KPI[]
  glossary: AnyRow[]
  capex50k: AnyRow[]
  capex200k: AnyRow[]
  opex50k: AnyRow[]
  opex200k: AnyRow[]
  lastSaved?: string
}

// ---------------- Helpers ----------------

const defaultKpis: KPI[] = [
  { id: 'k1', name: 'Production Efficiency', unit: '%', owner: 'Production', current_value: 87, target_value: 95 },
  { id: 'k2', name: 'Quality Score', unit: '%', owner: 'Quality', current_value: 94, target_value: 98 },
  { id: 'k3', name: 'Cost Reduction', unit: '%', owner: 'Ops', current_value: 12, target_value: 15 },
  { id: 'k4', name: 'Time to Market', unit: 'days', owner: 'PMO', current_value: 195, target_value: 180 },
]

const defaultProjects: AnyRow[] = [
  [
    `PROJ-${Date.now()}`,
    'Pilot Line Commissioning',
    'Manufacturing',
    'Must',
    'Project Manager',
    new Date().toISOString().slice(0, 10),
    new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    '—',
    'Pilot line validated for 50k units',
    'Bring line to IQ/OQ/PQ readiness',
    'R',
    'A',
    'C',
    'I',
    'Facilities, Vendors',
    'Lead time bottlenecks',
    'Supply risk',
    45,
    200000,
    150000,
    'https://docs.example.com/process',
    false,
    'GREEN',
    20,
  ],
]

const defaultProcesses: AnyRow[] = [
  ['Receive Needles', 0, 1, 100, 0, 'Manual Station', 'Manual', 'Validated', 'Operator1'],
  ['Plasma', 10, 90, 98, 600, 'Plasma System', 'Auto', 'Validated', 'Operator3'],
]

const defaultResources: AnyRow[] = [
  ['Production Manager', 'Personnel', 1, 95000, 'Manufacturing', 'Full-time position'],
  ['Quality Engineer', 'Personnel', 2, 75000, 'Quality', 'QC oversight'],
]

const defaultRisks: AnyRow[] = [
  ['RISK-1', 'Supply Chain Disruption', 'H', 'M', 'Diversify suppliers', 'Operations', '2025-12-31', 'Open'],
]

const defaultFinancials: AnyRow[] = [
  ['Revenue', 'Product Sales', 2250000, 'Income', 'Projected annual revenue'],
  ['COGS', 'Manufacturing Costs', 1350000, 'Expense', 'Direct production costs'],
  ['OpEx', 'Operating Expenses', 450000, 'Expense', 'Ongoing operational costs'],
  ['CapEx', 'Equipment Investment', 750000, 'Investment', 'Initial capital expenditure'],
]

const defaultMeetings: AnyRow[] = [
  ['MEET-1', 'Weekly Status', '2025-08-25', '10:00', '60 min', 'Project Team', 'Conference A', 'Scheduled', '1. Welcome', 'Review progress', 'Notes here', 'Project Team'],
]

const defaultGlossary: AnyRow[] = [
  ['IHCL', 'Ion-Implanted Hydrophilic Coating Layer'],
  ['OCP', 'Open Circuit Potential'],
]

const defaultCapex50k: AnyRow[] = [
  ['Coating Unit', 1, 120000, 10000],
  ['Inspection Station', 1, 50000, 5000],
]

const defaultCapex200k: AnyRow[] = [
  ['Coating Unit', 2, 110000, 15000],
  ['Inspection Station', 2, 48000, 8000],
]

const defaultOpex50k: AnyRow[] = [
  ['Labor', 'per_year', 1, 350000],
  ['Materials', 'per_unit', 50000, 12.5],
]

const defaultOpex200k: AnyRow[] = [
  ['Labor', 'per_year', 1, 650000],
  ['Materials', 'per_unit', 200000, 11.0],
]

const initialData: SavedDataShape = {
  scenario: '50k',
  variant: 'Recess Nanodispensing',
  projects: defaultProjects,
  processes: defaultProcesses,
  resources: defaultResources,
  risks: defaultRisks,
  financials: defaultFinancials,
  meetings: defaultMeetings,
  kpis: defaultKpis,
  glossary: defaultGlossary,
  capex50k: defaultCapex50k,
  capex200k: defaultCapex200k,
  opex50k: defaultOpex50k,
  opex200k: defaultOpex200k,
}

// ---------------- Component ----------------

export default function ScaleUpDashboard() {
  // Tabs
  const [activeTab, setActiveTab] = useState<
    'Overview' | 'Projects' | 'Processes' | 'Resources' | 'Risks' | 'Financials' | 'Meetings' | 'KPIs' | 'Glossary'
  >('Overview')

  // Core state
  const [scenario, setScenario] = useState<'50k' | '200k'>(initialData.scenario)
  const [variant, setVariant] = useState<string>(initialData.variant)

  const [projects, setProjects] = useState<AnyRow[]>(initialData.projects)
  const [processes, setProcesses] = useState<AnyRow[]>(initialData.processes)
  const [resources, setResources] = useState<AnyRow[]>(initialData.resources)
  const [risks, setRisks] = useState<AnyRow[]>(initialData.risks)
  const [financials, setFinancials] = useState<AnyRow[]>(initialData.financials)
  const [meetings, setMeetings] = useState<AnyRow[]>(initialData.meetings)
  const [kpis, setKpis] = useState<KPI[]>(initialData.kpis)
  const [glossary, setGlossary] = useState<AnyRow[]>(initialData.glossary)

  const [capex50k, setCapex50k] = useState<AnyRow[]>(initialData.capex50k)
  const [capex200k, setCapex200k] = useState<AnyRow[]>(initialData.capex200k)
  const [opex50k, setOpex50k] = useState<AnyRow[]>(initialData.opex50k)
  const [opex200k, setOpex200k] = useState<AnyRow[]>(initialData.opex200k)

  // UX state
  const [loading, setLoading] = useState<boolean>(true)
  const [saving, setSaving] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [lastSaved, setLastSaved] = useState<string>('')

  // Debounce ref
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Meeting modal state
  const [showMeetingModal, setShowMeetingModal] = useState(false)
  const [editingMeetingIndex, setEditingMeetingIndex] = useState<number | null>(null)
  const [meetingForm, setMeetingForm] = useState({
    id: '',
    title: 'New Meeting',
    date: new Date().toISOString().slice(0, 10),
    time: '10:00',
    duration: '60 min',
    attendees: 'Project Team, Stakeholders',
    location: 'Conference Room / Zoom',
    status: 'Scheduled',
    agenda: '1. Welcome\n2. Updates\n3. Risks & Blockers\n4. Decisions\n5. Actions',
    objectives: 'Review progress and align priorities',
    notes: '',
  })

  // --------------- Derived & Metrics ---------------

  const capexRows = scenario === '50k' ? capex50k : capex200k
  const opexRows = scenario === '50k' ? opex50k : opex200k

  const capexTotal = useMemo(
    () => capexRows.reduce((s, r) => s + ((Number(r?.[1]) || 0) * (Number(r?.[2]) || 0) + (Number(r?.[3]) || 0)), 0),
    [capexRows]
  )

  const opexTotal = useMemo(
    () => opexRows.reduce((s, r) => s + ((Number(r?.[2]) || 0) * (Number(r?.[3]) || 0)), 0),
    [opexRows]
  )

  const scenarioUnits = scenario === '50k' ? 50000 : 200000
  const revenue = scenarioUnits * 45
  const cpu = scenarioUnits ? opexTotal / scenarioUnits : 0
  const grossProfit = revenue - (capexTotal + opexTotal)
  const marginPct = revenue > 0 ? (grossProfit / revenue) * 100 : 0

  // --------------- Persistence helpers ---------------

  const buildPayload = useCallback((): SavedDataShape => ({
    scenario,
    variant,
    projects,
    processes,
    resources,
    risks,
    financials,
    meetings,
    kpis,
    glossary,
    capex50k,
    capex200k,
    opex50k,
    opex200k,
    lastSaved: new Date().toISOString(),
  }), [
    scenario,
    variant,
    projects,
    processes,
    resources,
    risks,
    financials,
    meetings,
    kpis,
    glossary,
    capex50k,
    capex200k,
    opex50k,
    opex200k,
  ])

  const saveToServer = useCallback(async () => {
    try {
      setSaving(true)
      const body = {
        name: 'ScaleUp-Dashboard-Config',
        description: 'ScaleUp Dashboard Configuration',
        data: buildPayload(),
        modified_by: 'dashboard',
      }
      const res = await fetch('/api/configurations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j?.error || `Save failed (${res.status})`)
      }
      const stamp = new Date().toLocaleString()
      setLastSaved(stamp)
      setError(null)
    } catch (e: any) {
      setError(e?.message || 'Failed to save')
      console.error('[Save] error', e)
    } finally {
      setSaving(false)
    }
  }, [buildPayload])

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      saveToServer()
    }, 1200)
  }, [saveToServer])

  const loadFromServer = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/configurations', { method: 'GET' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        console.warn('[Load] not OK', res.status, j)
        return
      }
      const rows = (await res.json()) as any[]
      const found = rows?.find((r) => r?.name === 'ScaleUp-Dashboard-Config') || rows?.[0]
      const data: SavedDataShape | undefined = found?.data
      if (data && typeof data === 'object') {
        setScenario((data.scenario as any) || '50k')
        setVariant(data.variant || 'Recess Nanodispensing')
        setProjects(Array.isArray(data.projects) ? data.projects : defaultProjects)
        setProcesses(Array.isArray(data.processes) ? data.processes : defaultProcesses)
        setResources(Array.isArray(data.resources) ? data.resources : defaultResources)
        setRisks(Array.isArray(data.risks) ? data.risks : defaultRisks)
        setFinancials(Array.isArray(data.financials) ? data.financials : defaultFinancials)
        setMeetings(Array.isArray(data.meetings) ? data.meetings : defaultMeetings)
        setKpis(Array.isArray(data.kpis) ? data.kpis : defaultKpis)
        setGlossary(Array.isArray(data.glossary) ? data.glossary : defaultGlossary)
        setCapex50k(Array.isArray(data.capex50k) ? data.capex50k : defaultCapex50k)
        setCapex200k(Array.isArray(data.capex200k) ? data.capex200k : defaultCapex200k)
        setOpex50k(Array.isArray(data.opex50k) ? data.opex50k : defaultOpex50k)
        setOpex200k(Array.isArray(data.opex200k) ? data.opex200k : defaultOpex200k)
        setLastSaved(data.lastSaved || '')
      }
    } catch (e) {
      console.warn('[Load] error', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadFromServer()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Autosave when anything important changes
  useEffect(() => {
    if (loading) return
    scheduleSave()
  }, [
    loading,
    scenario,
    variant,
    projects,
    processes,
    resources,
    risks,
    financials,
    meetings,
    kpis,
    glossary,
    capex50k,
    capex200k,
    opex50k,
    opex200k,
    scheduleSave,
  ])

  // --------------- UI helpers ---------------

  const addRow = (which: string) => {
    switch (which) {
      case 'projects':
        setProjects((prev) => [
          [
            `PROJ-${Date.now()}`,
            'New Project',
            'Planning',
            'Must',
            'Owner',
            new Date().toISOString().slice(0, 10),
            new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
            '',
            'Deliverables',
            'Objectives',
            'R',
            'A',
            'C',
            'I',
            'needs',
            'barriers',
            'risks',
            0,
            0,
            0,
            '',
            false,
            'GREEN',
            0,
          ],
          ...prev,
        ])
        break
      case 'processes':
        setProcesses((prev) => [['New Process', 0, 1, 100, 0, 'Manual Station', 'Manual', 'Planning', 'Operator'], ...prev])
        break
      case 'resources':
        setResources((prev) => [['New Resource', 'Personnel', 1, 0, 'Department', ''], ...prev])
        break
      case 'risks':
        setRisks((prev) => [[`RISK-${Date.now()}`, 'New Risk', 'M', 'M', 'Mitigation', 'Owner', new Date().toISOString().slice(0, 10), 'Open'], ...prev])
        break
      case 'financials':
        setFinancials((prev) => [['Category', 'Item', 0, 'Expense', ''], ...prev])
        break
      case 'meetings':
        openNewMeetingModal()
        break
      case 'kpis':
        setKpis((prev) => [...prev, { id: `k-${Date.now()}`, name: 'New KPI', unit: '%', owner: 'Owner', current_value: 0, target_value: 100 }])
        break
      case 'glossary':
        setGlossary((prev) => [['New Term', 'Definition'], ...prev])
        break
      default:
        break
    }
  }

  const deleteRow = (which: string, index: number) => {
    switch (which) {
      case 'projects':
        setProjects((prev) => prev.filter((_, i) => i !== index))
        break
      case 'processes':
        setProcesses((prev) => prev.filter((_, i) => i !== index))
        break
      case 'resources':
        setResources((prev) => prev.filter((_, i) => i !== index))
        break
      case 'risks':
        setRisks((prev) => prev.filter((_, i) => i !== index))
        break
      case 'financials':
        setFinancials((prev) => prev.filter((_, i) => i !== index))
        break
      case 'meetings':
        setMeetings((prev) => prev.filter((_, i) => i !== index))
        break
      case 'kpis':
        setKpis((prev) => prev.filter((_, i) => i !== index))
        break
      case 'glossary':
        setGlossary((prev) => prev.filter((_, i) => i !== index))
        break
      default:
        break
    }
  }

  const updateCell = (setter: React.Dispatch<React.SetStateAction<AnyRow[]>>, rowIndex: number, colIndex: number, value: any) => {
    setter((prev) => {
      const next = prev.map((r, i) => (i === rowIndex ? r.map((c, j) => (j === colIndex ? value : c)) : r))
      return next
    })
  }

  const updateKpiCell = (rowIndex: number, key: keyof KPI, value: any) => {
    setKpis((prev) => prev.map((k, i) => (i === rowIndex ? { ...k, [key]: key.includes('value') ? Number(value) || 0 : value } : k)))
  }

  // --------------- Meeting helpers ---------------

  const openNewMeetingModal = () => {
    setEditingMeetingIndex(null)
    setMeetingForm({
      id: `MEET-${Date.now()}`,
      title: 'New Meeting',
      date: new Date().toISOString().slice(0, 10),
      time: '10:00',
      duration: '60 min',
      attendees: 'Project Team, Stakeholders',
      location: 'Conference Room / Zoom',
      status: 'Scheduled',
      agenda: '1. Welcome\n2. Updates\n3. Risks & Blockers\n4. Decisions\n5. Actions',
      objectives: 'Review progress and align priorities',
      notes: '',
    })
    setShowMeetingModal(true)
  }

  const openEditMeetingModal = (rowIndex: number) => {
    const row = meetings[rowIndex] || []
    setEditingMeetingIndex(rowIndex)
    setMeetingForm({
      id: String(row[0] || `MEET-${Date.now()}`),
      title: String(row[1] || 'Meeting'),
      date: String(row[2] || new Date().toISOString().slice(0, 10)),
      time: String(row[3] || '10:00'),
      duration: String(row[4] || '60 min'),
      attendees: String(row[5] || 'Team'),
      location: String(row[6] || 'Location'),
      status: String(row[7] || 'Scheduled'),
      agenda: String(row[8] || 'Agenda'),
      objectives: String(row[9] || 'Objectives'),
      notes: String(row[10] || 'Notes'),
    })
    setShowMeetingModal(true)
  }

  const saveMeetingFromModal = () => {
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
    ]

    setMeetings((prev) => {
      if (editingMeetingIndex === null) return [newRow, ...prev]
      const next = [...prev]
      next[editingMeetingIndex] = newRow
      return next
    })
    setShowMeetingModal(false)
    setEditingMeetingIndex(null)
  }

  const exportMeetingSummary = (rowIndex: number) => {
    const row = meetings[rowIndex] || []
    const title = String(row[1] || 'Meeting')
    const date = String(row[2] || '')
    const time = String(row[3] || '')
    const duration = String(row[4] || '')
    const attendees = String(row[5] || '')
    const location = String(row[6] || '')
    const status = String(row[7] || '')
    const agenda = String(row[8] || '')
    const objectives = String(row[9] || '')
    const notes = String(row[10] || '')

    const doc = new jsPDF({ unit: 'pt', format: 'a4' })
    const left = 40
    let y = 56

    doc.setFontSize(16)
    doc.text(`Meeting Summary — ${title}`, left, y)
    y += 18

    doc.setFontSize(11)
    doc.text(`Date: ${date}    Time: ${time}    Duration: ${duration}`, left, y)
    y += 16
    doc.text(`Location: ${location}`, left, y)
    y += 16
    doc.text(`Attendees: ${attendees}`, left, y)
    y += 16
    doc.text(`Status: ${status}`, left, y)
    y += 20

    autoTable(doc, {
      startY: y,
      head: [['Section', 'Details']],
      body: [
        ['Objectives', objectives],
        ['Agenda', agenda],
        ['Notes / Minutes', notes],
      ],
      styles: { fontSize: 10, cellPadding: 6, valign: 'top' },
      headStyles: { fillColor: [15, 23, 42] },
      columnStyles: { 0: { cellWidth: 140 }, 1: { cellWidth: 380 } },
      margin: { left },
      theme: 'striped',
    })

    doc.save(`Meeting_${title.replace(/\s+/g, '_')}_${date}.pdf`)
  }

  // --------------- PDF: CEO Summary ---------------
  function sumCapexTotal(rows: AnyRow[]): number {
    return rows.reduce((sum, r) => {
      const qty = Number(r?.[1]) || 0
      const unit = Number(r?.[2]) || 0
      const install = Number(r?.[3]) || 0
      return sum + qty * unit + install
    }, 0)
  }

  function sumOpexTotal(rows: AnyRow[]): number {
    return rows.reduce((sum, r) => {
      const qty = Number(r?.[2]) || 0
      const unit = Number(r?.[3]) || 0
      return sum + qty * unit
    }, 0)
  }

  const generateCEOReportPDF = () => {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' })
    const left = 40
    let y = 56

    const capex = sumCapexTotal(capexRows)
    const opex = sumOpexTotal(opexRows)
    const units = scenarioUnits
    const pricePerUnit = 45
    const rev = units * pricePerUnit
    const cpuLocal = units ? opex / units : 0
    const gp = rev - (capex + opex)
    const margin = rev > 0 ? (gp / rev) * 100 : 0

    const totalProjects = projects.length
    const completed = projects.filter((p) => (Number(p?.[17]) || 0) >= 100).length
    const onTrack = projects.filter((p) => String(p?.[22] || '').toUpperCase() === 'GREEN').length
    const atRisk = projects.filter((p) => {
      const s = String(p?.[22] || '').toUpperCase()
      return s === 'AMBER' || s === 'RED'
    }).length

    const avgKpi = kpis.length
      ? kpis.reduce((acc, k) => acc + (k.target_value ? (k.current_value / k.target_value) * 100 : 0), 0) / kpis.length
      : 0

    doc.setFontSize(18)
    doc.text(`CEO Executive Summary — ${variant} / ${scenario}`, left, y)
    y += 20
    doc.setFontSize(11)
    doc.text(`Generated: ${new Date().toLocaleString()}`, left, y)
    y += 18

    autoTable(doc, {
      startY: y,
      head: [['Metric', 'Value']],
      body: [
        ['Target Output (units/yr)', units.toLocaleString()],
        ['CapEx Total (USD)', `$${capex.toLocaleString()}`],
        ['OpEx Total (USD)', `$${opex.toLocaleString()}`],
        ['Cost / Unit (OpEx only)', `$${cpuLocal.toFixed(2)}`],
        ['Revenue (USD, est.)', `$${rev.toLocaleString()}`],
        ['Gross Profit (USD, est.)', `$${gp.toLocaleString()}`],
        ['Profit Margin (%)', `${margin.toFixed(1)}%`],
        ['Projects — Total / Completed / On-Track / At-Risk', `${totalProjects} / ${completed} / ${onTrack} / ${atRisk}`],
        ['KPIs — Avg Performance', `${avgKpi.toFixed(1)}%`],
        ['Risks — Total', `${risks.length}`],
      ],
      styles: { fontSize: 10, cellPadding: 6, valign: 'top' },
      headStyles: { fillColor: [15, 23, 42] },
      columnStyles: { 0: { cellWidth: 260 }, 1: { cellWidth: 260 } },
      margin: { left },
      theme: 'grid',
    })

    let afterY = (doc as any).lastAutoTable.finalY + 22

    autoTable(doc, {
      startY: afterY,
      head: [['KPI', 'Current', 'Target', 'Δ Var (%)', 'Owner']],
      body: kpis.map((k) => [
        k.name,
        `${k.current_value} ${k.unit}`,
        `${k.target_value} ${k.unit}`,
        k.target_value ? (((k.current_value - k.target_value) / k.target_value) * 100).toFixed(1) : '0.0',
        k.owner,
      ]),
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: [15, 23, 42] },
      columnStyles: { 0: { cellWidth: 220 }, 1: { cellWidth: 100 }, 2: { cellWidth: 100 }, 3: { cellWidth: 80 }, 4: { cellWidth: 120 } },
      margin: { left },
      theme: 'striped',
      didDrawPage: (data) => {
        doc.setFontSize(12)
        doc.text('KPI Dashboard', left, data.settings.startY - 8)
      },
    })

    afterY = (doc as any).lastAutoTable.finalY + 22

    const projectBody = projects.slice(0, 20).map((p) => [
      String(p?.[1] || ''),
      String(p?.[4] || ''),
      String(p?.[6] || ''),
      String(p?.[22] || ''),
      `${Number(p?.[17] || 0)}%`,
    ])

    autoTable(doc, {
      startY: afterY,
      head: [['Project', 'Owner', 'Finish', 'Status', 'Progress']],
      body: projectBody,
      styles: { fontSize: 9, cellPadding: 5, overflow: 'linebreak' },
      headStyles: { fillColor: [15, 23, 42] },
      columnStyles: { 0: { cellWidth: 240 }, 1: { cellWidth: 120 }, 2: { cellWidth: 90 }, 3: { cellWidth: 80 }, 4: { cellWidth: 50 } },
      margin: { left },
      theme: 'striped',
      didDrawPage: (data) => {
        doc.setFontSize(12)
        doc.text('Top Projects', left, data.settings.startY - 8)
      },
    })

    const fileName = `CEO_Summary_${variant.replace(/\s+/g, '_')}_${scenario}_${new Date().toISOString().slice(0, 10)}.pdf`
    doc.save(fileName)
  }

  // --------------- Rendering ---------------

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-lg">Loading your data…</span>
          </div>
          <div className="text-sm text-slate-500">If you have just signed in, your saved configuration will appear.</div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Manufacturing Scale-Up Dashboard</h1>
          <div className="text-sm text-slate-500">
            Scenario:
            <select
              value={scenario}
              onChange={(e) => setScenario(e.target.value as '50k' | '200k')}
              className="ml-2 border rounded px-2 py-1 text-sm"
            >
              <option value="50k">50k</option>
              <option value="200k">200k</option>
            </select>
            <span className="ml-4">Variant:</span>
            <input
              value={variant}
              onChange={(e) => setVariant(e.target.value)}
              className="ml-2 border rounded px-2 py-1 text-sm w-64"
            />
          </div>
          <div className="text-xs text-slate-500">
            {saving ? 'Saving…' : lastSaved ? `Last saved: ${lastSaved}` : 'Not yet saved'}
            {error ? <span className="ml-2 text-red-600">{error}</span> : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={saveToServer} className="gap-2">
            <Save className="h-4 w-4" /> Save now
          </Button>
          <Button onClick={generateCEOReportPDF} className="gap-2">
            <TrendingUp className="h-4 w-4" /> CEO Summary PDF
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <nav className="-mb-px flex flex-wrap gap-2">
          {['Overview','Projects','Processes','Resources','Risks','Financials','Meetings','KPIs','Glossary'].map((t) => (
            <button
              key={t}
              onClick={() => setActiveTab(t as any)}
              className={`px-3 py-2 text-sm border-b-2 ${activeTab === t ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
              {t}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      {activeTab === 'Overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="p-4 rounded-lg border bg-white">
            <div className="text-sm text-slate-500">Target Output</div>
            <div className="text-2xl font-semibold">{scenarioUnits.toLocaleString()} units/yr</div>
          </div>
          <div className="p-4 rounded-lg border bg-white">
            <div className="text-sm text-slate-500">Cost / Unit (OpEx only)</div>
            <div className="text-2xl font-semibold">${cpu.toFixed(2)}</div>
          </div>
          <div className="p-4 rounded-lg border bg-white">
            <div className="text-sm text-slate-500">Profit Margin</div>
            <div className="text-2xl font-semibold">{marginPct.toFixed(1)}%</div>
          </div>

          <div className="p-4 rounded-lg border bg-white">
            <div className="text-sm text-slate-500">Projects — Total / On-Track / At-Risk</div>
            <div className="text-2xl font-semibold">
              {projects.length} / {projects.filter((p) => String(p?.[22] || '').toUpperCase() === 'GREEN').length} / {
                projects.filter((p) => ['AMBER', 'RED'].includes(String(p?.[22] || '').toUpperCase())).length
              }
            </div>
          </div>
          <div className="p-4 rounded-lg border bg-white">
            <div className="text-sm text-slate-500">KPIs — Avg Performance</div>
            <div className="text-2xl font-semibold">
              {(
                kpis.length
                  ? kpis.reduce((acc, k) => acc + (k.target_value ? (k.current_value / k.target_value) * 100 : 0), 0) / kpis.length
                  : 0
              ).toFixed(1)}%
            </div>
          </div>
          <div className="p-4 rounded-lg border bg-white">
            <div className="text-sm text-slate-500">Risks — Total</div>
            <div className="text-2xl font-semibold">{risks.length}</div>
          </div>

          <div className="lg:col-span-3 p-4 rounded-lg border bg-white">
            <div className="text-sm font-medium mb-2">Budget vs Actual (Summary)</div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
              <div className="p-3 rounded border">
                <div className="text-slate-500">CapEx Total</div>
                <div className="text-lg font-semibold">${capexTotal.toLocaleString()}</div>
              </div>
              <div className="p-3 rounded border">
                <div className="text-slate-500">OpEx Total</div>
                <div className="text-lg font-semibold">${opexTotal.toLocaleString()}</div>
              </div>
              <div className="p-3 rounded border">
                <div className="text-slate-500">Revenue (Est.)</div>
                <div className="text-lg font-semibold">${revenue.toLocaleString()}</div>
              </div>
              <div className="p-3 rounded border">
                <div className="text-slate-500">Gross Profit (Est.)</div>
                <div className="text-lg font-semibold">${grossProfit.toLocaleString()}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'Projects' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-600">Projects</div>
            <div className="flex gap-2">
              <Button onClick={() => addRow('projects')} className="gap-2"><Plus className="h-4 w-4"/>Add Project</Button>
            </div>
          </div>
          {/* PROJECTS: formatting-only update — table-auto + textarea for long fields + wider minWidths */}
          <div className="overflow-auto rounded border">
            <table className="w-full table-auto">
              <thead className="bg-slate-50 text-slate-600 text-sm">
                <tr>
                  {[
                    'ID','Name','Type','Priority','Owner','Start','Finish','Dependencies','Deliverables','Goals',
                    'R','A','C','I','Needs','Barriers','Risks','% Complete','CapEx','OpEx','Link','Critical','Status','Slack (d)'
                  ].map((h) => (
                    <th key={h} className="px-2 py-2 text-left border-b whitespace-nowrap">{h}</th>
                  ))}
                  <th className="px-2 py-2 text-left border-b">Actions</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {projects.map((row, ri) => (
                  <tr key={ri} className="align-top">
                    {Array.from({ length: 24 }).map((_, ci) => {
                      const isLong =
                        ci === 1  || // Name
                        ci === 7  || // Dependencies
                        ci === 8  || // Deliverables
                        ci === 9  || // Goals
                        ci === 14 || // Needs
                        ci === 15 || // Barriers
                        ci === 16 || // Risks
                        ci === 20    // Link (can be long)
                      const minWidth =
                        ci === 1 || ci === 8 || ci === 9 ? 360 :
                        ci === 14 || ci === 15 || ci === 16 ? 320 :
                        ci === 7 ? 260 :
                        ci === 4 ? 200 :
                        ci === 0 ? 180 :
                        ci === 5 || ci === 6 ? 160 :
                        ci === 20 ? 280 :
                        ci >= 10 && ci <= 13 ? 90 :
                        160

                      return (
                        <td
                          key={ci}
                          className="border-b p-2 align-top"
                          style={{ minWidth, maxWidth: Math.max(minWidth, 420) }}
                        >
                          {isLong ? (
                            <textarea
                              className="w-full border rounded px-2 py-1 text-sm leading-snug resize-y whitespace-pre-wrap break-words"
                              rows={3}
                              value={String(row?.[ci] ?? '')}
                              onChange={(e) => updateCell(setProjects, ri, ci, e.target.value)}
                              onInput={(e) => {
                                const el = e.currentTarget
                                el.style.height = 'auto'
                                el.style.height = `${el.scrollHeight}px`
                              }}
                            />
                          ) : (
                            <input
                              className="w-full border rounded px-2 py-1 text-sm"
                              value={String(row?.[ci] ?? '')}
                              onChange={(e) => updateCell(setProjects, ri, ci, e.target.value)}
                            />
                          )}
                        </td>
                      )
                    })}
                    <td className="border-b p-2">
                      <Button variant="destructive" className="gap-2" onClick={() => deleteRow('projects', ri)}>
                        <Trash2 className="h-4 w-4"/>Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'Processes' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-600">Processes</div>
            <Button onClick={() => addRow('processes')} className="gap-2"><Plus className="h-4 w-4"/>Add Process</Button>
          </div>
          <div className="overflow-auto rounded border">
            <table className="w-full table-fixed">
              <thead className="bg-slate-50 text-slate-600 text-sm">
                <tr>
                  {['Process','Time (min)','Batch Size','Yield (%)','Cycle (s)','Equipment','Type','Status','Owner','']
                    .map((h, i) => (
                      <th key={i} className="px-2 py-2 text-left border-b whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="text-sm">
                {processes.map((row, ri) => (
                  <tr key={ri} className="align-top">
                    {Array.from({ length: 9 }).map((_, ci) => (
                      <td key={ci} className="border-b p-2 whitespace-pre-wrap break-words" style={{ minWidth: ci === 0 ? 240 : 140 }}>
                        <input
                          className="w-full border rounded px-2 py-1 text-sm"
                          value={String(row?.[ci] ?? '')}
                          onChange={(e) => updateCell(setProcesses, ri, ci, e.target.value)}
                        />
                      </td>
                    ))}
                    <td className="border-b p-2">
                      <Button variant="destructive" className="gap-2" onClick={() => deleteRow('processes', ri)}>
                        <Trash2 className="h-4 w-4"/>Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'Resources' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-600">Resources</div>
            <Button onClick={() => addRow('resources')} className="gap-2"><Plus className="h-4 w-4"/>Add Resource</Button>
          </div>
          <div className="overflow-auto rounded border">
            <table className="w-full table-fixed">
              <thead className="bg-slate-50 text-slate-600 text-sm">
                <tr>
                  {['Resource','Type','Qty','Cost','Department','Notes','']
                    .map((h, i) => (
                      <th key={i} className="px-2 py-2 text-left border-b whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="text-sm">
                {resources.map((row, ri) => (
                  <tr key={ri} className="align-top">
                    {Array.from({ length: 6 }).map((_, ci) => (
                      <td key={ci} className="border-b p-2 whitespace-pre-wrap break-words" style={{ minWidth: ci === 0 ? 220 : 140 }}>
                        <input
                          className="w-full border rounded px-2 py-1 text-sm"
                          value={String(row?.[ci] ?? '')}
                          onChange={(e) => updateCell(setResources, ri, ci, e.target.value)}
                        />
                      </td>
                    ))}
                    <td className="border-b p-2">
                      <Button variant="destructive" className="gap-2" onClick={() => deleteRow('resources', ri)}>
                        <Trash2 className="h-4 w-4"/>Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'Risks' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-600">Risks</div>
            <Button onClick={() => addRow('risks')} className="gap-2"><Plus className="h-4 w-4"/>Add Risk</Button>
          </div>
          <div className="overflow-auto rounded border">
            <table className="w-full table-fixed">
              <thead className="bg-slate-50 text-slate-600 text-sm">
                <tr>
                  {['ID','Risk','Impact','Prob','Mitigation','Owner','Due','Status','']
                    .map((h, i) => (
                      <th key={i} className="px-2 py-2 text-left border-b whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="text-sm">
                {risks.map((row, ri) => (
                  <tr key={ri} className="align-top">
                    {Array.from({ length: 8 }).map((_, ci) => (
                      <td key={ci} className="border-b p-2 whitespace-pre-wrap break-words" style={{ minWidth: ci === 1 || ci === 4 ? 260 : 140 }}>
                        <input
                          className="w-full border rounded px-2 py-1 text-sm"
                          value={String(row?.[ci] ?? '')}
                          onChange={(e) => updateCell(setRisks, ri, ci, e.target.value)}
                        />
                      </td>
                    ))}
                    <td className="border-b p-2">
                      <Button variant="destructive" className="gap-2" onClick={() => deleteRow('risks', ri)}>
                        <Trash2 className="h-4 w-4"/>Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'Financials' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-600">Financials</div>
            <Button onClick={() => addRow('financials')} className="gap-2"><Plus className="h-4 w-4"/>Add Item</Button>
          </div>
          <div className="overflow-auto rounded border">
            <table className="w-full table-fixed">
              <thead className="bg-slate-50 text-slate-600 text-sm">
                <tr>
                  {['Category','Item','Amount','Type','Notes','']
                    .map((h, i) => (
                      <th key={i} className="px-2 py-2 text-left border-b whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="text-sm">
                {financials.map((row, ri) => (
                  <tr key={ri} className="align-top">
                    {Array.from({ length: 5 }).map((_, ci) => (
                      <td key={ci} className="border-b p-2 whitespace-pre-wrap break-words" style={{ minWidth: ci === 4 ? 260 : 160 }}>
                        <input
                          className="w-full border rounded px-2 py-1 text-sm"
                          value={String(row?.[ci] ?? '')}
                          onChange={(e) => updateCell(setFinancials, ri, ci, e.target.value)}
                        />
                      </td>
                    ))}
                    <td className="border-b p-2">
                      <Button variant="destructive" className="gap-2" onClick={() => deleteRow('financials', ri)}>
                        <Trash2 className="h-4 w-4"/>Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-3 rounded border bg-white">
              <div className="text-sm text-slate-500">CapEx Total</div>
              <div className="text-lg font-semibold">${capexTotal.toLocaleString()}</div>
            </div>
            <div className="p-3 rounded border bg-white">
              <div className="text-sm text-slate-500">OpEx Total</div>
              <div className="text-lg font-semibold">${opexTotal.toLocaleString()}</div>
            </div>
            <div className="p-3 rounded border bg-white">
              <div className="text-sm text-slate-500">Cost / Unit</div>
              <div className="text-lg font-semibold">${cpu.toFixed(2)}</div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'Meetings' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-600">Project Meetings</div>
            <div className="flex gap-2">
              <Button onClick={() => addRow('meetings')} className="gap-2"><Calendar className="h-4 w-4"/>Schedule Meeting</Button>
            </div>
          </div>

          <div className="overflow-auto rounded border">
            <table className="w-full table-fixed">
              <thead className="bg-slate-50 text-slate-600 text-sm">
                <tr>
                  {['ID','Title','Date','Time','Duration','Attendees','Location','Status','Agenda','Objectives','Notes','']
                    .map((h, i) => (
                      <th key={i} className="px-2 py-2 text-left border-b whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="text-sm">
                {meetings.map((row, ri) => (
                  <tr key={ri} className="align-top">
                    {Array.from({ length: 11 }).map((_, ci) => (
                      <td key={ci} className="border-b p-2 whitespace-pre-wrap break-words" style={{ minWidth: ci >= 8 ? 260 : 160 }}>
                        <input
                          className="w-full border rounded px-2 py-1 text-sm"
                          value={String(row?.[ci] ?? '')}
                          onChange={(e) => updateCell(setMeetings, ri, ci, e.target.value)}
                          onDoubleClick={() => openEditMeetingModal(ri)}
                          title="Double click to open editor"
                        />
                      </td>
                    ))}
                    <td className="border-b p-2 flex flex-wrap gap-2">
                      <Button variant="secondary" className="gap-2" onClick={() => openEditMeetingModal(ri)}>
                        <FileText className="h-4 w-4"/>Edit
                      </Button>
                      <Button className="gap-2" onClick={() => exportMeetingSummary(ri)}>
                        <FileText className="h-4 w-4"/>Summary PDF
                      </Button>
                      <Button variant="destructive" className="gap-2" onClick={() => deleteRow('meetings', ri)}>
                        <Trash2 className="h-4 w-4"/>Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Meeting Modal */}
          {showMeetingModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
              <div className="w-full max-w-3xl bg-white rounded-lg shadow-lg">
                <div className="p-4 border-b flex items-center justify-between">
                  <div className="font-medium">{editingMeetingIndex === null ? 'Schedule Meeting' : 'Edit Meeting'}</div>
                  <button className="text-slate-500" onClick={() => setShowMeetingModal(false)}>✕</button>
                </div>
                <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-500">Title</label>
                    <input className="w-full border rounded px-2 py-1" value={meetingForm.title} onChange={(e) => setMeetingForm({ ...meetingForm, title: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-xs text-slate-500">Date</label>
                      <input type="date" className="w-full border rounded px-2 py-1" value={meetingForm.date} onChange={(e) => setMeetingForm({ ...meetingForm, date: e.target.value })} />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500">Time</label>
                      <input className="w-full border rounded px-2 py-1" value={meetingForm.time} onChange={(e) => setMeetingForm({ ...meetingForm, time: e.target.value })} />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500">Duration</label>
                      <input className="w-full border rounded px-2 py-1" value={meetingForm.duration} onChange={(e) => setMeetingForm({ ...meetingForm, duration: e.target.value })} />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">Attendees</label>
                    <input className="w-full border rounded px-2 py-1" value={meetingForm.attendees} onChange={(e) => setMeetingForm({ ...meetingForm, attendees: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">Location</label>
                    <input className="w-full border rounded px-2 py-1" value={meetingForm.location} onChange={(e) => setMeetingForm({ ...meetingForm, location: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">Status</label>
                    <input className="w-full border rounded px-2 py-1" value={meetingForm.status} onChange={(e) => setMeetingForm({ ...meetingForm, status: e.target.value })} />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs text-slate-500">Objectives</label>
                    <textarea className="w-full border rounded px-2 py-1 h-20" value={meetingForm.objectives} onChange={(e) => setMeetingForm({ ...meetingForm, objectives: e.target.value })} />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs text-slate-500">Agenda</label>
                    <textarea className="w-full border rounded px-2 py-1 h-28" value={meetingForm.agenda} onChange={(e) => setMeetingForm({ ...meetingForm, agenda: e.target.value })} />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs text-slate-500">Notes</label>
                    <textarea className="w-full border rounded px-2 py-1 h-28" value={meetingForm.notes} onChange={(e) => setMeetingForm({ ...meetingForm, notes: e.target.value })} />
                  </div>
                </div>
                <div className="p-4 border-t flex items-center justify-end gap-2">
                  <Button variant="secondary" onClick={() => setShowMeetingModal(false)}>Cancel</Button>
                  <Button onClick={saveMeetingFromModal} className="gap-2"><Calendar className="h-4 w-4"/>Save Meeting</Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'KPIs' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-600">Key Performance Indicators</div>
            <Button onClick={() => addRow('kpis')} className="gap-2"><Plus className="h-4 w-4"/>Add KPI</Button>
          </div>
          <div className="overflow-auto rounded border">
            <table className="w-full table-fixed">
              <thead className="bg-slate-50 text-slate-600 text-sm">
                <tr>
                  {['Name','Current','Target','Unit','Owner','']
                    .map((h, i) => (
                      <th key={i} className="px-2 py-2 text-left border-b whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="text-sm">
                {kpis.map((k, ri) => (
                  <tr key={k.id} className="align-top">
                    <td className="border-b p-2" style={{ minWidth: 220 }}>
                      <input className="w-full border rounded px-2 py-1 text-sm" value={k.name} onChange={(e) => updateKpiCell(ri, 'name', e.target.value)} />
                    </td>
                    <td className="border-b p-2" style={{ minWidth: 120 }}>
                      <input className="w-full border rounded px-2 py-1 text-sm" value={k.current_value} onChange={(e) => updateKpiCell(ri, 'current_value', e.target.value)} />
                    </td>
                    <td className="border-b p-2" style={{ minWidth: 120 }}>
                      <input className="w-full border rounded px-2 py-1 text-sm" value={k.target_value} onChange={(e) => updateKpiCell(ri, 'target_value', e.target.value)} />
                    </td>
                    <td className="border-b p-2" style={{ minWidth: 100 }}>
                      <input className="w-full border rounded px-2 py-1 text-sm" value={k.unit} onChange={(e) => updateKpiCell(ri, 'unit', e.target.value)} />
                    </td>
                    <td className="border-b p-2" style={{ minWidth: 160 }}>
                      <input className="w-full border rounded px-2 py-1 text-sm" value={k.owner} onChange={(e) => updateKpiCell(ri, 'owner', e.target.value)} />
                    </td>
                    <td className="border-b p-2">
                      <Button variant="destructive" className="gap-2" onClick={() => deleteRow('kpis', ri)}>
                        <Trash2 className="h-4 w-4"/>Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'Glossary' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-600">Glossary</div>
            <Button onClick={() => addRow('glossary')} className="gap-2"><Plus className="h-4 w-4"/>Add Term</Button>
          </div>
          <div className="overflow-auto rounded border">
            <table className="w-full table-fixed">
              <thead className="bg-slate-50 text-slate-600 text-sm">
                <tr>
                  {['Term','Definition','']
                    .map((h, i) => (
                      <th key={i} className="px-2 py-2 text-left border-b whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="text-sm">
                {glossary.map((row, ri) => (
                  <tr key={ri} className="align-top">
                    {Array.from({ length: 2 }).map((_, ci) => (
                      <td key={ci} className="border-b p-2 whitespace-pre-wrap break-words" style={{ minWidth: ci === 0 ? 180 : 360 }}>
                        <input
                          className="w-full border rounded px-2 py-1 text-sm"
                          value={String(row?.[ci] ?? '')}
                          onChange={(e) => updateCell(setGlossary, ri, ci, e.target.value)}
                        />
                      </td>
                    ))}
                    <td className="border-b p-2">
                      <Button variant="destructive" className="gap-2" onClick={() => deleteRow('glossary', ri)}>
                        <Trash2 className="h-4 w-4"/>Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
