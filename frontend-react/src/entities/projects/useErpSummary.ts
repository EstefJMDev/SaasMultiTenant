
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import axios from "axios";

import { apiClient } from "@shared/api/client";
import {
  fetchDepartments,
  fetchEmployeeAllocations,
  fetchEmployees,
  createEmployeeAllocation,
  updateEmployeeAllocation,
  deleteEmployeeAllocation,
  type EmployeeAllocation,
  type EmployeeProfile,
  type Department,
} from "@api/hr";
import { loadSummaryFallback, persistSummaryFallback } from "@shared/utils/erp";
import type { SummaryYearlyData, SaveStatus } from "@shared/utils/erp";
import { useDebouncedSave } from "./useDebouncedSave";

type AllocationUpsertPayload = {
  department_id: number | null;
  project_id: number;
  milestone: string | null;
  year: number;
  allocated_hours: number;
  notes: null;
};

type PendingAllocationOverride = {
  key: string;
  tenantId: number;
  employeeId: number;
  existingId?: number;
  payload: AllocationUpsertPayload;
  fallbackValue: string;
  employeeName: string;
};

const buildMockSummaryEmployees = (
  count: number,
  tenantId?: number,
  departmentIds: number[] = [],
): EmployeeProfile[] => {
  const total = Math.max(0, Math.floor(count));
  const createdAt = new Date().toISOString();
  return Array.from({ length: total }, (_, index) => {
    const employeeNumber = index + 1;
    const departmentId =
      departmentIds.length > 0
        ? departmentIds[index % departmentIds.length]
        : null;
    return {
      id: 900000 + employeeNumber,
      tenant_id: tenantId ?? 0,
      first_name: `Prueba ${employeeNumber}`,
      last_name: `Empleado ${employeeNumber}`,
      full_name: `Prueba ${employeeNumber} Empleado ${employeeNumber}`,
      email: `prueba${employeeNumber}@local.test`,
      hourly_rate: 0,
      available_hours: 1736,
      availability_percentage: 100,
      position: "Empleado de prueba",
      titulacion: "Test",
      employment_type: "test",
      hire_date: null,
      end_date: null,
      is_active: true,
      created_at: createdAt,
      primary_department_id: departmentId,
      department_allocations: departmentId
        ? [{ department_id: departmentId, percentage: 100, is_primary: true }]
        : [],
    };
  });
};

const buildTenantHeaders = (tenantId?: number | null) =>
  tenantId
    ? {
        headers: {
          "X-Tenant-Id": tenantId.toString(),
        },
      }
    : undefined;

const fetchSummaryData = async (
  year: number,
  tenantId?: number | null,
): Promise<SummaryYearlyData> => {
  try {
    const response = await apiClient.get<SummaryYearlyData>(
      `/api/v1/erp/summary/${year}`,
      buildTenantHeaders(tenantId),
    );
    await persistSummaryFallback(year, response.data);
    return response.data;
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 404) {
      return loadSummaryFallback(year);
    }
    console.warn("Fallo al cargar resumen, usando almacenamiento local", err);
    return loadSummaryFallback(year);
  }
};

const saveSummaryData = async ({
  year,
  payload,
  tenantId,
}: {
  year: number;
  payload: SummaryYearlyData;
  tenantId?: number | null;
}): Promise<void> => {
  try {
    await apiClient.put<SummaryYearlyData>(
      `/api/v1/erp/summary/${year}`,
      payload,
      buildTenantHeaders(tenantId),
    );
    await persistSummaryFallback(year, payload);
  } catch (err) {
    if (
      axios.isAxiosError(err) &&
      (err.response?.status === 404 || err.code === "ERR_NETWORK")
    ) {
      persistSummaryFallback(year, payload);
      return;
    }
    console.error(err);
    throw err;
  }
};

