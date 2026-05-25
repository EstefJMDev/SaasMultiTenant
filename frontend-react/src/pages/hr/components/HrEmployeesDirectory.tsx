import React from "react";
import {
  Badge,
  Box,
  Button,
  FormControl,
  FormLabel,
  Heading,
  Input,
  Progress,
  Select,
  SimpleGrid,
  Text,
  VStack,
  HStack,
  Flex,
} from "@chakra-ui/react";
import { useTranslation } from "react-i18next";
import { GiWhip } from "react-icons/gi";

import type { Department, EmployeeProfile, Position } from "@api/hr";
import type { TenantUserSummary } from "@api/users";
import { DEPARTMENT_HEAD_TAG } from "@entities/hr";
import { Card, EmptyState } from "@shared/ui";
import { EmployeeStatCell } from "./EmployeeStatCell";

interface DepartmentOption {
  id: number;
  name: string;
}

interface HrEmployeesDirectoryProps {
  allocationsByEmployee: Map<number, number>;
  cardBg: string;
  departmentById: Map<number, Department>;
  positionById: Map<number, Position>;
  departmentOptions: DepartmentOption[];
  employeeSearch: string;
  employees: EmployeeProfile[];
  inlineHoursDraftByEmployee: Record<number, string>;
  inlineRateDraftByEmployee: Record<number, string>;
  isInlineHoursEditMode: boolean;
  onCreateOpen: () => void;
  onEditEmployee: (employee: EmployeeProfile) => void;
  panelBg: string;
  selectedDepartmentFilter: number | "all";
  selectedYear: number;
  setEmployeeSearch: (value: string) => void;
  setInlineHoursDraftByEmployee: React.Dispatch<
    React.SetStateAction<Record<number, string>>
  >;
  setInlineRateDraftByEmployee: React.Dispatch<
    React.SetStateAction<Record<number, string>>
  >;
  setSelectedDepartmentFilter: (value: number | "all") => void;
  setSelectedYear: (year: number) => void;
  subtleText: string;
  tenantUsers?: TenantUserSummary[];
  visibleEmployees: EmployeeProfile[];
  yearOptions: number[];
}

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

