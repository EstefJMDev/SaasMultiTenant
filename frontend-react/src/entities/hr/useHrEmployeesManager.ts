import React, { useMemo, useState } from "react";
import { useDisclosure, useToast } from "@chakra-ui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import {
  createEmployee,
  deleteEmployee,
  fetchEmployeeAllocations,
  fetchEmployees,
  fetchHeadcount,
  upsertEmployeeYearAvailability,
  updateEmployee,
  type Department,
  type EmployeeAllocation,
  type EmployeeProfile,
  type HeadcountItem,
} from "@api/hr";
import { fetchUsersByTenant, type TenantUserSummary } from "@api/users";

export const DEPARTMENT_HEAD_TAG = "[JefeDepartamento]";

export interface EmployeeFormState {
  userId: number | "";
  firstName: string;
  lastName: string;
  email: string;
  hourlyRate: string;
  position: string;
  positionId: number | "";
  titulacion: string;
  availableHours: string;
  availabilityPercentage: string;
  primaryDepartmentId: number | "";
  secondaryDepartmentId: number | "";
  secondaryPercentage: string;
  isDepartmentHead: boolean;
}

export interface EmployeeEditFormState {
  firstName: string;
  lastName: string;
  email: string;
  hourlyRate: string;
  position: string;
  positionId: number | "";
  directorTecnicoId: number | "";
  titulacion: string;
  availableHours: string;
  availabilityPercentage: string;
  primaryDepartmentId: number | "";
  secondaryDepartmentId: number | "";
  secondaryPercentage: string;
  isDepartmentHead: boolean;
  isActive: boolean;
}

interface UseHrEmployeesParams {
  effectiveTenantId: number | null;
  isSuperAdmin: boolean;
  departments: Department[] | undefined;
  departmentById: Map<number, Department>;
}