export const useErpSummary = ({
  hrTenantId,
  currentUserId,
}: {
  hrTenantId?: number;
  currentUserId?: number;
}) => {
  const [summaryYear, setSummaryYear] = useState<number>(
    new Date().getFullYear(),
  );
  const [allocationDraftsState, setAllocationDrafts] = useState<
    Record<string, string>
  >({});
  const [summarySearch, setSummarySearch] = useState("");
  const [summaryEditMode, setSummaryEditMode] = useState(false);
  const [projectJustify, setProjectJustify] = useState<Record<number, number>>(
    {},
  );
  const [projectJustified, setProjectJustified] = useState<
    Record<number, number>
  >({});
  const [summaryMilestones, setSummaryMilestones] = useState<
    Record<number, Array<{ label: string; hours: number }>>
  >({});
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<number[]>([]);
  const [departmentFilter, setDepartmentFilter] = useState<number | "all">(
    "all",
  );
  const [addDrawerDeptFilter, setAddDrawerDeptFilter] = useState<
    number | "all"
  >("all");
  const [addDrawerSearch, setAddDrawerSearch] = useState("");
  const [allocationEdits, setAllocationEdits] = useState<Record<string, string>>(
    {},
  );
  const allocationDraftsRef = useRef<Record<string, string>>({});
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | undefined>();
  const [pendingAllocationOverride, setPendingAllocationOverride] = useState<
    PendingAllocationOverride | null
  >(null);
  const hydratingRef = useRef(false);
  const queryClient = useQueryClient();

  const { data: storedYearData, isFetching: loadingSummaryYear } = useQuery<
    SummaryYearlyData | undefined
  >({
    queryKey: ["erp-summary", summaryYear, hrTenantId],
    queryFn: () => fetchSummaryData(summaryYear, hrTenantId),
    enabled: hrTenantId != null,
    refetchOnWindowFocus: false,
  });

  const {
    data: hrEmployees = [],
    isError: employeesError,
    error: employeesErrorMsg,
    isLoading: employeesLoading,
  } = useQuery<EmployeeProfile[]>({
    queryKey: ["hr-employees", hrTenantId, summaryYear],
    queryFn: () => fetchEmployees(hrTenantId, summaryYear),
    enabled: hrTenantId != null,
    retry: 3,
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
  });

  const {
    data: hrDepartments = [],
    isError: departmentsError,
    error: departmentsErrorMsg,
    isLoading: departmentsLoading,
  } = useQuery<Department[]>({
    queryKey: ["hr-departments", hrTenantId],
    queryFn: () => fetchDepartments(hrTenantId),
    enabled: hrTenantId != null,
    retry: 3,
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
  });

  const { data: allocations = [], isError: allocationsError } = useQuery<
    EmployeeAllocation[]
  >({
    queryKey: ["hr-allocations", summaryYear, hrTenantId],
    queryFn: () =>
      fetchEmployeeAllocations({
        year: summaryYear,
        tenantId: hrTenantId ?? undefined,
      }),
    enabled: hrTenantId != null,
    retry: 3,
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
  });

  const saveSummaryMutation = useMutation({
    mutationFn: (vars: { year: number; payload: SummaryYearlyData }) =>
      saveSummaryData({ ...vars, tenantId: hrTenantId }),
  });

  const saveSummaryDebounced = useDebouncedSave<{
    year: number;
    payload: SummaryYearlyData;
  }>(
    (value) => saveSummaryMutation.mutateAsync(value),
    700,
    (status) => {
      setSaveStatus(status);
      if (status !== "error") {
        setSaveErrorMessage(undefined);
      }
    },
    (err) => {
      const message =
        axios.isAxiosError(err) && err.response?.data?.detail
          ? String(err.response.data.detail)
          : "No se pudo guardar. Revisa permisos o conexión.";
      setSaveErrorMessage(message);
    },
  );

  const saveStatusLabel = {
    idle: "",
    saving: "Guardando los cambios...",
    saved: "Cambios guardados",
    error: "Error al guardar",
  }[saveStatus];

  const mockEmployeesCount = useMemo(() => {
    if (!import.meta.env.DEV || typeof window === "undefined") return 0;
    const rawValue = new URLSearchParams(window.location.search).get(
      "mockSummaryEmployees",
    );
    const parsed = Number(rawValue ?? 0);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
  }, []);

  const summaryEmployees = useMemo(() => {
    if (mockEmployeesCount === 0) return hrEmployees;
    return [
      ...hrEmployees,
      ...buildMockSummaryEmployees(
        mockEmployeesCount,
        hrTenantId,
        hrDepartments.map((department) => department.id),
      ),
    ];
  }, [hrDepartments, hrEmployees, hrTenantId, mockEmployeesCount]);

  useEffect(() => {
    hydratingRef.current = true;
    if (storedYearData) {
      setProjectJustify(storedYearData.projectJustify ?? {});
      setProjectJustified(storedYearData.projectJustified ?? {});
      setSummaryMilestones(storedYearData.summaryMilestones ?? {});
    } else {
      setProjectJustify({});
      setProjectJustified({});
      setSummaryMilestones({});
    }
    const timer = setTimeout(() => {
      hydratingRef.current = false;
    }, 0);
    return () => clearTimeout(timer);
  }, [storedYearData]);

  useEffect(() => {
    if (hydratingRef.current) return;

    saveSummaryDebounced({
      year: summaryYear,
      payload: {
        projectJustify,
        projectJustified,
        summaryMilestones,
      },
    });
  }, [projectJustify, projectJustified, summaryMilestones, summaryYear]);

  const milestoneTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    Object.entries(summaryMilestones).forEach(([projectId, items]) => {
      const sum = items.reduce((acc, item) => acc + (item.hours || 0), 0);
      totals[projectId] = sum;
    });
    return totals;
  }, [summaryMilestones]);

  const departmentAllocationPercentMap = useMemo(() => {
    const map: Record<number, number> = {};
    hrDepartments.forEach((dept) => {
      const rawPercent = dept.project_allocation_percentage;
      if (rawPercent !== null && rawPercent !== undefined) {
        map[dept.id] = Number(rawPercent);
        return;
      }
      const name = (dept.name || "").toLowerCase();
      if (name.includes("jefes de obra") || name.includes("jefe de obra")) {
        map[dept.id] = 30;
        return;
      }
      if (name.includes("estudio")) {
        map[dept.id] = 50;
        return;
      }
      if (name.includes("i+d") || name.includes("id")) {
        map[dept.id] = 100;
        return;
      }
      map[dept.id] = 100;
    });
    return map;
  }, [hrDepartments]);

  const departmentMap = useMemo(() => {
    const map: Record<number, string> = {};
    hrDepartments.forEach((dept) => {
      map[dept.id] = dept.name || `Departamento ${dept.id}`;
    });
    return map;
  }, [hrDepartments]);

  const departmentColorMap = useMemo(() => {
    const map: Record<number, string> = {};
    hrDepartments.forEach((dept, idx) => {
      map[dept.id] = [
        "teal",
        "purple",
        "orange",
        "blue",
        "brand",
        "red",
        "pink",
        "cyan",
      ][idx % 8];
    });
    return map;
  }, [hrDepartments]);

  const allocationKey = useCallback(
    (employeeId: number, projectId: number, year: number, milestoneLabel = "") =>
      `${employeeId}-${projectId}-${year}-${milestoneLabel || "general"}`,
    [],
  );

  const employeeById = useMemo(() => {
    const map = new Map<number, EmployeeProfile>();
    summaryEmployees.forEach((emp) => {
      map.set(emp.id, emp);
    });
    return map;
  }, [summaryEmployees]);

  const allocationIndex = useMemo(() => {
    const map = new Map<string, EmployeeAllocation>();
    allocations.forEach((alloc) => {
      if (!alloc.employee_id || !alloc.project_id || alloc.year !== summaryYear) {
        return;
      }
      const key = allocationKey(
        alloc.employee_id,
        alloc.project_id,
        summaryYear,
        alloc.milestone || "",
      );
      map.set(key, alloc);
    });
    return map;
  }, [allocations, allocationKey, summaryYear]);

  const submitAllocation = useCallback(
    async (
      req: {
        tenantId: number;
        employeeId: number;
        payload: AllocationUpsertPayload;
        existingId?: number;
      },
      overrideLimitAuthorized: boolean,
    ) => {
      const payload = overrideLimitAuthorized
        ? { ...req.payload, override_limit_authorized: true }
        : req.payload;
      if (req.existingId) {
        await updateEmployeeAllocation(req.existingId, payload);
        return;
      }
      await createEmployeeAllocation({
        tenant_id: req.tenantId,
        employee_id: req.employeeId,
        ...payload,
      });
    },
    [],
  );

  const persistAllocation = useCallback(
    async (key: string, value: string) => {
      const parts = key.split("-");
      const [employeeIdStr, projectIdStr, yearStr] = parts;
      const milestoneLabelRaw = parts.slice(3).join("-");
      const employeeId = Number(employeeIdStr);
      const projectId = Number(projectIdStr);
      const year = Number(yearStr);
      if (!Number.isFinite(employeeId) || !Number.isFinite(projectId) || !Number.isFinite(year)) {
        return;
      }
      const employee = employeeById.get(employeeId);

      const normalized = value.trim();
      const numericValue = Number(normalized);
      const existing = allocationIndex.get(key);
      const tenantId = hrTenantId ?? employee?.tenant_id;
      if (tenantId == null) return;
      const milestone =
        milestoneLabelRaw && milestoneLabelRaw !== "general"
          ? milestoneLabelRaw
          : null;

      if (!normalized || !Number.isFinite(numericValue)) {
        if (existing) {
          await deleteEmployeeAllocation(existing.id);
          await queryClient.invalidateQueries({
            queryKey: ["hr-allocations", summaryYear, hrTenantId],
          });
        }
        return;
      }

      const basePayload: AllocationUpsertPayload = {
        department_id: employee?.primary_department_id ?? null,
        project_id: projectId,
        milestone,
        year,
        allocated_hours: numericValue,
        notes: null,
      };
      try {
        await submitAllocation(
          {
            tenantId,
            employeeId,
            payload: basePayload,
            existingId: existing?.id,
          },
          false,
        );
      } catch (error) {
        const detail =
          axios.isAxiosError(error) &&
          typeof error.response?.data?.detail === "string"
            ? error.response.data.detail
            : "";
        const needsAuthorization =
          axios.isAxiosError(error) &&
          error.response?.status === 400 &&
          detail.toLowerCase().includes("autoriza");
        if (!needsAuthorization) {
          throw error;
        }
        setPendingAllocationOverride({
          key,
          tenantId,
          employeeId,
          existingId: existing?.id,
          payload: basePayload,
          fallbackValue: existing?.allocated_hours?.toString() ?? "",
          employeeName: employee?.full_name?.trim() || "Empleado",
        });
        return;
      }

      await queryClient.invalidateQueries({
        queryKey: ["hr-allocations", summaryYear, hrTenantId],
      });
    },
    [allocationIndex, employeeById, hrTenantId, queryClient, submitAllocation, summaryYear],
  );

  const handleConfirmAllocationOverride = useCallback(async () => {
    if (!pendingAllocationOverride) return;
    await submitAllocation(
      {
        tenantId: pendingAllocationOverride.tenantId,
        employeeId: pendingAllocationOverride.employeeId,
        payload: pendingAllocationOverride.payload,
        existingId: pendingAllocationOverride.existingId,
      },
      true,
    );
    await queryClient.invalidateQueries({
      queryKey: ["hr-allocations", summaryYear, hrTenantId],
    });
    setPendingAllocationOverride(null);
  }, [hrTenantId, pendingAllocationOverride, queryClient, submitAllocation, summaryYear]);

  const handleCancelAllocationOverride = useCallback(() => {
    if (pendingAllocationOverride) {
      setAllocationDrafts((prev) => {
        const next = { ...prev };
        if (pendingAllocationOverride.fallbackValue === "") {
          delete next[pendingAllocationOverride.key];
        } else {
          next[pendingAllocationOverride.key] =
            pendingAllocationOverride.fallbackValue;
        }
        allocationDraftsRef.current = next;
        return next;
      });
    }
    setPendingAllocationOverride(null);
  }, [pendingAllocationOverride]);



  const departmentAllocationTotals = useMemo(() => {
    const totals: Record<number, number> = {};
    allocations.forEach((alloc) => {
      if (alloc.year !== summaryYear) return;
      const deptId = alloc.department_id;
      if (!deptId) return;
      totals[deptId] = (totals[deptId] ?? 0) + Number(alloc.allocated_hours ?? 0);
    });
    return totals;
  }, [allocations, summaryYear]);

  const projectTotals = useMemo(() => {
    const totals: Record<number, number> = {};
    allocations.forEach((a) => {
      if (!a.project_id) return;
      totals[a.project_id] =
        (totals[a.project_id] ?? 0) + Number(a.allocated_hours ?? 0);
    });
    return totals;
  }, [allocations]);

  const projectTotalsByYear = useMemo(() => {
    const totals: Record<number, number> = {};
    allocations.forEach((alloc) => {
      if (alloc.year !== summaryYear) return;
      if (!alloc.project_id) return;
      totals[alloc.project_id] =
        (totals[alloc.project_id] ?? 0) + Number(alloc.allocated_hours ?? 0);
    });
    return totals;
  }, [allocations, summaryYear]);

  useEffect(() => {
    setProjectJustified(projectTotalsByYear);
  }, [projectTotalsByYear]);

  const employeeAvailability = useMemo(() => {
    const map: Record<number, number> = {};
    summaryEmployees.forEach((emp) => {
      const base = Number(emp.available_hours ?? 0);
      const available = Number.isFinite(base) ? Math.max(0, Math.round(base)) : 0;
      map[emp.id] = available;
    });
    return map;
  }, [summaryEmployees]);

  const employeeDepartmentPercentages = useMemo(() => {
    const records: Record<number, Record<number, number>> = {};
    allocations.forEach((alloc) => {
      if (alloc.year !== summaryYear) return;
      if (!alloc.employee_id || !alloc.department_id) return;
      const hours = Number(alloc.allocated_hours ?? 0);
      const employeeRecords = records[alloc.employee_id] ?? {};
      employeeRecords[alloc.department_id] =
        (employeeRecords[alloc.department_id] ?? 0) + hours;
      records[alloc.employee_id] = employeeRecords;
    });

    const result: Record<
      number,
      Array<{
        departmentId: number;
        departmentName: string;
        limitPercent: number;
        usedPercent: number;
        limitHours: number;
        usedHours: number;
        availableHours: number;
      }>
    > = {};

    Object.entries(records).forEach(([employeeIdStr, deptMap]) => {
      const employeeId = Number(employeeIdStr);
      const available = employeeAvailability[employeeId] ?? 0;
      const list = Object.entries(deptMap)
        .map(([deptIdStr, hours]) => {
          const deptId = Number(deptIdStr);
          const limitPercent = departmentAllocationPercentMap[deptId] ?? 100;
          const limitHours = Math.round((available * limitPercent) / 100);
          const usedPercent =
            available > 0 ? Math.round((hours / available) * 100) : 0;
          return {
            departmentId: deptId,
            departmentName: departmentMap[deptId] ?? "Sin departamento",
            limitPercent,
            usedPercent,
            limitHours,
            usedHours: Math.round(hours),
            availableHours: available,
          };
        })
        .sort((a, b) => b.usedPercent - a.usedPercent);
      result[employeeId] = list;
    });

    return result;
  }, [
    allocations,
    summaryYear,
    employeeAvailability,
    departmentMap,
    departmentAllocationPercentMap,
  ]);

  const employeeNameMap = useMemo(() => {
    const map: Record<number, string> = {};
    summaryEmployees.forEach((emp) => {
      map[emp.id] = emp.full_name?.trim() || "Empleado";
    });
    return map;
  }, [summaryEmployees]);

  const milestoneContributions = useMemo(() => {
    const map: Record<
      number,
      Record<string, Array<{ name: string; hours: number }>>
    > = {};
    allocations.forEach((alloc) => {
      if (!alloc.project_id || alloc.year !== summaryYear) return;
      const name = employeeNameMap[alloc.employee_id] ?? `${alloc.employee_id}`;
      const label = alloc.milestone || "Sin hitos";
      const projectMap = map[alloc.project_id] ?? {};
      const list = projectMap[label] ?? [];
      const existing = list.find((entry) => entry.name === name);
      if (existing) {
        existing.hours += Number(alloc.allocated_hours ?? 0);
      } else {
        list.push({ name, hours: Number(alloc.allocated_hours ?? 0) });
      }
      projectMap[label] = list;
      map[alloc.project_id] = projectMap;
    });
    return map;
  }, [allocations, summaryYear, employeeNameMap]);

  const employeeMilestoneHours = useMemo(() => {
    const map: Record<number, Record<number, Record<string, number>>> = {};
    allocations.forEach((alloc) => {
      if (alloc.year !== summaryYear) return;
      if (!alloc.employee_id || !alloc.project_id) return;
      const employeeMap = map[alloc.employee_id] ?? {};
      const projectMap = employeeMap[alloc.project_id] ?? {};
      const milestoneLabel = alloc.milestone || "Sin hitos";
      projectMap[milestoneLabel] =
        (projectMap[milestoneLabel] ?? 0) + Number(alloc.allocated_hours ?? 0);
      employeeMap[alloc.project_id] = projectMap;
      map[alloc.employee_id] = employeeMap;
    });
    return map;
  }, [allocations, summaryYear]);

  useEffect(() => {
    const selected = new Set(selectedEmployeeIds);
    const all = summaryEmployees.map((emp) => emp.id);
    const arraysEqual = (a: number[], b: number[]) =>
      a.length === b.length && a.every((value, idx) => value === b[idx]);

    if (selectedEmployeeIds.length === 0) {
      if (!arraysEqual(all, selectedEmployeeIds)) {
        setSelectedEmployeeIds(all);
      }
      return;
    }

    const filtered = all.filter((id) => selected.has(id));
    if (!arraysEqual(filtered, selectedEmployeeIds)) {
      setSelectedEmployeeIds(filtered);
    }
  }, [summaryEmployees, selectedEmployeeIds]);

  useEffect(() => {
    allocationDraftsRef.current = allocationDraftsState;
  }, [allocationDraftsState]);

  const handleAllocationDraftChange = useCallback((key: string, value: string) => {
    setAllocationDrafts((prev) => {
      const next = { ...prev, [key]: value };
      allocationDraftsRef.current = next;
      return next;
    });
  }, []);

  const filteredSummaryEmployees = useMemo(() => {
    const searchLower = summarySearch.toLowerCase();
    return summaryEmployees
      .filter((emp) => {
        if (!selectedEmployeeIds.includes(emp.id)) return false;
        const searchableName =
          [emp.first_name, emp.last_name, emp.full_name].filter(Boolean).join(" ");
        const matchesName = searchableName.toLowerCase().includes(searchLower);
        const matchesDepartment =
          departmentFilter === "all"
            ? true
            : emp.primary_department_id === departmentFilter;
        return matchesName && matchesDepartment;
      })
      .sort((a, b) => {
        const lastNameA = (a.last_name || a.full_name || "").trim().toLowerCase();
        const lastNameB = (b.last_name || b.full_name || "").trim().toLowerCase();
        if (lastNameA !== lastNameB) {
          return lastNameA.localeCompare(lastNameB, "es");
        }
        const firstNameA = (a.first_name || "").trim().toLowerCase();
        const firstNameB = (b.first_name || "").trim().toLowerCase();
        return firstNameA.localeCompare(firstNameB, "es");
      });
  }, [summaryEmployees, summarySearch, selectedEmployeeIds, departmentFilter]);

  const employeesAvailableToAdd = useMemo(() => {
    const searchLower = addDrawerSearch.toLowerCase();
    return summaryEmployees.filter((emp) => {
      if (selectedEmployeeIds.includes(emp.id)) return false;
      if (
        addDrawerDeptFilter !== "all" &&
        emp.primary_department_id !== addDrawerDeptFilter
      ) {
        return false;
      }
      return (emp.full_name || "").toLowerCase().includes(searchLower);
    });
  }, [summaryEmployees, addDrawerSearch, selectedEmployeeIds, addDrawerDeptFilter]);

  const handleAddEmployee = useCallback((employeeId: number) => {
    setSelectedEmployeeIds((prev) => [...prev, employeeId]);
  }, []);

  const addMilestoneRow = useCallback((projectId: number) => {
    setSummaryMilestones((prev) => {
      const list = prev[projectId] ?? [];
      return {
        ...prev,
        [projectId]: [
          ...list,
          { label: `H${list.length + 1}`, hours: 0 },
        ],
      };
    });
  }, []);

  const handleAllocationBlur = useCallback(
    async (
      employee: EmployeeProfile,
      projectId: number,
      milestoneLabel: string,
      value: string,
    ) => {
      if (!summaryEditMode) return;
      const key = allocationKey(
        employee.id,
        projectId,
        summaryYear,
        milestoneLabel,
      );
      setAllocationEdits((prev) => ({
        ...prev,
        [key]: value,
      }));
      await persistAllocation(key, value);
    },
    [
      summaryEditMode,
      allocationKey,
      summaryYear,
      persistAllocation,
    ],
  );

  useEffect(() => {
    const flush = async () => {
      if (summaryEditMode) return;
      const entries = Object.entries(allocationDraftsRef.current);
      if (entries.length === 0) return;
      await Promise.all(entries.map(([key, value]) => persistAllocation(key, value)));
      setAllocationDrafts({});
      setAllocationEdits({});
    };
    flush();
  }, [summaryEditMode, persistAllocation]);

  return {
    summaryYear,
    setSummaryYear,
    allocationDraftsState,
    setAllocationDrafts,
    handleAllocationDraftChange,
    summarySearch,
    setSummarySearch,
    summaryEditMode,
    setSummaryEditMode,
    projectJustify,
    setProjectJustify,
    projectJustified,
    setProjectJustified,
    summaryMilestones,
    setSummaryMilestones,
    selectedEmployeeIds,
    setSelectedEmployeeIds,
    departmentFilter,
    setDepartmentFilter,
    addDrawerDeptFilter,
    setAddDrawerDeptFilter,
    addDrawerSearch,
    setAddDrawerSearch,
    allocationEdits,
    setAllocationEdits,
    saveStatusLabel,
    saveErrorMessage,
    loadingSummaryYear,
    milestoneTotals,
    departmentAllocationPercentMap,
    departmentMap,
    departmentColorMap,
    allocationKey,
    allocationIndex,
    departmentAllocationTotals,
    projectTotals,
    projectTotalsByYear,
    employeeAvailability,
    employeeDepartmentPercentages,
    employeeNameMap,
    milestoneContributions,
    employeeMilestoneHours,
    filteredSummaryEmployees,
    employeesAvailableToAdd,
    handleAddEmployee,
    addMilestoneRow,
    handleAllocationBlur,
    pendingAllocationOverride,
    handleConfirmAllocationOverride,
    handleCancelAllocationOverride,
    hrEmployees: summaryEmployees,
    hrDepartments,
    allocations,
    employeesError,
    employeesErrorMsg,
    employeesLoading,
    departmentsError,
    departmentsErrorMsg,
    departmentsLoading,
    allocationsError,
  };
};



