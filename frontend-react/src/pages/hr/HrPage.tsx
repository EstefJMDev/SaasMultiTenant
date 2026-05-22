import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Divider,
  HStack,
  Heading,
  SimpleGrid,
  Text,
  useColorModeValue,
  useToast,
} from "@chakra-ui/react";
import { keyframes } from "@emotion/react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AppShell } from "@widgets/app-shell/AppShell";
import { useCurrentUser } from "@hooks/useCurrentUser";
import { useEffectiveTenantId } from "@hooks/useEffectiveTenantId";
import {
  createDefaultDepartmentForm,
  useHrDepartmentsManager,
  useHrEmployeesManager,
} from "@entities/hr";
import {
  fetchDirectoresTecnicos,
  fetchPositions,
  upsertEmployeeYearAvailability,
} from "@api/hr";
import type { DirectorTecnicoOption, Position } from "@api/hr";
import { DataTable } from "@widgets/data-table";
import { EmptyState, ErrorBanner, PageHeader } from "@shared/ui";
import { ColumnDef } from "@tanstack/react-table";
import type { Department } from "@entities/hr";
import { DepartmentRowActions } from "./components/DepartmentRowActions";
import { HrDeleteDepartmentDialog } from "./components/HrDeleteDepartmentDialog";
import { HrDeleteEmployeeDialog } from "./components/HrDeleteEmployeeDialog";
import { HrDepartmentModal } from "./components/HrDepartmentModal";
import { HrEmployeesDirectory } from "./components/HrEmployeesDirectory";
import { HrEmployeeCreateModal } from "./components/HrEmployeeCreateModal";
import { HrEmployeeEditModal } from "./components/HrEmployeeEditModal";
import { HrPageHero } from "./components/HrPageHero";

// Pequeño helper visual para las tarjetas de empleado.
const TITULACION_OPTIONS = [
  { value: "doctorado", label: "Doctorado" },
  { value: "universitario", label: "Universitario" },
  { value: "no_universitario", label: "No universitario" },
];

const normalizeSearchText = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

const composeEmployeeName = (
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

const getSortableLastName = (fullName: string): string => {
  const trimmed = fullName.trim();
  if (!trimmed) return "";
  if (trimmed.includes(",")) {
    return normalizeSearchText(trimmed.split(",")[0] ?? trimmed);
  }
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 3) {
    return normalizeSearchText(parts.slice(-2).join(" "));
  }
  if (parts.length === 2) {
    return normalizeSearchText(parts[1]);
  }
  return normalizeSearchText(parts[0] ?? trimmed);
};

// Pantalla de recursos humanos: departamentos y empleados.
interface HrPageProps {
  section?: "all" | "departments" | "employees";
}

