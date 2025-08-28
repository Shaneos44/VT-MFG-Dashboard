// Utility function for deep cloning objects
export function clone<T>(obj: T): T {
  if (obj === null || typeof obj !== "object") return obj
  if (obj instanceof Date) return new Date(obj.getTime()) as unknown as T
  if (obj instanceof Array) return obj.map((item) => clone(item)) as unknown as T
  if (typeof obj === "object") {
    const clonedObj = {} as T
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        clonedObj[key] = clone(obj[key])
      }
    }
    return clonedObj
  }
  return obj
}

// Seed data for manufacturing scale-up planning
export const SEED_PLAN = {
  name: "VitalTrace Manufacturing Scale-Up",
  description: "Comprehensive manufacturing scale-up plan for VitalTrace production",
  products: {
    "50k": {
      name: "50k Units Production",
      description: "Initial production scale for market validation",
      targetVolume: 50000,
      projects: [
        {
          name: "Production Line Setup",
          description: "Establish initial manufacturing line",
          status: "In Progress",
          progress: 75,
          startDate: "2024-01-15",
          endDate: "2024-03-30",
          budget: 250000,
          assignee: "Manufacturing Team",
        },
        {
          name: "Quality Control Implementation",
          description: "Implement QC processes and testing protocols",
          status: "Planning",
          progress: 25,
          startDate: "2024-02-01",
          endDate: "2024-04-15",
          budget: 150000,
          assignee: "Quality Team",
        },
      ],
      processes: [
        {
          name: "Raw Material Preparation",
          description: "Prepare and validate raw materials",
          cycleTime: 30,
          batchSize: 100,
          yield: 95,
          station: "Prep Station A",
          automationLevel: "Semi-Automated",
          validationStatus: "Validated",
        },
        {
          name: "Assembly Process",
          description: "Main product assembly line",
          cycleTime: 45,
          batchSize: 50,
          yield: 98,
          station: "Assembly Line 1",
          automationLevel: "Automated",
          validationStatus: "In Progress",
        },
      ],
      equipment: [
        {
          name: "Assembly Machine A1",
          type: "Assembly",
          cost: 125000,
          capacity: 1000,
          status: "Operational",
        },
        {
          name: "Quality Tester Q1",
          type: "Testing",
          cost: 75000,
          capacity: 500,
          status: "Installation",
        },
      ],
      capex50k: [
        ["Equipment", "Assembly Line", 200, 1000, 50000],
        ["Facility", "Clean Room Setup", 150, 1000, 0],
        ["Tooling", "Production Tools", 75, 500, 12500],
      ],
      opex50k: [
        ["Labor", "Production Staff", 25, 12],
        ["Materials", "Raw Materials", 15, 12],
        ["Utilities", "Power & Water", 5, 12],
      ],
      resources: [
        {
          name: "Production Manager",
          role: "Management",
          allocation: 100,
          cost: 8000,
        },
        {
          name: "Assembly Technicians",
          role: "Production",
          allocation: 80,
          cost: 5000,
        },
      ],
      hiring: [
        {
          position: "Quality Engineer",
          department: "Quality",
          headcount: 2,
          salary: 75000,
          startDate: "2024-02-01",
          status: "Open",
        },
        {
          position: "Production Operator",
          department: "Manufacturing",
          headcount: 4,
          salary: 45000,
          startDate: "2024-01-15",
          status: "In Progress",
        },
      ],
      risks: [
        {
          risk: "Supply Chain Delays",
          probability: "Medium",
          impact: "High",
          mitigation: "Establish backup suppliers",
        },
        {
          risk: "Equipment Downtime",
          probability: "Low",
          impact: "Medium",
          mitigation: "Preventive maintenance schedule",
        },
      ],
      actions: [
        {
          action: "Complete equipment installation",
          owner: "Engineering Team",
          dueDate: "2024-03-15",
          status: "In Progress",
        },
        {
          action: "Finalize supplier agreements",
          owner: "Procurement Team",
          dueDate: "2024-02-28",
          status: "Pending",
        },
      ],
    },
    "200k": {
      name: "200k Units Production",
      description: "Full-scale production for market expansion",
      targetVolume: 200000,
      projects: [
        {
          name: "Production Scale-Up",
          description: "Scale production to 200k units capacity",
          status: "Planning",
          progress: 15,
          startDate: "2024-06-01",
          endDate: "2024-12-31",
          budget: 750000,
          assignee: "Manufacturing Team",
        },
        {
          name: "Automation Implementation",
          description: "Implement full automation systems",
          status: "Planning",
          progress: 10,
          startDate: "2024-07-01",
          endDate: "2024-11-30",
          budget: 500000,
          assignee: "Engineering Team",
        },
      ],
      processes: [
        {
          name: "Automated Assembly",
          description: "Fully automated assembly process",
          cycleTime: 25,
          batchSize: 200,
          yield: 99,
          station: "Auto Assembly Line",
          automationLevel: "Fully Automated",
          validationStatus: "Planning",
        },
        {
          name: "Inline Quality Control",
          description: "Automated quality control system",
          cycleTime: 15,
          batchSize: 200,
          yield: 99.5,
          station: "QC Station Auto",
          automationLevel: "Fully Automated",
          validationStatus: "Planning",
        },
      ],
      equipment: [
        {
          name: "Auto Assembly Line B1",
          type: "Assembly",
          cost: 450000,
          capacity: 4000,
          status: "Planning",
        },
        {
          name: "Automated QC System",
          type: "Testing",
          cost: 300000,
          capacity: 2000,
          status: "Planning",
        },
      ],
      capex50k: [
        ["Equipment", "Assembly Line", 200, 1000, 50000],
        ["Facility", "Clean Room Setup", 150, 1000, 0],
        ["Tooling", "Production Tools", 75, 500, 12500],
      ],
      capex200k: [
        ["Equipment", "Automated Production Line", 800, 1000, 0],
        ["Facility", "Facility Expansion", 400, 1000, 0],
        ["Infrastructure", "Utilities Upgrade", 200, 1000, 0],
        ["Automation", "Control Systems", 300, 1000, 0],
      ],
      opex50k: [
        ["Labor", "Production Staff", 25, 12],
        ["Materials", "Raw Materials", 15, 12],
        ["Utilities", "Power & Water", 5, 12],
      ],
      opex200k: [
        ["Labor", "Production Staff", 45, 12],
        ["Materials", "Raw Materials", 60, 12],
        ["Utilities", "Power & Water", 15, 12],
        ["Maintenance", "Equipment Maintenance", 8, 12],
      ],
      resources: [
        {
          name: "Operations Director",
          role: "Management",
          allocation: 100,
          cost: 12000,
        },
        {
          name: "Automation Engineers",
          role: "Engineering",
          allocation: 90,
          cost: 9000,
        },
      ],
      hiring: [
        {
          position: "Automation Engineer",
          department: "Engineering",
          headcount: 3,
          salary: 85000,
          startDate: "2024-05-01",
          status: "Planning",
        },
        {
          position: "Production Supervisor",
          department: "Manufacturing",
          headcount: 2,
          salary: 65000,
          startDate: "2024-06-01",
          status: "Planning",
        },
      ],
      risks: [
        {
          risk: "Technology Integration Challenges",
          probability: "Medium",
          impact: "High",
          mitigation: "Phased implementation approach",
        },
        {
          risk: "Market Demand Fluctuation",
          probability: "Medium",
          impact: "Medium",
          mitigation: "Flexible production capacity",
        },
      ],
      actions: [
        {
          action: "Finalize automation vendor selection",
          owner: "Engineering Team",
          dueDate: "2024-04-30",
          status: "Planning",
        },
        {
          action: "Complete facility expansion design",
          owner: "Facilities Team",
          dueDate: "2024-03-31",
          status: "Planning",
        },
      ],
    },
  },
}