const normalizeDepartmentName = (value?: string | null): string =>
  (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

const resolveDepartmentAvailability = (
  department: Department | undefined,
  currentValue: string,
): { value: string; locked: boolean } => {
  if (!department) {
    return { value: currentValue, locked: false };
  }

  const deptName = normalizeDepartmentName(department.name);
  if (deptName.includes("jefes de obra")) {
    return { value: "30", locked: true };
  }
  if (deptName.includes("estudio")) {
    return { value: "50", locked: true };
  }
  if (
    deptName.includes("i+d") ||
    deptName === "id" ||
    /\bi\s*\+\s*d\b/.test(deptName)
  ) {
    return { value: "100", locked: true };
  }
  if (deptName.includes("especiales")) {
    if (currentValue.trim() !== "") {
      return { value: currentValue, locked: false };
    }
    const manualValue = department.project_allocation_percentage;
    return {
      value:
        manualValue != null && Number.isFinite(Number(manualValue))
          ? String(Number(manualValue))
          : "",
      locked: false,
    };
  }

  return { value: currentValue, locked: false };
};

const hasDepartmentHeadTag = (position?: string | null): boolean =>
  String(position ?? "").includes(DEPARTMENT_HEAD_TAG);

const stripDepartmentHeadTag = (position?: string | null): string =>
  String(position ?? "").replace(DEPARTMENT_HEAD_TAG, "").trim();

const composeEmployeeFullName = (
  firstName?: string | null,
  lastName?: string | null,
  fallback?: string | null,
): string => {
  const parts = [firstName?.trim(), lastName?.trim()].filter(Boolean);
  if (parts.length > 0) {
    return parts.join(" ");
  }
  return fallback?.trim() ?? "";
};

export const useHrEmployeesManager = ({
  effectiveTenantId,
  isSuperAdmin,
  departments,
  departmentById,
}: UseHrEmployeesParams) => {
  const toast = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const {
    isOpen: isCreateOpen,
    onOpen: onCreateOpen,
    onClose: onCreateClose,
  } = useDisclosure();
  const {
    isOpen: isDeleteOpen,
    onOpen: onDeleteOpen,
    onClose: onDeleteClose,
  } = useDisclosure();

  const [employeeForm, setEmployeeForm] = useState<EmployeeFormState>({
    userId: "",
    firstName: "",
    lastName: "",
    email: "",
    hourlyRate: "",
    position: "",
    positionId: "",
    titulacion: "",
    availableHours: "",
    availabilityPercentage: "",
    primaryDepartmentId: "",
    secondaryDepartmentId: "",
    secondaryPercentage: "",
    isDepartmentHead: false,
  });
  const [editingEmployee, setEditingEmployee] = useState<EmployeeProfile | null>(null);
  const [employeeEditForm, setEmployeeEditForm] = useState<EmployeeEditFormState>({
    firstName: "",
    lastName: "",
    email: "",
    hourlyRate: "",
    position: "",
    positionId: "",
    directorTecnicoId: "",
    titulacion: "",
    availableHours: "",
    availabilityPercentage: "",
    primaryDepartmentId: "",
    secondaryDepartmentId: "",
    secondaryPercentage: "",
    isDepartmentHead: false,
    isActive: true,
  });
  const [selectedYear, setSelectedYear] = useState<number>(() => new Date().getFullYear());
  const [selectedDepartmentFilter, setSelectedDepartmentFilter] = useState<number | "all">(
    "all",
  );

  const {
    data: employees,
    isLoading: isLoadingEmployees,
    isError: isErrorEmployees,
  } = useQuery<EmployeeProfile[]>({
    queryKey: ["hr-employees", effectiveTenantId, selectedYear],
    queryFn: () =>
      fetchEmployees(
        isSuperAdmin ? effectiveTenantId ?? undefined : undefined,
        selectedYear,
      ),
    enabled: effectiveTenantId != null || !isSuperAdmin,
  });

  const { data: allocations = [] } = useQuery<EmployeeAllocation[]>({
    queryKey: ["hr-allocations", effectiveTenantId, selectedYear],
    queryFn: () =>
      fetchEmployeeAllocations({
        tenantId: effectiveTenantId ?? undefined,
      }),
    enabled: effectiveTenantId != null || !isSuperAdmin,
    refetchOnWindowFocus: false,
  });

  const { data: headcount, isLoading: isLoadingHeadcount } = useQuery<HeadcountItem[]>({
    queryKey: ["hr-headcount", effectiveTenantId],
    queryFn: () =>
      fetchHeadcount(isSuperAdmin ? effectiveTenantId ?? undefined : undefined),
    enabled: effectiveTenantId != null || !isSuperAdmin,
  });

  const { data: tenantUsers, isLoading: isLoadingTenantUsers } = useQuery<
    TenantUserSummary[]
  >({
    queryKey: ["hr-tenant-users", effectiveTenantId],
    queryFn: () =>
      fetchUsersByTenant(effectiveTenantId as number, {
        excludeAssigned: true,
      }),
    enabled: effectiveTenantId != null,
  });

  type YearAvailabilityPayload = {
    available_hours: number | null;
    availability_percentage: number | null;
    hourly_rate: number | null;
  };

  const hasAnyYearAvailabilityValue = (payload: YearAvailabilityPayload): boolean =>
    payload.available_hours !== null ||
    payload.availability_percentage !== null ||
    payload.hourly_rate !== null;

  const createEmployeeMutation = useMutation({
    mutationFn: async (variables: {
      data: Parameters<typeof createEmployee>[0]["data"];
      tenantId?: number;
      yearAvailability: YearAvailabilityPayload;
    }) => {
      const createdEmployee = await createEmployee({
        data: variables.data,
        tenantId: variables.tenantId,
      });
      if (hasAnyYearAvailabilityValue(variables.yearAvailability)) {
        await upsertEmployeeYearAvailability(
          createdEmployee.id,
          selectedYear,
          {
            year: selectedYear,
            ...variables.yearAvailability,
          },
          variables.tenantId,
        );
      }
      return createdEmployee;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["hr-employees", effectiveTenantId, selectedYear],
      });
      queryClient.invalidateQueries({ queryKey: ["hr-headcount"] });
      setEmployeeForm({
        userId: "",
        firstName: "",
        lastName: "",
        email: "",
        hourlyRate: "",
        position: "",
        positionId: "",
        titulacion: "",
        availableHours: "",
        availabilityPercentage: "",
        primaryDepartmentId: "",
        secondaryDepartmentId: "",
        secondaryPercentage: "",
        isDepartmentHead: false,
      });
      handleCloseCreate();
      toast({
        title: t("hr.messages.employeeCreated"),
        status: "success",
        duration: 3000,
        isClosable: true,
      });
    },
    onError: () => {
      toast({
        title: t("hr.messages.employeeCreateErrorTitle"),
        description: t("hr.messages.employeeCreateErrorDesc"),
        status: "error",
        duration: 4000,
        isClosable: true,
      });
    },
  });

  const updateEmployeeMutation = useMutation({
    mutationFn: async (variables: {
      profileId: number;
      profileData: Parameters<typeof updateEmployee>[0]["data"];
      yearAvailability: YearAvailabilityPayload;
      tenantId?: number;
    }) => {
      const updatedEmployee = await updateEmployee({
        profileId: variables.profileId,
        data: variables.profileData,
      });
      await upsertEmployeeYearAvailability(
        variables.profileId,
        selectedYear,
        {
          year: selectedYear,
          ...variables.yearAvailability,
        },
        variables.tenantId,
      );
      return updatedEmployee;
    },
    onMutate: async (variables) => {
      const queryKey = ["hr-employees", effectiveTenantId, selectedYear];
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<EmployeeProfile[]>(queryKey);
      queryClient.setQueryData<EmployeeProfile[]>(queryKey, (old) =>
        (old ?? []).map((emp) =>
          emp.id === variables.profileId
            ? {
                ...emp,
                ...variables.profileData,
                available_hours: variables.yearAvailability.available_hours ?? emp.available_hours,
                hourly_rate: variables.yearAvailability.hourly_rate ?? emp.hourly_rate,
                availability_percentage:
                  variables.yearAvailability.availability_percentage ?? emp.availability_percentage,
              }
            : emp,
        ),
      );
      return { previous, queryKey };
    },
    onError: (_err, _variables, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(context.queryKey, context.previous);
      }
      toast({
        title: t("hr.messages.employeeUpdateErrorTitle"),
        description: t("hr.messages.genericErrorDesc"),
        status: "error",
        duration: 4000,
        isClosable: true,
      });
    },
    onSuccess: () => {
      toast({
        title: t("hr.messages.employeeUpdated"),
        status: "success",
        duration: 3000,
        isClosable: true,
      });
      handleCloseEdit();
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: ["hr-employees", effectiveTenantId, selectedYear],
      });
      queryClient.invalidateQueries({ queryKey: ["hr-headcount"] });
    },
  });

  const deleteEmployeeMutation = useMutation({
    mutationFn: deleteEmployee,
    onMutate: async (employeeId) => {
      const queryKey = ["hr-employees", effectiveTenantId, selectedYear];
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<EmployeeProfile[]>(queryKey);
      queryClient.setQueryData<EmployeeProfile[]>(queryKey, (old) =>
        (old ?? []).filter((emp) => emp.id !== employeeId),
      );
      return { previous, queryKey };
    },
    onError: (_err, _employeeId, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(context.queryKey, context.previous);
      }
      toast({
        title: t("hr.messages.employeeDeleteErrorTitle"),
        description: t("hr.messages.genericErrorDesc"),
        status: "error",
        duration: 4000,
        isClosable: true,
      });
    },
    onSuccess: () => {
      toast({
        title: t("hr.messages.employeeDeleted"),
        status: "success",
        duration: 3000,
        isClosable: true,
      });
      handleCloseEdit();
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["hr-employees"] });
      queryClient.invalidateQueries({ queryKey: ["hr-headcount"] });
    },
  });

  const assignedUserIds = useMemo(() => {
    return new Set(
      (employees ?? [])
        .map((employee) => employee.user_id)
        .filter((userId): userId is number => userId != null),
    );
  }, [employees]);

  const availableTenantUsers = useMemo(() => {
    return (tenantUsers ?? []).filter((user) => !assignedUserIds.has(user.id));
  }, [tenantUsers, assignedUserIds]);

  const yearOptions = useMemo(() => {
    const now = new Date().getFullYear();
    const years = [];
    for (let y = now - 3; y <= now + 1; y += 1) {
      years.push(y);
    }
    return years;
  }, []);

  const departmentOptions = useMemo(
    () =>
      (departments ?? []).map((dept) => ({
        id: dept.id,
        name: dept.name || departmentById.get(dept.id)?.name || `Dept ${dept.id}`,
      })),
    [departments, departmentById],
  );

  const allocationsByEmployee = useMemo(() => {
    const map = new Map<number, number>();
    allocations.forEach((alloc) => {
      if (!alloc.employee_id) return;
      if (alloc.year != null && alloc.year !== selectedYear) return;
      const hours = Number(alloc.allocated_hours ?? 0);
      map.set(alloc.employee_id, (map.get(alloc.employee_id) ?? 0) + hours);
    });
    return map;
  }, [allocations, selectedYear]);

  const filteredEmployees = useMemo(() => {
    if (!employees) return [];
    const yearStart = new Date(selectedYear, 0, 1);
    const yearEnd = new Date(selectedYear, 11, 31, 23, 59, 59, 999);
    const activeByYear = employees.filter((employee) => {
      const hireDate = employee.hire_date ? new Date(employee.hire_date) : null;
      const endDate = employee.end_date ? new Date(employee.end_date) : null;
      if (hireDate && Number.isNaN(hireDate.getTime())) return true;
      if (endDate && Number.isNaN(endDate.getTime())) return true;
      const started = !hireDate || hireDate <= yearEnd;
      const notEnded = !endDate || endDate >= yearStart;
      return started && notEnded;
    });
    if (selectedDepartmentFilter === "all") return activeByYear;
    return activeByYear.filter((e) => e.primary_department_id === selectedDepartmentFilter);
  }, [employees, selectedDepartmentFilter, selectedYear]);

  const createAvailabilityLocked = useMemo(() => {
    if (employeeForm.primaryDepartmentId === "") return false;
    const department = departmentById.get(Number(employeeForm.primaryDepartmentId));
    return resolveDepartmentAvailability(
      department,
      employeeForm.availabilityPercentage,
    ).locked;
  }, [
    departmentById,
    employeeForm.availabilityPercentage,
    employeeForm.primaryDepartmentId,
  ]);

  const editAvailabilityLocked = useMemo(() => {
    if (employeeEditForm.primaryDepartmentId === "") return false;
    const department = departmentById.get(Number(employeeEditForm.primaryDepartmentId));
    return resolveDepartmentAvailability(
      department,
      employeeEditForm.availabilityPercentage,
    ).locked;
  }, [
    departmentById,
    employeeEditForm.availabilityPercentage,
    employeeEditForm.primaryDepartmentId,
  ]);

  const handleEmployeeChange = (
    event: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>,
  ) => {
    const { name } = event.target;
    const value =
      event.target instanceof HTMLInputElement && event.target.type === "checkbox"
        ? event.target.checked
        : event.target.value;
    setEmployeeForm((prev) => {
      const parsedValue =
        name === "userId" ||
        name === "primaryDepartmentId" ||
        name === "secondaryDepartmentId"
          ? value
            ? Number(value)
            : ""
          : value;
      const nextState: EmployeeFormState = {
        ...prev,
        [name]: parsedValue,
      };
      if (name === "primaryDepartmentId") {
        const selectedDept =
          parsedValue === "" ? undefined : departmentById.get(Number(parsedValue));
        const rule = resolveDepartmentAvailability(
          selectedDept,
          nextState.availabilityPercentage,
        );
        nextState.availabilityPercentage = rule.value;
      }
      return nextState;
    });
  };

  const handleEmployeeEditChange = (
    event: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>,
  ) => {
    const { name } = event.target;
    const value =
      event.target instanceof HTMLInputElement && event.target.type === "checkbox"
        ? event.target.checked
        : event.target.value;
    setEmployeeEditForm((prev) => {
      const parsedValue =
        name === "primaryDepartmentId" ||
        name === "secondaryDepartmentId" ||
        name === "positionId" ||
        name === "directorTecnicoId"
          ? value
            ? Number(value)
            : ""
          : value;
      const nextState: EmployeeEditFormState = {
        ...prev,
        [name]: parsedValue,
      };
      if (name === "primaryDepartmentId") {
        const selectedDept =
          parsedValue === "" ? undefined : departmentById.get(Number(parsedValue));
        const rule = resolveDepartmentAvailability(
          selectedDept,
          nextState.availabilityPercentage,
        );
        nextState.availabilityPercentage = rule.value;
      }
      return nextState;
    });
  };

  const openEditEmployee = (employee: EmployeeProfile) => {
    setEditingEmployee(employee);
    const initialAvailability =
      employee.availability_percentage != null
        ? String(employee.availability_percentage)
        : "";
    const selectedDept =
      employee.primary_department_id != null
        ? departmentById.get(employee.primary_department_id)
        : undefined;
    const availabilityRule = resolveDepartmentAvailability(
      selectedDept,
      initialAvailability,
    );
    setEmployeeEditForm({
      firstName: employee.first_name ?? employee.full_name ?? "",
      lastName: employee.last_name ?? "",
      email: employee.email ?? "",
      hourlyRate: employee.hourly_rate != null ? String(employee.hourly_rate) : "",
      position: stripDepartmentHeadTag(employee.position),
      positionId: employee.position_id ?? "",
      directorTecnicoId: employee.director_tecnico_id ?? "",
      titulacion: employee.titulacion ?? "",
      availableHours:
        employee.available_hours != null ? String(employee.available_hours) : "",
      availabilityPercentage: availabilityRule.value,
      primaryDepartmentId: employee.primary_department_id ?? "",
      secondaryDepartmentId:
        employee.department_allocations?.find(
          (alloc) =>
            !alloc.is_primary && alloc.department_id !== employee.primary_department_id,
        )?.department_id ?? "",
      secondaryPercentage:
        employee.department_allocations?.find(
          (alloc) =>
            !alloc.is_primary && alloc.department_id !== employee.primary_department_id,
        )?.percentage != null
          ? String(
              employee.department_allocations?.find(
                (alloc) =>
                  !alloc.is_primary &&
                  alloc.department_id !== employee.primary_department_id,
              )?.percentage ?? "",
            )
          : "",
      isDepartmentHead: hasDepartmentHeadTag(employee.position),
      isActive: employee.is_active,
    });
    onOpen();
  };

  const handleCloseEdit = () => {
    setEditingEmployee(null);
    onClose();
  };

  const handleCloseCreate = () => {
    setEmployeeForm({
      userId: "",
      firstName: "",
      lastName: "",
      email: "",
      hourlyRate: "",
      position: "",
      positionId: "",
      titulacion: "",
      availableHours: "",
      availabilityPercentage: "",
      primaryDepartmentId: "",
      secondaryDepartmentId: "",
      secondaryPercentage: "",
      isDepartmentHead: false,
    });
    onCreateClose();
  };

  const handleUpdateEmployee = () => {
    if (!editingEmployee) return;
    if (!employeeEditForm.primaryDepartmentId) {
      toast({
        title: t("hr.messages.departmentRequired"),
        status: "warning",
        duration: 3000,
        isClosable: true,
      });
      return;
    }
    if (
      employeeEditForm.secondaryDepartmentId &&
      employeeEditForm.secondaryDepartmentId === employeeEditForm.primaryDepartmentId
    ) {
      toast({
        title: "Los departamentos deben ser distintos",
        status: "warning",
      });
      return;
    }
    const secondaryPct = employeeEditForm.secondaryDepartmentId
      ? Number(employeeEditForm.secondaryPercentage || 0)
      : 0;
    if (secondaryPct < 0 || secondaryPct >= 100) {
      toast({
        title: "El porcentaje del segundo departamento debe ser entre 1 y 99",
        status: "warning",
      });
      return;
    }
    const primaryPct = 100 - secondaryPct;
    const cleanPosition = employeeEditForm.position.trim();
    const positionValue = employeeEditForm.isDepartmentHead
      ? cleanPosition
        ? `${cleanPosition} ${DEPARTMENT_HEAD_TAG}`
        : `Jefe de departamento ${DEPARTMENT_HEAD_TAG}`
      : cleanPosition || undefined;
    const nextHourlyRate =
      employeeEditForm.hourlyRate.trim() === ""
        ? null
        : Number(employeeEditForm.hourlyRate);
    const nextAvailableHours =
      employeeEditForm.availableHours.trim() === ""
        ? null
        : Number(employeeEditForm.availableHours);
    const nextAvailabilityPercentage =
      employeeEditForm.availabilityPercentage.trim() === ""
        ? null
        : Number(employeeEditForm.availabilityPercentage);

    updateEmployeeMutation.mutate({
      profileId: editingEmployee.id,
      profileData: {
        first_name: employeeEditForm.firstName.trim() || undefined,
        last_name: employeeEditForm.lastName.trim() || undefined,
        full_name:
          composeEmployeeFullName(
            employeeEditForm.firstName,
            employeeEditForm.lastName,
          ) || undefined,
        email: employeeEditForm.email.trim() || undefined,
        position: positionValue,
        position_id:
          employeeEditForm.positionId === ""
            ? null
            : Number(employeeEditForm.positionId),
        director_tecnico_id:
          employeeEditForm.directorTecnicoId === ""
            ? 0
            : Number(employeeEditForm.directorTecnicoId),
        titulacion: employeeEditForm.titulacion || undefined,
        primary_department_id: employeeEditForm.primaryDepartmentId,
        department_allocations: employeeEditForm.secondaryDepartmentId
          ? [
              {
                department_id: Number(employeeEditForm.primaryDepartmentId),
                percentage: primaryPct,
                is_primary: true,
              },
              {
                department_id: Number(employeeEditForm.secondaryDepartmentId),
                percentage: secondaryPct,
                is_primary: false,
              },
            ]
          : [
              {
                department_id: Number(employeeEditForm.primaryDepartmentId),
                percentage: 100,
                is_primary: true,
              },
            ],
        is_active: employeeEditForm.isActive,
      },
      yearAvailability: {
        hourly_rate: Number.isFinite(nextHourlyRate as number) ? nextHourlyRate : null,
        available_hours: Number.isFinite(nextAvailableHours as number)
          ? nextAvailableHours
          : null,
        availability_percentage: Number.isFinite(nextAvailabilityPercentage as number)
          ? nextAvailabilityPercentage
          : null,
      },
      tenantId: isSuperAdmin ? effectiveTenantId ?? undefined : undefined,
    });
  };

  const handleDeleteEmployee = () => {
    if (!editingEmployee) return;
    onDeleteOpen();
  };

  const confirmDeleteEmployee = () => {
    if (!editingEmployee) return;
    deleteEmployeeMutation.mutate(editingEmployee.id);
  };

  const handleCreateEmployee = (event: React.FormEvent) => {
    event.preventDefault();
    if (!employeeForm.primaryDepartmentId) {
      toast({
        title: t("hr.messages.departmentRequired"),
        status: "warning",
        duration: 3000,
        isClosable: true,
      });
      return;
    }
    if (!employeeForm.userId && !employeeForm.firstName.trim()) {
      toast({
        title: t("hr.messages.nameRequired"),
        description: t("hr.messages.employeeNameRequiredDesc"),
        status: "warning",
        duration: 3000,
        isClosable: true,
      });
      return;
    }
    if (!employeeForm.titulacion) {
      toast({
        title: t("hr.messages.titulacionRequired"),
        status: "warning",
        duration: 3000,
        isClosable: true,
      });
      return;
    }
    if (isSuperAdmin && !effectiveTenantId) {
      toast({
        title: t("hr.messages.selectTenant"),
        status: "warning",
        duration: 3000,
        isClosable: true,
      });
      return;
    }
    if (
      employeeForm.secondaryDepartmentId &&
      employeeForm.secondaryDepartmentId === employeeForm.primaryDepartmentId
    ) {
      toast({
        title: "Los departamentos deben ser distintos",
        status: "warning",
      });
      return;
    }
    const secondaryPct = employeeForm.secondaryDepartmentId
      ? Number(employeeForm.secondaryPercentage || 0)
      : 0;
    if (secondaryPct < 0 || secondaryPct >= 100) {
      toast({
        title: "El porcentaje del segundo departamento debe ser entre 1 y 99",
        status: "warning",
      });
      return;
    }
    const primaryPct = 100 - secondaryPct;
    const cleanPosition = employeeForm.position.trim();
    const positionValue = employeeForm.isDepartmentHead
      ? cleanPosition
        ? `${cleanPosition} ${DEPARTMENT_HEAD_TAG}`
        : `Jefe de departamento ${DEPARTMENT_HEAD_TAG}`
      : cleanPosition || undefined;
    const nextHourlyRate =
      employeeForm.hourlyRate.trim() === "" ? null : Number(employeeForm.hourlyRate);
    const nextAvailableHours =
      employeeForm.availableHours.trim() === ""
        ? null
        : Number(employeeForm.availableHours);
    const nextAvailabilityPercentage =
      employeeForm.availabilityPercentage.trim() === ""
        ? null
        : Number(employeeForm.availabilityPercentage);

    createEmployeeMutation.mutate({
      data: {
        user_id: employeeForm.userId || undefined,
        first_name: employeeForm.firstName.trim() || undefined,
        last_name: employeeForm.lastName.trim() || undefined,
        full_name:
          composeEmployeeFullName(
            employeeForm.firstName,
            employeeForm.lastName,
          ) || undefined,
        email: employeeForm.email.trim() || undefined,
        position: positionValue,
        position_id:
          employeeForm.positionId === ""
            ? null
            : Number(employeeForm.positionId),
        titulacion: employeeForm.titulacion || undefined,
        employment_type: "permanent",
        primary_department_id: employeeForm.primaryDepartmentId,
        department_allocations: employeeForm.secondaryDepartmentId
          ? [
              {
                department_id: Number(employeeForm.primaryDepartmentId),
                percentage: primaryPct,
                is_primary: true,
              },
              {
                department_id: Number(employeeForm.secondaryDepartmentId),
                percentage: secondaryPct,
                is_primary: false,
              },
            ]
          : [
              {
                department_id: Number(employeeForm.primaryDepartmentId),
                percentage: 100,
                is_primary: true,
              },
            ],
      },
      yearAvailability: {
        hourly_rate: Number.isFinite(nextHourlyRate as number) ? nextHourlyRate : null,
        available_hours: Number.isFinite(nextAvailableHours as number)
          ? nextAvailableHours
          : null,
        availability_percentage: Number.isFinite(nextAvailabilityPercentage as number)
          ? nextAvailabilityPercentage
          : null,
      },
      tenantId: isSuperAdmin ? effectiveTenantId ?? undefined : undefined,
    });
  };

  return {
    employeeForm,
    setEmployeeForm,
    employeeEditForm,
    setEmployeeEditForm,
    editingEmployee,
    selectedYear,
    setSelectedYear,
    selectedDepartmentFilter,
    setSelectedDepartmentFilter,
    handleEmployeeChange,
    handleEmployeeEditChange,
    openEditEmployee,
    handleCloseEdit,
    handleCloseCreate,
    handleUpdateEmployee,
    handleDeleteEmployee,
    confirmDeleteEmployee,
    handleCreateEmployee,
    filteredEmployees,
    allocationsByEmployee,
    availableTenantUsers,
    assignedUserIds,
    departmentOptions,
    yearOptions,
    createAvailabilityLocked,
    editAvailabilityLocked,
    employees,
    isLoadingEmployees,
    isErrorEmployees,
    tenantUsers,
    isLoadingTenantUsers,
    headcount,
    isLoadingHeadcount,
    createEmployeeMutation,
    updateEmployeeMutation,
    deleteEmployeeMutation,
    isOpen,
    isCreateOpen,
    onCreateOpen,
    isDeleteOpen,
    onDeleteClose,
  };
};