export const HrEmployeesDirectory: React.FC<HrEmployeesDirectoryProps> = ({
  allocationsByEmployee,
  cardBg,
  departmentById,
  positionById,
  departmentOptions,
  employeeSearch,
  employees,
  inlineHoursDraftByEmployee,
  inlineRateDraftByEmployee,
  isInlineHoursEditMode,
  onCreateOpen,
  onEditEmployee,
  panelBg,
  selectedDepartmentFilter,
  selectedYear,
  setEmployeeSearch,
  setInlineHoursDraftByEmployee,
  setInlineRateDraftByEmployee,
  setSelectedDepartmentFilter,
  setSelectedYear,
  subtleText,
  tenantUsers,
  visibleEmployees,
  yearOptions,
}) => {
  const { t } = useTranslation();

  return (
    <Box borderWidth="1px" borderRadius="xl" p={6} bg={panelBg}>
      <SimpleGrid
        columns={{ base: 1, lg: 4 }}
        spacing={4}
        alignItems="flex-start"
      >
        <Box
          gridColumn={{ base: "1 / -1", lg: "1 / span 1" }}
          borderWidth="1px"
          borderRadius="xl"
          p={4}
          bg={cardBg}
        >
          <Heading size="sm" mb={3}>
            {t("hr.departments.title")}
          </Heading>
          <VStack align="stretch" spacing={2}>
            <FormControl>
              <FormLabel fontSize="xs" mb={1}>
                Año
              </FormLabel>
              <Select
                size="sm"
                value={selectedYear}
                onChange={(event) => setSelectedYear(Number(event.target.value))}
              >
                {yearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </Select>
            </FormControl>

            <FormControl>
              <FormLabel fontSize="xs" mb={1}>
                Buscar empleado
              </FormLabel>
              <Input
                size="sm"
                placeholder="Nombre, correo o puesto"
                value={employeeSearch}
                onChange={(event) => setEmployeeSearch(event.target.value)}
              />
            </FormControl>

            <Button
              size="sm"
              variant={selectedDepartmentFilter === "all" ? "solid" : "ghost"}
              colorScheme="brand"
              justifyContent="space-between"
              onClick={() => setSelectedDepartmentFilter("all")}
            >
              <Text>Todos los departamentos</Text>
              <Badge>{employees.length}</Badge>
            </Button>

            {departmentOptions.map((department) => {
              const count = employees.filter(
                (employee) => employee.primary_department_id === department.id,
              ).length;

              return (
                <Button
                  key={department.id}
                  size="sm"
                  variant={
                    selectedDepartmentFilter === department.id ? "solid" : "ghost"
                  }
                  justifyContent="space-between"
                  onClick={() => setSelectedDepartmentFilter(department.id)}
                >
                  <Text>{department.name}</Text>
                  <Badge>{count}</Badge>
                </Button>
              );
            })}
          </VStack>
        </Box>

        <VStack
          gridColumn={{ base: "1 / -1", lg: "2 / span 3" }}
          align="stretch"
          spacing={3}
        >
          {visibleEmployees.length === 0 ? (
            <Card p={4}>
              <EmptyState
                title={t("hr.employees.table.empty")}
                description={t(
                  "hr.employees.emptyDescription",
                  "Añade tu primer empleado para comenzar.",
                )}
                actionLabel={t("hr.employees.form.create")}
                onAction={onCreateOpen}
              />
            </Card>
          ) : (
            visibleEmployees.map((employee) => {
              const fullName =
                composeEmployeeName(
                  employee.first_name,
                  employee.last_name,
                  employee.full_name,
                ) ||
                tenantUsers?.find((user) => user.id === employee.user_id)?.full_name ||
                tenantUsers?.find((user) => user.id === employee.user_id)?.email ||
                t("hr.employees.table.noName");

              const departmentName = employee.primary_department_id
                ? (departmentById.get(employee.primary_department_id)?.name ?? "-")
                : "-";

              const positionName = employee.position_id
                ? (positionById.get(employee.position_id)?.name ?? "-")
                : "-";

              const distributionLabel =
                employee.department_allocations &&
                employee.department_allocations.length > 0
                  ? employee.department_allocations
                      .map((allocation) => {
                        const name =
                          departmentById.get(allocation.department_id)?.name ??
                          `Dept ${allocation.department_id}`;
                        return `${name} ${Number(allocation.percentage ?? 0).toFixed(0)}%`;
                      })
                      .join(" · ")
                  : departmentName;

              const availabilityPct =
                employee.availability_percentage != null
                  ? Number(employee.availability_percentage)
                  : null;
              const availabilityHours =
                employee.available_hours != null
                  ? Number(employee.available_hours)
                  : null;
              const baseCapacityHours =
                availabilityHours != null ? Math.max(0, availabilityHours) : null;
              const usedHours = allocationsByEmployee.get(employee.id) ?? 0;
              const remainingHours =
                baseCapacityHours != null ? baseCapacityHours - usedHours : null;
              const remainingPct =
                baseCapacityHours && baseCapacityHours > 0
                  ? Math.max(0, ((remainingHours ?? 0) / baseCapacityHours) * 100)
                  : null;
              const utilizationPct =
                baseCapacityHours && baseCapacityHours > 0
                  ? (usedHours / baseCapacityHours) * 100
                  : null;
              const overAllocatedHours =
                remainingHours != null && remainingHours < 0
                  ? Math.abs(remainingHours)
                  : 0;

              return (
                <Box
                  key={employee.id}
                  borderWidth="1px"
                  borderRadius="xl"
                  p={5}
                  bg={cardBg}
                  boxShadow="sm"
                >
                  <Flex
                    justify="space-between"
                    align={{ base: "flex-start", md: "center" }}
                    gap={3}
                    wrap="wrap"
                    mb={3}
                  >
                    <Box>
                      <HStack spacing={2}>
                        <Heading size="sm">{fullName}</Heading>
                        {positionName.includes(DEPARTMENT_HEAD_TAG) && (
                          <GiWhip
                            title="Jefe de departamento"
                            color="#b7791f"
                          />
                        )}
                      </HStack>
                      <Text fontSize="sm" color={subtleText}>
                        {positionName} • {departmentName}
                      </Text>
                      <Text fontSize="xs" color={subtleText}>
                        {employee.email || "-"}
                      </Text>
                      <Text fontSize="xs" color={subtleText}>
                        Distribución: {distributionLabel}
                      </Text>
                    </Box>

                    <HStack spacing={3}>
                      <Badge colorScheme={employee.is_active ? "brand" : "red"}>
                        {employee.is_active
                          ? t("hr.status.active")
                          : t("hr.status.inactive")}
                      </Badge>
                      <Badge colorScheme="blue">
                        {employee.hourly_rate != null
                          ? `€${Number(employee.hourly_rate).toFixed(2)}/h`
                          : t("hr.employees.table.hourlyRate")}
                      </Badge>
                      {overAllocatedHours > 0 && (
                        <Badge colorScheme="red">
                          Sobre +{overAllocatedHours.toFixed(1)}h
                        </Badge>
                      )}
                      <Button size="sm" onClick={() => onEditEmployee(employee)}>
                        {t("hr.employees.table.edit")}
                      </Button>
                    </HStack>
                  </Flex>

                  <SimpleGrid columns={{ base: 1, md: 3, lg: 6 }} spacing={3}>
                    <EmployeeStatCell
                      label={t("hr.employees.table.department", "Departamento")}
                      value={departmentName}
                    />
                    <EmployeeStatCell
                      label={t("hr.employees.table.position", "Puesto")}
                      value={positionName}
                    />
                    <EmployeeStatCell
                      label={t("hr.employees.table.hourlyRate", "Coste/hora")}
                      value={
                        isInlineHoursEditMode ? (
                          <Input
                            size="sm"
                            type="number"
                            value={
                              inlineRateDraftByEmployee[employee.id] ??
                              (employee.hourly_rate != null
                                ? String(Number(employee.hourly_rate))
                                : "")
                            }
                            onChange={(event) =>
                              setInlineRateDraftByEmployee((previous) => ({
                                ...previous,
                                [employee.id]: event.target.value,
                              }))
                            }
                          />
                        ) : employee.hourly_rate != null ? (
                          `€${Number(employee.hourly_rate).toFixed(2)}`
                        ) : (
                          "-"
                        )
                      }
                    />
                    <EmployeeStatCell
                      label={t(
                        "hr.employees.table.availableHours",
                        "Horas disponibles",
                      )}
                      value={
                        isInlineHoursEditMode ? (
                          <Input
                            size="sm"
                            type="number"
                            value={
                              inlineHoursDraftByEmployee[employee.id] ??
                              (availabilityHours != null
                                ? String(Number(availabilityHours))
                                : "")
                            }
                            onChange={(event) =>
                              setInlineHoursDraftByEmployee((previous) => ({
                                ...previous,
                                [employee.id]: event.target.value,
                              }))
                            }
                          />
                        ) : remainingHours != null ? (
                          `${remainingHours.toFixed(2)}h`
                        ) : availabilityHours != null ? (
                          `${availabilityHours.toFixed(2)}h`
                        ) : (
                          "-"
                        )
                      }
                    />
                    <EmployeeStatCell
                      label={t(
                        "hr.employees.table.availabilityPercentage",
                        "Disponibilidad %",
                      )}
                      value={
                        availabilityPct != null
                          ? `${availabilityPct.toFixed(1)}%`
                          : "-"
                      }
                    />
                    <EmployeeStatCell
                      label={t("hr.employees.table.email", "Correo")}
                      value={employee.email || "-"}
                    />
                  </SimpleGrid>

                  {remainingPct != null && (
                    <Box mt={4}>
                      <Progress
                        value={Math.min(100, Math.max(0, utilizationPct ?? 0))}
                        size="sm"
                        borderRadius="full"
                        colorScheme={
                          overAllocatedHours > 0
                            ? "red"
                            : remainingPct >= 70
                              ? "brand"
                              : remainingPct >= 40
                                ? "yellow"
                                : remainingPct >= 15
                                  ? "orange"
                                  : "red"
                        }
                      />
                      <Text
                        mt={1}
                        fontSize="xs"
                        color={overAllocatedHours > 0 ? "red.600" : subtleText}
                      >
                        {overAllocatedHours > 0
                          ? `Exceso autorizado: +${overAllocatedHours.toFixed(1)}h`
                          : `Restantes: ${(remainingHours ?? 0).toFixed(1)}h`}
                      </Text>
                    </Box>
                  )}
                </Box>
              );
            })
          )}
        </VStack>
      </SimpleGrid>
    </Box>
  );
};