export const HrPage: React.FC<HrPageProps> = ({ section = "all" }) => {
  const { t } = useTranslation();
  const deleteCancelRef = useRef<HTMLButtonElement>(null);
  const deleteDeptCancelRef = useRef<HTMLButtonElement>(null);
  const queryClient = useQueryClient();
  const toast = useToast();

  const cardBg = useColorModeValue("white", "gray.700");
  const panelBg = useColorModeValue("gray.50", "gray.800");
  const subtleText = useColorModeValue("gray.500", "gray.300");
  const fadeUp = keyframes`
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  `;

  const { data: currentUser } = useCurrentUser();
  const { tenantId: effectiveTenantId, isSuperAdmin } = useEffectiveTenantId();
  const isTenantAdmin =
    !isSuperAdmin && currentUser?.role_name === "tenant_admin";

  const {
    deptForm,
    editingDepartment,
    deletingDepartment,
    setDeptForm,
    setEditingDepartment,
    setDeletingDepartment,
    handleDeptChange,
    handleDeptMenuVisibilityChange,
    handleDeptCapabilityChange,
    handleSubmitDepartment,
    startEditDepartment,
    handleDeleteDepartment,
    confirmDeleteDepartment,
    handleCloseDeptModal,
    departmentById,
    departments,
    isLoadingDepartments,
    isErrorDepartments,
    createDeptMutation,
    updateDeptMutation,
    deleteDeptMutation,
    isDeptOpen,
    onDeptOpen,
    isDeleteDeptOpen,
    onDeleteDeptClose,
  } = useHrDepartmentsManager({ effectiveTenantId, isSuperAdmin });

  // Fallback para evitar undefined
  const safeDepartments: Department[] = useMemo(
    () => departments ?? [],
    [departments],
  );

  // Cargar puestos (Position) por tenant para los selectores de empleado.
  const { data: positionsData } = useQuery({
    queryKey: ["org-positions", effectiveTenantId],
    queryFn: () => fetchPositions(effectiveTenantId),
    enabled: effectiveTenantId != null || isSuperAdmin,
  });
  const safePositions: Position[] = useMemo(
    () => positionsData ?? [],
    [positionsData],
  );

  const positionById = useMemo(
    () => new Map(safePositions.map((p) => [p.id, p])),
    [safePositions],
  );

  const { data: directoresTecnicosData } = useQuery({
    queryKey: ["hr-directores-tecnicos", effectiveTenantId],
    queryFn: () => fetchDirectoresTecnicos(effectiveTenantId),
    enabled: effectiveTenantId != null || isSuperAdmin,
  });
  const safeDirectoresTecnicos: DirectorTecnicoOption[] = useMemo(
    () => directoresTecnicosData ?? [],
    [directoresTecnicosData],
  );

  const {
    employeeForm,
    employeeEditForm,
    setEmployeeEditForm,
    createAvailabilityLocked,
    editAvailabilityLocked,
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
    departmentOptions,
    yearOptions,
    employees,
    isLoadingEmployees,
    isErrorEmployees,
    tenantUsers,
    isLoadingTenantUsers,
    headcount,
    createEmployeeMutation,
    updateEmployeeMutation,
    deleteEmployeeMutation,
    isOpen,
    isCreateOpen,
    onCreateOpen,
    isDeleteOpen,
    onDeleteClose,
  } = useHrEmployeesManager({
    effectiveTenantId,
    isSuperAdmin,
    departments: safeDepartments, // nunca undefined
    departmentById,
  });

  const [employeeSearch, setEmployeeSearch] = useState("");
  const [isInlineHoursEditMode, setIsInlineHoursEditMode] = useState(false);
  const [inlineHoursDraftByEmployee, setInlineHoursDraftByEmployee] = useState<
    Record<number, string>
  >({});
  const [inlineRateDraftByEmployee, setInlineRateDraftByEmployee] = useState<
    Record<number, string>
  >({});


  const inlineHoursChanged = useMemo(() => {
    return filteredEmployees.some((employee) => {
      const hoursDraft = inlineHoursDraftByEmployee[employee.id];
      const rateDraft = inlineRateDraftByEmployee[employee.id];
      const currentHoursValue =
        employee.available_hours != null ? String(Number(employee.available_hours)) : "";
      const currentRateValue =
        employee.hourly_rate != null ? String(Number(employee.hourly_rate)) : "";
      return (
        (hoursDraft ?? "").trim() !== currentHoursValue.trim() ||
        (rateDraft ?? "").trim() !== currentRateValue.trim()
      );
    });
  }, [filteredEmployees, inlineHoursDraftByEmployee, inlineRateDraftByEmployee]);

  const visibleEmployees = useMemo(() => {
    const normalizedSearch = normalizeSearchText(employeeSearch);
    const withMeta = filteredEmployees.map((employee) => {
      const fullName =
        composeEmployeeName(employee.first_name, employee.last_name, employee.full_name) ||
        tenantUsers?.find((user) => user.id === employee.user_id)?.full_name ||
        tenantUsers?.find((user) => user.id === employee.user_id)?.email ||
        t("hr.employees.table.noName");
      const departmentName = employee.primary_department_id
        ? (departmentById.get(employee.primary_department_id)?.name ?? "-")
        : "-";
      return {
        employee,
        fullName,
        departmentName,
      };
    });

    const filtered = normalizedSearch
      ? withMeta.filter(({ employee, fullName, departmentName }) => {
          const haystack = normalizeSearchText(
            [
              fullName,
              employee.email ?? "",
              employee.position ?? "",
              departmentName,
            ].join(" "),
          );
          return haystack.includes(normalizedSearch);
        })
      : withMeta;

    filtered.sort((a, b) => {
      const deptA = normalizeSearchText(a.departmentName);
      const deptB = normalizeSearchText(b.departmentName);
      if (deptA !== deptB) return deptA.localeCompare(deptB, "es");

      const lastNameA = getSortableLastName(a.fullName);
      const lastNameB = getSortableLastName(b.fullName);
      if (lastNameA !== lastNameB) return lastNameA.localeCompare(lastNameB, "es");

      return normalizeSearchText(a.fullName).localeCompare(
        normalizeSearchText(b.fullName),
        "es",
      );
    });

    return filtered.map((item) => item.employee);
  }, [departmentById, employeeSearch, filteredEmployees, t, tenantUsers]);

  const inlineHoursSaveMutation = useMutation({
    mutationFn: async () => {
      const changedEmployees = filteredEmployees.filter((employee) => {
        const hoursDraft = inlineHoursDraftByEmployee[employee.id];
        const rateDraft = inlineRateDraftByEmployee[employee.id];
        const currentHoursValue =
          employee.available_hours != null ? String(Number(employee.available_hours)) : "";
        const currentRateValue =
          employee.hourly_rate != null ? String(Number(employee.hourly_rate)) : "";
        return (
          (hoursDraft ?? "").trim() !== currentHoursValue.trim() ||
          (rateDraft ?? "").trim() !== currentRateValue.trim()
        );
      });

      await Promise.all(
        changedEmployees.map((employee) => {
          const draftValue = inlineHoursDraftByEmployee[employee.id] ?? "";
          const draftRateValue = inlineRateDraftByEmployee[employee.id] ?? "";
          const trimmed = draftValue.trim();
          const trimmedRate = draftRateValue.trim();
          const nextAvailableHours = trimmed === "" ? null : Number(trimmed);
          const nextHourlyRate = trimmedRate === "" ? null : Number(trimmedRate);

          return upsertEmployeeYearAvailability(
            employee.id,
            selectedYear,
            {
              year: selectedYear,
              available_hours: Number.isFinite(nextAvailableHours as number)
                ? nextAvailableHours
                : null,
              availability_percentage:
                employee.availability_percentage != null
                  ? Number(employee.availability_percentage)
                  : null,
              hourly_rate: Number.isFinite(nextHourlyRate as number)
                ? nextHourlyRate
                : null,
            },
            isSuperAdmin ? effectiveTenantId ?? undefined : undefined,
          );
        }),
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["hr-employees", effectiveTenantId, selectedYear],
      });
      setIsInlineHoursEditMode(false);
      setInlineHoursDraftByEmployee({});
      setInlineRateDraftByEmployee({});
      toast({
        title: "Horas actualizadas",
        status: "success",
        duration: 3000,
        isClosable: true,
      });
    },
    onError: () => {
      toast({
        title: "No se pudieron guardar las horas",
        status: "error",
        duration: 4000,
        isClosable: true,
      });
    },
  });

  const handleStartInlineHoursEdit = () => {
    const initialDrafts: Record<number, string> = {};
    const initialRateDrafts: Record<number, string> = {};
    filteredEmployees.forEach((employee) => {
      initialDrafts[employee.id] =
        employee.available_hours != null ? String(Number(employee.available_hours)) : "";
      initialRateDrafts[employee.id] =
        employee.hourly_rate != null ? String(Number(employee.hourly_rate)) : "";
    });
    setInlineHoursDraftByEmployee(initialDrafts);
    setInlineRateDraftByEmployee(initialRateDrafts);
    setIsInlineHoursEditMode(true);
  };

  const handleCancelInlineHoursEdit = () => {
    setIsInlineHoursEditMode(false);
    setInlineHoursDraftByEmployee({});
    setInlineRateDraftByEmployee({});
  };

  useEffect(() => {
    if (!isInlineHoursEditMode) return;
    setIsInlineHoursEditMode(false);
    setInlineHoursDraftByEmployee({});
    setInlineRateDraftByEmployee({});
  }, [selectedYear]);

  const departmentColumns = useMemo<ColumnDef<Department>[]>(
    () => [
      { header: t("hr.departments.table.name"), accessorKey: "name" },
      {
        header: t("hr.departments.table.description"),
        accessorKey: "description",
        cell: ({ row }) => row.original.description || "-",
      },
      {
        header: t("hr.departments.table.allocation"),
        id: "allocation",
        cell: ({ row }) =>
          row.original.project_allocation_percentage != null
            ? `${Number(row.original.project_allocation_percentage).toFixed(0)}%`
            : "100%",
      },
      {
        header: t("hr.departments.table.status"),
        id: "status",
        cell: ({ row }) => (
          <Badge colorScheme={row.original.is_active ? "brand" : "red"}>
            {row.original.is_active
              ? t("hr.status.active")
              : t("hr.status.inactive")}
          </Badge>
        ),
      },
      {
        header: t("hr.departments.table.actions"),
        id: "actions",
        cell: ({ row }) => (
          <DepartmentRowActions
            onEdit={() => startEditDepartment(row.original)}
            onDeactivate={() => handleDeleteDepartment(row.original)}
            isLoading={deleteDeptMutation.isPending}
          />
        ),
      },
    ],
    [
      deleteDeptMutation.isPending,
      handleDeleteDepartment,
      startEditDepartment,
      t,
    ],
  );

  const showDepartments = section === "all" || section === "departments";
  const showEmployees = section === "all" || section === "employees";
  const employeesHeading = t("hr.employees.title");

  return (
    <AppShell>
      {!effectiveTenantId && isSuperAdmin && (
        <Text color="gray.400" mb={6}>
          {t("hr.emptyTenant")}
        </Text>
      )}

      {effectiveTenantId && (
        <>
          <SimpleGrid columns={{ base: 1, xl: 3 }} spacing={6} mb={8}>
            {showDepartments && (
              <Box
                id="departments"
                gridColumn={{
                  base: "1 / -1",
                  xl: showEmployees ? "1 / span 2" : "1 / -1",
                }}
                borderWidth="1px"
                borderRadius="xl"
                p={6}
                bg={panelBg}
              >
                <PageHeader
                  title={t("hr.departments.title")}
                  actions={
                    <Button
                      size="sm"
                      colorScheme="brand"
                      onClick={() => {
                        setEditingDepartment(null);
                        setDeptForm(createDefaultDepartmentForm());
                        onDeptOpen();
                      }}
                    >
                      {t("hr.departments.form.create")}
                    </Button>
                  }
                />

                {isErrorDepartments && (
                  <ErrorBanner
                    title={t("hr.departments.error")}
                    onRetry={() =>
                      queryClient.invalidateQueries({
                        queryKey: [
                          "hr-departments",
                          effectiveTenantId ?? "all",
                        ],
                      })
                    }
                  />
                )}

                <Box mt={4}>
                  <DataTable
                    data={safeDepartments}
                    columns={departmentColumns}
                    isLoading={isLoadingDepartments}
                    emptyText={t("hr.departments.table.empty")}
                    emptyState={
                      <EmptyState
                        title={t("hr.departments.table.empty")}
                        description={t(
                          "hr.departments.emptyDescription",
                          "Crea tu primer departamento para comenzar.",
                        )}
                        actionLabel={t("hr.departments.form.create")}
                        onAction={() => {
                          setEditingDepartment(null);
                          setDeptForm(createDefaultDepartmentForm());
                          onDeptOpen();
                        }}
                      />
                    }
                  />
                </Box>
              </Box>
            )}

            {showEmployees && (
              <Box
                id="employees"
                gridColumn={{
                  base: "1 / -1",
                  xl: showDepartments ? "2 / span 2" : "1 / -1",
                }}
                borderWidth="1px"
                borderRadius="xl"
                p={4}
                bg={panelBg}
              >
                <HStack justify="space-between" mb={2} flexWrap="wrap">
                  <Heading as="h2" size="sm">
                    {employeesHeading}
                  </Heading>
                  <HStack spacing={2}>
                    {isInlineHoursEditMode ? (
                      <>
                        <Button
                          colorScheme="brand"
                          size="xs"
                          onClick={() => inlineHoursSaveMutation.mutate()}
                          isLoading={inlineHoursSaveMutation.isPending}
                          isDisabled={!inlineHoursChanged}
                        >
                          Guardar cambios
                        </Button>
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={handleCancelInlineHoursEdit}
                          isDisabled={inlineHoursSaveMutation.isPending}
                        >
                          Cancelar
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={handleStartInlineHoursEdit}
                      >
                        Editar horas
                      </Button>
                    )}
                    <Button colorScheme="brand" size="xs" onClick={onCreateOpen}>
                      {t("hr.employees.form.create")}
                    </Button>
                  </HStack>
                </HStack>

                <Divider my={1} />
                <Heading as="h3" size="xs" mb={2}>
                  {t("hr.employees.table.employee")}
                </Heading>

                {isLoadingEmployees && <Text>{t("hr.employees.loading")}</Text>}
                {isErrorEmployees && (
                  <ErrorBanner
                    title={t("hr.employees.error")}
                    onRetry={() =>
                      queryClient.invalidateQueries({
                        queryKey: ["hr-employees", effectiveTenantId ?? "all"],
                      })
                    }
                  />
                )}
              </Box>
            )}
          </SimpleGrid>

          {/* Listado de empleados con filtro de departamentos */}
          {showEmployees && !isLoadingEmployees && employees && (
            <HrEmployeesDirectory
              allocationsByEmployee={allocationsByEmployee}
              cardBg={cardBg}
              departmentById={departmentById}
              positionById={positionById}
              departmentOptions={departmentOptions}
              employeeSearch={employeeSearch}
              employees={employees}
              inlineHoursDraftByEmployee={inlineHoursDraftByEmployee}
              inlineRateDraftByEmployee={inlineRateDraftByEmployee}
              isInlineHoursEditMode={isInlineHoursEditMode}
              onCreateOpen={onCreateOpen}
              onEditEmployee={openEditEmployee}
              panelBg={panelBg}
              selectedDepartmentFilter={selectedDepartmentFilter}
              selectedYear={selectedYear}
              setEmployeeSearch={setEmployeeSearch}
              setInlineHoursDraftByEmployee={setInlineHoursDraftByEmployee}
              setInlineRateDraftByEmployee={setInlineRateDraftByEmployee}
              setSelectedDepartmentFilter={setSelectedDepartmentFilter}
              setSelectedYear={setSelectedYear}
              subtleText={subtleText}
              tenantUsers={tenantUsers}
              visibleEmployees={visibleEmployees}
              yearOptions={yearOptions}
            />
          )}
        </>
      )}

      <HrDepartmentModal
        isOpen={isDeptOpen}
        editingDepartment={editingDepartment}
        deptForm={deptForm}
        isSubmitting={createDeptMutation.isPending || updateDeptMutation.isPending}
        isSuperAdmin={isSuperAdmin}
        isTenantAdmin={isTenantAdmin}
        onClose={handleCloseDeptModal}
        onSubmit={handleSubmitDepartment}
        onDeptChange={handleDeptChange}
        onDeptMenuVisibilityChange={handleDeptMenuVisibilityChange}
        onDeptCapabilityChange={handleDeptCapabilityChange}
      />

      <HrEmployeeEditModal
        isOpen={isOpen}
        employeeEditForm={employeeEditForm}
        safeDepartments={safeDepartments}
        safePositions={safePositions}
        directoresTecnicos={safeDirectoresTecnicos}
        titulacionOptions={TITULACION_OPTIONS}
        editAvailabilityLocked={editAvailabilityLocked}
        isDeleting={deleteEmployeeMutation.isPending}
        isSaving={updateEmployeeMutation.isPending}
        onClose={handleCloseEdit}
        onDelete={handleDeleteEmployee}
        onSave={handleUpdateEmployee}
        onChange={handleEmployeeEditChange}
        setEmployeeEditForm={setEmployeeEditForm}
      />

      <HrEmployeeCreateModal
        isOpen={isCreateOpen}
        employeeForm={employeeForm}
        safeDepartments={safeDepartments}
        safePositions={safePositions}
        titulacionOptions={TITULACION_OPTIONS}
        tenantUsers={tenantUsers}
        availableTenantUsers={availableTenantUsers}
        isLoadingTenantUsers={isLoadingTenantUsers}
        createAvailabilityLocked={createAvailabilityLocked}
        isSubmitting={createEmployeeMutation.isPending}
        isSuperAdmin={isSuperAdmin}
        effectiveTenantId={effectiveTenantId}
        onClose={handleCloseCreate}
        onSubmit={handleCreateEmployee}
        onChange={handleEmployeeChange}
      />

      <HrDeleteDepartmentDialog
        isOpen={isDeleteDeptOpen}
        deletingDepartment={deletingDepartment}
        cancelRef={deleteDeptCancelRef}
        isDeleting={deleteDeptMutation.isPending}
        onClose={() => {
          setDeletingDepartment(null);
          onDeleteDeptClose();
        }}
        onConfirm={confirmDeleteDepartment}
      />

      <HrDeleteEmployeeDialog
        isOpen={isDeleteOpen}
        cancelRef={deleteCancelRef}
        isDeleting={deleteEmployeeMutation.isPending}
        onClose={onDeleteClose}
        onConfirm={confirmDeleteEmployee}
      />
    </AppShell>
  );
};

export default HrPage;


