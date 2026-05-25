import React, { useEffect, useMemo, useRef, useState } from "react";
import { FiPlus, FiX, FiRefreshCw, FiSave, FiAlertCircle } from "react-icons/fi";
import { ProjectHero } from "@widgets/projects";

// Types
export type Year = number;

export interface Employee {
  id: number;
  name: string;
  surname: string;
}

export interface Project {
  id: string;
  name: string;
}

export interface Milestone {
  id: number;
  projectId: string;
  name: string;
}

export interface Availability {
  employeeId: number;
  year: Year;
  baseHours: number;
  percent: number; // 0-100
}

export interface HourRecord {
  employeeId: number;
  projectId: string;
  milestoneId: number;
  year: Year;
  hours: number;
}

export interface MilestoneBudget {
  milestoneId: number;
  year: Year;
  budget: number;
}

// Helpers for in-memory records
const keyHM = (milestoneId: number, year: Year) => `${milestoneId}-${year}`;
const keyHE = (
  employeeId: number,
  projectId: string,
  milestoneId: number,
  year: Year
) => `${employeeId}-${projectId}-${milestoneId}-${year}`;
const keyAV = (employeeId: number, year: Year) => `${employeeId}-${year}`;

// Mock API layer (replace with real endpoints)
const mockDelay = (ms = 350) => new Promise((res) => setTimeout(res, ms));

async function fetchData(year: Year): Promise<{
  employees: Employee[];
  projects: Project[];
  milestones: Milestone[];
  hours: HourRecord[];
  budgets: MilestoneBudget[];
  availability: Availability[];
}> {
  await mockDelay();

  const employees: Employee[] = [
    { id: 1, name: "Javier", surname: "miralles costas" },
    { id: 2, name: "Lucas", surname: "Rocamora Gomez" },
    { id: 3, name: "Javier", surname: "miralles costas" },
    { id: 4, name: "joselito", surname: "el ligon" },
    { id: 5, name: "dfdsfdsdlfsd", surname: "-" },
    { id: 6, name: "Mario", surname: "Fernandez" },
  ];

  const projects: Project[] = [
    { id: "construtic", name: "CONSTRUTIC" },
    { id: "sdfsdf", name: "SDFSDFSSDF" },
    { id: "constructic2", name: "CONSTRUCTIC" },
    { id: "dfgfdg", name: "DFGFDG" },
    { id: "dsfsdfd", name: "DSFSDFDSSDF" },
    { id: "excavaciones", name: "EXCAVACIONES SOLERO" },
  ];

  const milestones: Milestone[] = [
    { id: 1, projectId: "construtic", name: "H1" },
    { id: 2, projectId: "construtic", name: "H2" },
  ];

  const hours: HourRecord[] = [
    { employeeId: 6, projectId: "construtic", milestoneId: 1, year, hours: 500 },
    { employeeId: 6, projectId: "construtic", milestoneId: 2, year, hours: 368 },
  ];

  const budgets: MilestoneBudget[] = [
    { milestoneId: 1, year, budget: 0 },
    { milestoneId: 2, year, budget: 0 },
  ];

  const availability: Availability[] = employees.map((emp) => ({
    employeeId: emp.id,
    year,
    baseHours: 1736,
    percent: 100,
  }));

  return { employees, projects, milestones, hours, budgets, availability };
}

async function saveHours(payload: HourRecord): Promise<void> {
  await mockDelay();
}

async function saveMilestoneBudget(payload: MilestoneBudget): Promise<void> {
  await mockDelay();
}

async function saveEmployeeAvailability(payload: Availability): Promise<void> {
  await mockDelay();
}

// Debounced auto-save helper
function useDebouncedSave<T>(
  fn: (value: T) => Promise<void>,
  delay = 600,
  onStatus?: (s: "idle" | "saving" | "saved" | "error") => void
) {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const trigger = (value: T) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    onStatus?.("saving");
    timeoutRef.current = setTimeout(async () => {
      try {
        await fn(value);
        onStatus?.("saved");
        setTimeout(() => onStatus?.("idle"), 600);
      } catch (err) {
        console.error(err);
        onStatus?.("error");
      }
    }, delay);
  };

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  return trigger;
}
// Component
const ProjectMilestoneTracker: React.FC = () => {
  const [year, setYear] = useState<Year>(2025);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [hours, setHours] = useState<Record<string, HourRecord>>({});
  const [budgets, setBudgets] = useState<Record<string, MilestoneBudget>>({});
  const [availability, setAvailability] = useState<Record<string, Availability>>({});
  const [editingMilestone, setEditingMilestone] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  // Fetch data per year
  useEffect(() => {
    let mounted = true;
    fetchData(year).then((data) => {
      if (!mounted) return;
      setEmployees(data.employees);
      setProjects(data.projects);
      setMilestones(data.milestones);

      const hourMap: Record<string, HourRecord> = {};
      data.hours.forEach((h) => {
        hourMap[keyHE(h.employeeId, h.projectId, h.milestoneId, h.year)] = h;
      });
      setHours(hourMap);

      const budgetMap: Record<string, MilestoneBudget> = {};
      data.budgets.forEach((b) => {
        budgetMap[keyHM(b.milestoneId, b.year)] = b;
      });
      setBudgets(budgetMap);

      const avMap: Record<string, Availability> = {};
      data.availability.forEach((a) => {
        avMap[keyAV(a.employeeId, a.year)] = a;
      });
      setAvailability(avMap);
    });
    return () => {
      mounted = false;
    };
  }, [year]);

  const saveHourDebounced = useDebouncedSave(saveHours, 650, setStatus);
  const saveBudgetDebounced = useDebouncedSave(saveMilestoneBudget, 650, setStatus);
  const saveAvailabilityDebounced = useDebouncedSave(saveEmployeeAvailability, 650, setStatus);
  // Derived collections
  const milestonesByProject = useMemo(() => {
    const map: Record<string, Milestone[]> = {};
    milestones.forEach((m) => {
      if (!map[m.projectId]) map[m.projectId] = [];
      map[m.projectId].push(m);
    });
    return map;
  }, [milestones]);

  const filteredEmployees = useMemo(
    () =>
      employees.filter(
        (emp) =>
          searchTerm === "" ||
          emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          emp.surname.toLowerCase().includes(searchTerm.toLowerCase())
      ),
    [employees, searchTerm]
  );

  // Availability helpers
  const getAvailability = (employeeId: number, y: Year) =>
    availability[keyAV(employeeId, y)] || { employeeId, year: y, baseHours: 0, percent: 100 };

  const getAvailableHours = (employeeId: number, y: Year) => {
    const av = getAvailability(employeeId, y);
    return Math.round(av.baseHours * (av.percent / 100));
  };

  // Budget helpers
  const getBudget = (milestoneId: number, y: Year) => budgets[keyHM(milestoneId, y)]?.budget || 0;

  // Totals
  const milestoneTotals = useMemo(() => {
    const map: Record<number, number> = {};
    Object.values(hours).forEach((h) => {
      if (h.year !== year) return;
      map[h.milestoneId] = (map[h.milestoneId] || 0) + h.hours;
    });
    return map;
  }, [hours, year]);

  const projectTotals = useMemo(() => {
    const map: Record<string, number> = {};
    milestones.forEach((m) => {
      const total = milestoneTotals[m.id] || 0;
      map[m.projectId] = (map[m.projectId] || 0) + total;
    });
    return map;
  }, [milestoneTotals, milestones]);

  const employeeTotals = useMemo(() => {
    const map: Record<number, number> = {};
    Object.values(hours).forEach((h) => {
      if (h.year !== year) return;
      map[h.employeeId] = (map[h.employeeId] || 0) + h.hours;
    });
    return map;
  }, [hours, year]);

  const totalBudgets = useMemo(() => {
    return milestones.reduce((sum, m) => sum + getBudget(m.id, year), 0);
  }, [milestones, budgets, year]);

  const totalHorasJustificadas = useMemo(() => {
    return Object.values(hours)
      .filter((h) => h.year === year)
      .reduce((sum, h) => sum + h.hours, 0);
  }, [hours, year]);

  const totalHorasAJustificar = useMemo(() => totalBudgets, [totalBudgets]);
  const totalFaltantes = useMemo(
    () => totalHorasAJustificar - totalHorasJustificadas,
    [totalHorasAJustificar, totalHorasJustificadas]
  );
  // Mutations
  const handleHourChange = (
    employeeId: number,
    projectId: string,
    milestoneId: number,
    value: number
  ) => {
    const record: HourRecord = {
      employeeId,
      projectId,
      milestoneId,
      year,
      hours: Number.isFinite(value) ? value : 0,
    };
    const key = keyHE(employeeId, projectId, milestoneId, year);
    setHours((prev) => ({ ...prev, [key]: record }));
    saveHourDebounced(record);
  };

  const handleBudgetChange = (milestoneId: number, value: number) => {
    const record: MilestoneBudget = {
      milestoneId,
      year,
      budget: Number.isFinite(value) ? value : 0,
    };
    const key = keyHM(milestoneId, year);
    setBudgets((prev) => ({ ...prev, [key]: record }));
    saveBudgetDebounced(record);
  };

  const handleAvailabilityChange = (
    employeeId: number,
    field: "baseHours" | "percent",
    value: number
  ) => {
    const current = getAvailability(employeeId, year);
    const record: Availability = {
      ...current,
      [field]: Number.isFinite(value) ? value : 0,
    };
    const key = keyAV(employeeId, year);
    setAvailability((prev) => ({ ...prev, [key]: record }));
    saveAvailabilityDebounced(record);
  };

  const addMilestone = (projectId: string) => {
    const projectMilestones = milestones.filter((m) => m.projectId === projectId);
    const newId = Math.max(0, ...milestones.map((m) => m.id)) + 1;
    const newMilestone: Milestone = { id: newId, projectId, name: `H${projectMilestones.length + 1}` };
    setMilestones((prev) => [...prev, newMilestone]);
    const key = keyHM(newId, year);
    setBudgets((prev) => ({ ...prev, [key]: { milestoneId: newId, year, budget: 0 } }));
  };

  const removeMilestone = (milestoneId: number) => {
    setMilestones((prev) => prev.filter((m) => m.id !== milestoneId));
    setBudgets((prev) => {
      const clone = { ...prev };
      delete clone[keyHM(milestoneId, year)];
      return clone;
    });
    setHours((prev) => {
      const clone = { ...prev };
      Object.keys(clone).forEach((k) => {
        const h = clone[k];
        if (h.milestoneId === milestoneId && h.year === year) delete clone[k];
      });
      return clone;
    });
  };

  const updateMilestoneName = (milestoneId: number, name: string) => {
    setMilestones((prev) => prev.map((m) => (m.id === milestoneId ? { ...m, name: name || m.name } : m)));
    setEditingMilestone(null);
  };

  const statusLabel = {
    idle: "",
    saving: "Guardando…",
    saved: "Guardado",
    error: "Error al guardar",
  }[status];
  return (
    <div className="w-full min-h-screen bg-gray-50 p-4">
      <ProjectHero
        items={[]}
        title="Gestión y seguimiento de proyectos"
        subtitle="Tablero tipo Excel con horas y hitos por año."
        breadcrumb="Gestión de proyectos"
      />
      <div className="bg-white rounded-lg shadow-lg">
        <div className="bg-white border-b p-4 flex flex-wrap gap-4 items-end justify-between">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="text-xs text-gray-600">Buscar empleado</label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Nombre o apellidos"
                className="block w-48 px-3 py-1.5 border rounded text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-600">Año</label>
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="block w-24 px-3 py-1.5 border rounded text-sm bg-white"
              >
                {[2024, 2025, 2026, 2027].map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={() =>
                fetchData(year).then((data) => {
                  setEmployees(data.employees);
                  setProjects(data.projects);
                  setMilestones(data.milestones);
                  const hourMap: Record<string, HourRecord> = {};
                  data.hours.forEach((h) => {
                    hourMap[keyHE(h.employeeId, h.projectId, h.milestoneId, h.year)] = h;
                  });
                  setHours(hourMap);
                  const budgetMap: Record<string, MilestoneBudget> = {};
                  data.budgets.forEach((b) => {
                    budgetMap[keyHM(b.milestoneId, b.year)] = b;
                  });
                  setBudgets(budgetMap);
                  const avMap: Record<string, Availability> = {};
                  data.availability.forEach((a) => {
                    avMap[keyAV(a.employeeId, a.year)] = a;
                  });
                  setAvailability(avMap);
                })
              }
              className="px-4 py-1.5 bg-teal-600 text-white rounded hover:bg-teal-700 text-sm flex items-center gap-2"
            >
              <FiRefreshCw size={14} />
              Refrescar
            </button>
            {statusLabel && (
              <div className="flex items-center gap-1 text-xs text-gray-600 min-w-[90px]">
                {status === "saving" && <FiSave className="text-blue-500" />}
                {status === "saved" && <FiSave className="text-green-500" />}
                {status === "error" && <FiAlertCircle className="text-red-500" />}
                <span>{statusLabel}</span>
              </div>
            )}
          </div>
        </div>

        {/* Tabla principal */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-100">
                <th className="border px-2 py-2 sticky left-0 bg-gray-100 z-20" rowSpan={2}></th>
                <th className="border px-2 py-2 sticky left-8 bg-gray-100 z-20" rowSpan={2}></th>
                <th className="border px-2 py-2 sticky left-24 bg-gray-100 z-20" rowSpan={2}></th>
                {projects.map((project) => {
                  const projectMilestones = milestonesByProject[project.id] || [];
                  return (
                    <th
                      key={project.id}
                      className="border px-2 py-2 bg-blue-100 font-semibold"
                      colSpan={projectMilestones.length || 1}
                    >
                      <div className="flex items-center justify-center gap-2">
                        <span className="text-xs">{project.name}</span>
                        <button
                          onClick={() => addMilestone(project.id)}
                          className="p-1 bg-teal-700 text-white rounded-full hover:bg-teal-800"
                          title="Añadir hito"
                        >
                          <FiPlus size={12} />
                        </button>
                      </div>
                    </th>
                  );
                })}
                <th className="border px-2 py-2 bg-teal-700 text-white font-semibold" rowSpan={2}>
                  TOTAL HORAS
                  <br />
                  JUSTIFICADAS
                </th>
                <th className="border px-2 py-2" rowSpan={2}>
                  Horas
                  <br />
                  disponibles
                </th>
                <th className="border px-2 py-2" rowSpan={2}>
                  Diferencia
                </th>
              </tr>

              <tr className="bg-gray-100">
                {projects.map((project) => {
                  const projectMilestones = milestonesByProject[project.id] || [];

                  if (projectMilestones.length === 0) {
                    return (
                      <th key={`${project.id}-empty`} className="border px-2 py-1 bg-gray-50">
                        <span className="text-xs text-gray-400">Sin hitos</span>
                      </th>
                    );
                  }

                  return projectMilestones.map((milestone) => (
                    <th key={milestone.id} className="border px-2 py-1 bg-blue-50">
                      <div className="flex items-center justify-center gap-1">
                        {editingMilestone === milestone.id ? (
                          <input
                            type="text"
                            defaultValue={milestone.name}
                            onBlur={(e) => updateMilestoneName(milestone.id, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter")
                                updateMilestoneName(milestone.id, (e.target as HTMLInputElement).value);
                            }}
                            className="w-12 px-1 border rounded text-center text-xs"
                            autoFocus
                          />
                        ) : (
                          <>
                            <span className="font-semibold text-xs">{milestone.name}</span>
                            <button onClick={() => setEditingMilestone(milestone.id)} className="text-blue-600">
                              <FiSave size={10} />
                            </button>
                          </>
                        )}
                        <button onClick={() => removeMilestone(milestone.id)} className="text-red-600">
                          <FiX size={10} />
                        </button>
                      </div>
                    </th>
                  ));
                })}
              </tr>
            </thead>
            <tbody>
              {/* HORAS A JUSTIFICAR */}
              <tr className="bg-gray-50">
                <td className="border px-2 py-2 font-semibold sticky left-0 bg-gray-50 z-10" colSpan={3}>
                  HORAS A JUSTIFICAR
                </td>
                {projects.map((project) => {
                  const projectMilestones = milestonesByProject[project.id] || [];
                  if (projectMilestones.length === 0) {
                    return <td key={`budget-${project.id}`} className="border px-2 py-1 text-center">0</td>;
                  }
                  return projectMilestones.map((milestone) => (
                    <td key={`budget-${milestone.id}`} className="border px-2 py-1 text-center">
                      <input
                        type="number"
                        value={getBudget(milestone.id, year) || ""}
                        onChange={(e) => handleBudgetChange(milestone.id, parseFloat(e.target.value))}
                        className="w-full px-1 py-1 text-center border-0 bg-transparent focus:bg-yellow-50 focus:outline-none"
                        placeholder="0"
                      />
                    </td>
                  ));
                })}
                <td className="border px-2 py-1 text-center font-semibold bg-gray-100">{totalHorasAJustificar} H</td>
                <td className="border px-2 py-1" colSpan={2}></td>
              </tr>

              {/* JUSTIFICADAS */}
              <tr className="bg-green-50">
                <td className="border px-2 py-2 font-semibold sticky left-0 bg-green-50 z-10" colSpan={3}>
                  JUSTIFICADAS
                </td>
                {projects.map((project) => {
                  const projectMilestones = milestonesByProject[project.id] || [];
                  if (projectMilestones.length === 0)
                    return <td key={`justified-${project.id}`} className="border px-2 py-1 text-center">0</td>;
                  return projectMilestones.map((milestone) => (
                    <td key={`justified-${milestone.id}`} className="border px-2 py-1 text-center font-semibold">
                      {milestoneTotals[milestone.id] || 0}
                    </td>
                  ));
                })}
                <td className="border px-2 py-1 text-center bg-teal-700 text-white font-bold">
                  <div className="text-sm">JUSTIFICADAS</div>
                  <div className="text-xs">TOTALES</div>
                </td>
                <td className="border px-2 py-1" colSpan={2}></td>
              </tr>

              {/* FALTAN */}
              <tr className="bg-orange-50">
                <td className="border px-2 py-2 font-semibold sticky left-0 bg-orange-50 z-10" colSpan={3}>
                  FALTAN
                </td>
                {projects.map((project) => {
                  const projectMilestones = milestonesByProject[project.id] || [];
                  if (projectMilestones.length === 0)
                    return <td key={`missing-${project.id}`} className="border px-2 py-1 text-center">0 H</td>;
                  return projectMilestones.map((milestone) => {
                    const missing = getBudget(milestone.id, year) - (milestoneTotals[milestone.id] || 0);
                    return (
                      <td key={`missing-${milestone.id}`} className="border px-2 py-1 text-center font-semibold text-orange-700">
                        {missing} H
                      </td>
                    );
                  });
                })}
                <td className="border px-2 py-1 text-center font-semibold bg-gray-100">{totalFaltantes} H</td>
                <td className="border px-2 py-1" colSpan={2}></td>
              </tr>

              {/* % EJECUTADO */}
              <tr className="bg-blue-50">
                <td className="border px-2 py-2 font-semibold sticky left-0 bg-blue-50 z-10" colSpan={3}>
                  % EJECUTADO EN {year}
                </td>
                {projects.map((project) => {
                  const projectMilestones = milestonesByProject[project.id] || [];
                  if (projectMilestones.length === 0)
                    return <td key={`percent-${project.id}`} className="border px-2 py-1 text-center">0%</td>;
                  return projectMilestones.map((milestone) => {
                    const budget = getBudget(milestone.id, year);
                    const executed = milestoneTotals[milestone.id] || 0;
                    const percent = budget > 0 ? Math.round((executed / budget) * 100) : 0;
                    return (
                      <td key={`percent-${milestone.id}`} className="border px-2 py-1 text-center font-semibold">
                        {percent}%
                      </td>
                    );
                  });
                })}
                <td className="border px-2 py-1 text-center font-semibold bg-gray-100">
                  {totalBudgets > 0 ? Math.round((totalHorasJustificadas / totalBudgets) * 100) : 0}%
                </td>
                <td className="border px-2 py-1" colSpan={2}></td>
              </tr>

              {/* HITOS SECTION */}
              <tr className="bg-green-100">
                <td className="border px-2 py-3 font-semibold sticky left-0 bg-green-100 z-10" colSpan={3}>
                  HITOS (H1/H2/H3/H4)
                </td>
                {projects.map((project) => {
                  const projectMilestones = milestonesByProject[project.id] || [];
                  return (
                    <td key={`hito-section-${project.id}`} className="border-0 p-0" colSpan={projectMilestones.length || 1}>
                      <div
                        className="grid gap-0"
                        style={{ gridTemplateColumns: `repeat(${projectMilestones.length || 1}, minmax(0, 1fr))` }}
                      >
                        {projectMilestones.length === 0 ? (
                          <div className="border px-2 py-2 bg-white"></div>
                        ) : (
                          projectMilestones.map((milestone) => (
                            <div key={`hito-${milestone.id}`} className="border px-2 py-2 bg-white">
                              <div className="flex items-center justify-between mb-1">
                                {editingMilestone === milestone.id ? (
                                  <input
                                    type="text"
                                    defaultValue={milestone.name}
                                    onBlur={(e) => updateMilestoneName(milestone.id, e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter")
                                        updateMilestoneName(milestone.id, (e.target as HTMLInputElement).value);
                                    }}
                                    className="w-full px-1 border rounded text-center text-xs font-semibold"
                                    autoFocus
                                  />
                                ) : (
                                  <div className="flex items-center justify-center gap-1 w-full">
                                    <span className="font-semibold text-xs">{milestone.name}</span>
                                    <button
                                      onClick={() => setEditingMilestone(milestone.id)}
                                      className="text-blue-600 hover:text-blue-800"
                                    >
                                      <FiSave size={10} />
                                    </button>
                                    <button
                                      onClick={() => removeMilestone(milestone.id)}
                                      className="text-red-600 hover:text-red-800"
                                    >
                                      <FiX size={10} />
                                    </button>
                                  </div>
                                )}
                              </div>
                              <input
                                type="number"
                                value={getBudget(milestone.id, year) || ""}
                                onChange={(e) => handleBudgetChange(milestone.id, parseFloat(e.target.value))}
                                className="w-full px-1 py-1 border rounded text-center text-xs mb-1"
                                placeholder="0"
                              />
                              <div className="text-center text-xs text-gray-600">TOTAL: {milestoneTotals[milestone.id] || 0} H</div>
                            </div>
                          ))
                        )}
                      </div>
                    </td>
                  );
                })}
                <td className="border px-2 py-1" colSpan={3}></td>
              </tr>
              {/* Empleados */}
              {filteredEmployees.map((emp, idx) => (
                <tr key={emp.id} className="hover:bg-gray-50">
                  <td className="border px-2 py-2 text-center sticky left-0 bg-white z-10 text-xs">{idx + 1}</td>
                  <td className="border px-2 py-2 sticky left-8 bg-white z-10 text-xs font-medium">{emp.name}</td>
                  <td className="border px-2 py-2 sticky left-24 bg-white z-10 text-xs">{emp.surname}</td>
                  {projects.map((project) => {
                    const projectMilestones = milestonesByProject[project.id] || [];
                    if (projectMilestones.length === 0)
                      return (
                        <td key={`${emp.id}-${project.id}`} className="border px-2 py-1 text-center">
                          <span className="text-gray-400 text-xs">0 h</span>
                        </td>
                      );
                    return projectMilestones.map((milestone) => {
                      const key = keyHE(emp.id, project.id, milestone.id, year);
                      const current = hours[key]?.hours ?? "";
                      return (
                        <td key={`${emp.id}-${milestone.id}`} className="border px-1 py-1 text-center">
                          <input
                            type="number"
                            value={current}
                            onChange={(e) =>
                              handleHourChange(emp.id, project.id, milestone.id, parseFloat(e.target.value))
                            }
                            className="w-full px-1 py-1 text-center border-0 bg-transparent focus:bg-blue-50 focus:outline-none text-xs"
                            placeholder="0"
                          />
                        </td>
                      );
                    });
                  })}
                  <td className="border px-2 py-1 text-center bg-teal-700 text-white font-bold text-xs">
                    {employeeTotals[emp.id] || 0} h
                  </td>
                  <td className="border px-2 py-1 text-center text-xs">{getAvailableHours(emp.id, year)} h</td>
                  <td className="border px-2 py-1 text-center text-xs">
                    {getAvailableHours(emp.id, year) - (employeeTotals[emp.id] || 0)} h
                  </td>
                </tr>
              ))}

              {/* Disponibilidad editable */}
              <tr className="bg-gray-100">
                <td className="border px-2 py-2 font-semibold sticky left-0 bg-gray-100 z-10" colSpan={3}>
                  Disponibilidad anual
                </td>
                <td
                  className="border px-2 py-1"
                  colSpan={projects.reduce((acc, p) => acc + (milestonesByProject[p.id]?.length || 1), 0)}
                >
                  <div
                    className="grid"
                    style={{ gridTemplateColumns: `repeat(${filteredEmployees.length || 1}, minmax(160px, 1fr))` }}
                  >
                    {filteredEmployees.map((emp) => {
                      const av = getAvailability(emp.id, year);
                      return (
                        <div key={`av-${emp.id}`} className="p-2 border bg-white">
                          <div className="text-xs font-semibold mb-1">
                            {emp.name} {emp.surname}
                          </div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs text-gray-600">Base</span>
                            <input
                              type="number"
                              value={av.baseHours}
                              onChange={(e) => handleAvailabilityChange(emp.id, "baseHours", parseFloat(e.target.value))}
                              className="w-20 px-1 py-1 border rounded text-xs"
                            />
                          </div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs text-gray-600">%</span>
                            <input
                              type="number"
                              value={av.percent}
                              onChange={(e) => handleAvailabilityChange(emp.id, "percent", parseFloat(e.target.value))}
                              className="w-16 px-1 py-1 border rounded text-xs"
                            />
                            <span className="text-xs text-gray-500 ml-auto">{getAvailableHours(emp.id, year)} h</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </td>
                <td className="border px-2 py-1" colSpan={3}></td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="grid grid-cols-3 gap-6 p-6 bg-gray-50 border-t">
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-sm text-gray-600 mb-1">Horas a justificar</div>
            <div className="text-3xl font-bold text-gray-800">{totalHorasAJustificar} h</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-sm text-gray-600 mb-1">Justificadas</div>
            <div className="text-3xl font-bold text-teal-700">{totalHorasJustificadas} h</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-sm text-gray-600 mb-1">Faltantes</div>
            <div className="text-3xl font-bold text-orange-600">{totalFaltantes} h</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectMilestoneTracker;


