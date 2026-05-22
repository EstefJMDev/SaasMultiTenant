
import React from "react";

import {
  Box,
  Button,
  Flex,
  FormControl,
  FormLabel,
  HStack,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Tbody,
  Td,
  Text,
  Thead,
  Th,
  Tr,
  VStack,
  Wrap,
  useColorModeValue,
} from "@chakra-ui/react";

import type { EmployeeAllocation, EmployeeProfile, Department } from "@entities/hr";
import { DEPARTMENT_COLOR_SCHEMES } from "@shared/utils/erp";
import { DepartmentLegend } from "./components/DepartmentLegend";
import { SummaryToolbar } from "./components/SummaryToolbar";

type SummaryMilestone = { label: string; hours: number };

type DepartmentUsage = {
  departmentId: number;
  departmentName: string;
  limitPercent: number;
  usedPercent: number;
  limitHours: number;
  usedHours: number;
  availableHours: number;
};

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

interface SummarySectionProps {
  summaryYear: number;
  subtleText: string;
  loadingSummaryYear: boolean;
  saveStatusLabel?: string;
  saveErrorMessage?: string;
  summarySearch: string;
  onSummarySearchChange: (value: string) => void;
  departmentFilter: "all" | number;
  onDepartmentFilterChange: (value: "all" | number) => void;
  hrDepartments: Department[];
  yearOptions: number[];
  onSummaryYearChange: (value: number) => void;
  onRefreshAllocations: () => void;
  summaryEditMode: boolean;
  onToggleSummaryEdit: () => void;
  departmentColorMap: Record<number, string>;
  projectColumns: Array<{ id: number; name: string }>;
  summaryMilestones: Record<number, SummaryMilestone[]>;
  onAddSummaryMilestone: (projectId: number) => void;
  onRemoveSummaryMilestone: (projectId: number, index: number) => void;
  projectJustify: Record<number, number>;
  onProjectJustifyChange: (projectId: number, value: number) => void;
  projectJustified: Record<number, number>;
  filteredSummaryEmployees: EmployeeProfile[];
  employeeAvailability: Record<number, number>;
  departmentMap: Record<number, string>;
  departmentAllocationPercentMap: Record<number, number>;
  employeeDepartmentPercentages: Record<number, DepartmentUsage[]>;
  allocationKey: (
    employeeId: number,
    projectId: number,
    year: number,
    milestoneLabel?: string,
  ) => string;
  allocationIndex: Map<string, EmployeeAllocation>;
  allocationDraftsState: Record<string, string>;
  onAllocationDraftChange: (key: string, value: string) => void;
  onAllocationBlur: (
    employee: EmployeeProfile,
    projectId: number,
    milestoneLabel: string,
    value: string,
  ) => void;
  isAddModalOpen: boolean;
  onCloseAddModal: () => void;
  hrTenantId: number | null;
  hrEmployees: EmployeeProfile[];
  selectedEmployeeIds: number[];
  employeesLoading: boolean;
  departmentsLoading: boolean;
  employeesError: boolean;
  departmentsError: boolean;
  employeesErrorMsg?: unknown;
  departmentsErrorMsg?: unknown;
  onRetryEmployeesDepartments: () => void;
  addDrawerDeptFilter: "all" | number;
  onAddDrawerDeptFilterChange: (value: "all" | number) => void;
  addDrawerSearch: string;
  onAddDrawerSearchChange: (value: string) => void;
  employeesAvailableToAdd: EmployeeProfile[];
  onAddEmployee: (employeeId: number) => void;
  pendingAllocationOverride: {
    employeeName: string;
    payload: { allocated_hours: number; year: number };
  } | null;
  onConfirmAllocationOverride: () => void | Promise<void>;
  onCancelAllocationOverride: () => void;
}

export const SummarySection: React.FC<SummarySectionProps> = ({
  summaryYear,
  subtleText,
  loadingSummaryYear,
  saveStatusLabel,
  saveErrorMessage,
  summarySearch,
  onSummarySearchChange,
  departmentFilter,
  onDepartmentFilterChange,
  hrDepartments,
  yearOptions,
  onSummaryYearChange,
  onRefreshAllocations,
  summaryEditMode,
  onToggleSummaryEdit,
  departmentColorMap,
  projectColumns,
  summaryMilestones,
  onAddSummaryMilestone,
  onRemoveSummaryMilestone,
  projectJustify,
  onProjectJustifyChange,
  projectJustified,
  filteredSummaryEmployees,
  employeeAvailability,
  departmentMap,
  allocationKey,
  allocationIndex,
  allocationDraftsState,
  onAllocationDraftChange,
  onAllocationBlur,
  isAddModalOpen,
  onCloseAddModal,
  hrTenantId,
  hrEmployees,
  selectedEmployeeIds,
  employeesLoading,
  departmentsLoading,
  employeesError,
  departmentsError,
  employeesErrorMsg,
  departmentsErrorMsg,
  onRetryEmployeesDepartments,
  addDrawerDeptFilter,
  onAddDrawerDeptFilterChange,
  addDrawerSearch,
  onAddDrawerSearchChange,
  employeesAvailableToAdd,
  onAddEmployee,
  pendingAllocationOverride,
  onConfirmAllocationOverride,
  onCancelAllocationOverride,
}) => {
  const cardBg = useColorModeValue("white", "gray.800");
  const borderColor = useColorModeValue("gray.200", "gray.700");
  const tableCanvasBg = useColorModeValue("gray.100", "gray.900");
  const stickyNameWidth = "46px";
  const stickySurnameWidth = "112px";
  const roleColumnWidth = "48px";
  const legendColumnWidth = "80px";
  const projectColumnMinW = "72px";
  const projectCellMinW = "72px";
  const resolvedProjectColumns = projectColumns;
  const totalJustifiedVisible = React.useMemo(
    () =>
      resolvedProjectColumns.reduce(
        (sum, project) => sum + (projectJustified[project.id] ?? 0),
        0,
      ),
    [projectJustified, resolvedProjectColumns],
  );
  return (
    <Box
      minH="100vh"
      bg="linear-gradient(135deg, #f0f4f8 0%, #d9e8f5 100%)"
      p={{ base: 2, md: 3 }}
    >
      <Stack spacing={2} maxW="100%" mx="auto">
        <Box
          p={3}
          bg={cardBg}
          borderRadius="xl"
          borderWidth="1px"
          borderColor={borderColor}
          boxShadow="sm"
          w="100%"
        >
          <Stack spacing={2}>
            <Flex
              align={{ base: "stretch", lg: "center" }}
              justify="space-between"
              gap={3}
              flexWrap="wrap"
            >
              <SummaryToolbar
                summarySearch={summarySearch}
                onSummarySearchChange={onSummarySearchChange}
                departmentFilter={departmentFilter}
                onDepartmentFilterChange={onDepartmentFilterChange}
                hrDepartments={hrDepartments}
                summaryYear={summaryYear}
                yearOptions={yearOptions}
                onSummaryYearChange={onSummaryYearChange}
                onRefreshAllocations={onRefreshAllocations}
                summaryEditMode={summaryEditMode}
                onToggleSummaryEdit={onToggleSummaryEdit}
              />
              <VStack
                align={{ base: "stretch", lg: "flex-end" }}
                spacing={0.5}
                ml={{ base: 0, lg: "auto" }}
              >
                <Text fontSize="xs" color={subtleText}>
                  {loadingSummaryYear ? "Cargando resumen..." : saveStatusLabel || saveErrorMessage || "Resumen anual"}
                </Text>
                <Text fontSize="2xs" color={subtleText}>
                  Ano activo: {summaryYear}
                </Text>
              </VStack>
            </Flex>
            <DepartmentLegend
              hrDepartments={hrDepartments}
              departmentColorMap={departmentColorMap}
              borderColor={borderColor}
            />
          </Stack>
        </Box>

        <Box
          w="100%"
          maxW="100%"
          bg="transparent"
        >
      <Box
        w="100%"
        overflowX="auto"
        overflowY="auto"
        maxH="72vh"
        bg={tableCanvasBg}
        display="flex"
        justifyContent="center"
        sx={{
          "--sticky-name-width": stickyNameWidth,
          "--sticky-surname-width": stickySurnameWidth,
          "--role-column-width": roleColumnWidth,
          "--legend-column-width": legendColumnWidth,
          "--summary-header-row-1": "96px",
          "--summary-header-row-2": "36px",
          "--summary-header-row-3": "36px",
          "--summary-header-row-4": "36px",
          "--summary-header-row-5": "36px",
          "--summary-header-row-6": "40px",
          "& table th, & table td": {
            px: 1,
            py: 1,
            fontSize: "xs",
            whiteSpace: "nowrap",
          },
          "& thead th": {
            position: "sticky",
            backgroundClip: "padding-box",
            boxShadow: "0 1px 0 0 rgba(0,0,0,0.06)",
          },
          "& thead tr:nth-of-type(1) th": {
            top: "0",
            zIndex: 8,
            minH: "var(--summary-header-row-1)",
            h: "var(--summary-header-row-1)",
          },
          "& thead tr:nth-of-type(2) th": {
            top: "var(--summary-header-row-1)",
            zIndex: 7,
            minH: "var(--summary-header-row-2)",
            h: "var(--summary-header-row-2)",
          },
          "& thead tr:nth-of-type(3) th": {
            top: "calc(var(--summary-header-row-1) + var(--summary-header-row-2))",
            zIndex: 7,
            minH: "var(--summary-header-row-3)",
            h: "var(--summary-header-row-3)",
          },
          "& thead tr:nth-of-type(4) th": {
            top: "calc(var(--summary-header-row-1) + var(--summary-header-row-2) + var(--summary-header-row-3))",
            zIndex: 7,
            minH: "var(--summary-header-row-4)",
            h: "var(--summary-header-row-4)",
          },
          "& thead tr:nth-of-type(5) th": {
            top: "calc(var(--summary-header-row-1) + var(--summary-header-row-2) + var(--summary-header-row-3) + var(--summary-header-row-4))",
            zIndex: 7,
            minH: "var(--summary-header-row-5)",
            h: "var(--summary-header-row-5)",
          },
          "& thead tr:nth-of-type(6) th": {
            top: "calc(var(--summary-header-row-1) + var(--summary-header-row-2) + var(--summary-header-row-3) + var(--summary-header-row-4) + var(--summary-header-row-5))",
            zIndex: 7,
            minH: "var(--summary-header-row-6)",
            h: "var(--summary-header-row-6)",
          },
          "& thead tr:nth-of-type(2), & thead tr:nth-of-type(3), & thead tr:nth-of-type(4), & thead tr:nth-of-type(5), & thead tr:nth-of-type(6)": {
            boxShadow: "inset 0 -1px 0 0 rgba(226,232,240,0.95)",
          },
          "& thead tr:nth-of-type(2) th:last-of-type, & thead tr:nth-of-type(3) th:last-of-type, & thead tr:nth-of-type(4) th:last-of-type, & thead tr:nth-of-type(5) th:last-of-type, & thead tr:nth-of-type(6) th:last-of-type": {
            boxShadow: "inset 0 -1px 0 0 rgba(226,232,240,0.95)",
          },
          scrollbarWidth: "thin",
          "&::-webkit-scrollbar": {
            width: "12px",
            height: "12px",
          },
          "&::-webkit-scrollbar-track": {
            background: "gray.100",
          },
          "&::-webkit-scrollbar-thumb": {
            background: "gray.400",
            borderRadius: "999px",
          },
          "& .sticky-col-name": {
            position: "sticky",
            left: "0",
            zIndex: 3,
            bg: cardBg,
            width: "var(--sticky-name-width)",
            minW: "var(--sticky-name-width)",
            maxW: "var(--sticky-name-width)",
            boxShadow: "1px 0 0 0",
            boxShadowColor: borderColor,
          },
          "& .sticky-col-surname": {
            position: "sticky",
            left: "var(--sticky-name-width)",
            zIndex: 3,
            bg: cardBg,
            width: "var(--sticky-surname-width)",
            minW: "var(--sticky-surname-width)",
            maxW: "var(--sticky-surname-width)",
            boxShadow: "1px 0 0 0",
            boxShadowColor: borderColor,
          },
          "& .sticky-col-role": {
            position: "sticky",
            left: "calc(var(--sticky-name-width) + var(--sticky-surname-width))",
            zIndex: 3,
            bg: cardBg,
            width: "var(--role-column-width)",
            minW: "var(--role-column-width)",
            maxW: "var(--role-column-width)",
            boxShadow: "1px 0 0 0",
            boxShadowColor: borderColor,
          },
          "& .sticky-col-legend": {
            position: "sticky",
            left: "calc(var(--sticky-name-width) + var(--sticky-surname-width) + var(--role-column-width))",
            zIndex: 3,
            bg: cardBg,
            width: "var(--legend-column-width)",
            minW: "var(--legend-column-width)",
            maxW: "var(--legend-column-width)",
            boxShadow: "1px 0 0 0",
            boxShadowColor: borderColor,
          },
          "& thead .sticky-col-name, & thead .sticky-col-surname, & thead .sticky-col-role, & thead .sticky-col-legend": {
            zIndex: 7,
            bg: "blue.900",
            color: "white",
          },
        }}
      >
        <Box minW="1160px" w="max-content" flexShrink={0}>
        <Table
          size="xs"
          variant="simple"
          w="max-content"
          minW="1160px"
        >
          <Thead>
            <Tr bg="blue.800">
              <Th
                className="sticky-col-name"
                w={stickyNameWidth}
                minW={stickyNameWidth}
                maxW={stickyNameWidth}
                textAlign="left"
                pl={2}
                color="white"
                bg="blue.900"
                verticalAlign="middle"
              >
                Nombre
              </Th>
              <Th
                className="sticky-col-surname"
                w={stickySurnameWidth}
                minW={stickySurnameWidth}
                maxW={stickySurnameWidth}
                textAlign="left"
                pl={2}
                color="white"
                bg="blue.900"
                verticalAlign="middle"
              >
                Apellidos
              </Th>
              <Th className="sticky-col-role" w={roleColumnWidth} minW={roleColumnWidth} maxW={roleColumnWidth} textAlign="left" pl={2} color="white" bg="blue.900" verticalAlign="middle">
                    Titulación
              </Th>
              <Th
                className="sticky-col-legend"
                w={legendColumnWidth}
                minW={legendColumnWidth}
                maxW={legendColumnWidth}
                textAlign="left"
                pl={2}
                color="white"
                bg="blue.900"
                borderRightWidth="2px"
                borderRightColor="whiteAlpha.500"
                verticalAlign="middle"
              >
                Leyenda
              </Th>
              {resolvedProjectColumns.map((p) => {
                const count = (summaryMilestones[p.id] ?? []).length || 1;
                const words = p.name.trim().split(/\s+/).filter(Boolean);
                const splitIndex = words.length > 1 ? Math.ceil(words.length / 2) : 1;
                const firstLine = words.slice(0, splitIndex).join(" ");
                const secondLine = words.slice(splitIndex).join(" ");
                return (
                  <Th
                    key={p.id}
                    colSpan={count}
                    textAlign="center"
                    w={projectColumnMinW}
                    minW={projectColumnMinW}
                    px={1}
                    py={1}
                    borderLeftWidth="2px"
                    borderLeftColor="whiteAlpha.400"
                    color="white"
                    bg="blue.800"
                  >
                    <VStack spacing={1} justify="center" minH="92px">
                      <Box h="72px" display="flex" alignItems="center" justifyContent="center" overflow="visible">
                        <Text
                          as="span"
                          display="inline-block"
                          fontSize="2xs"
                          fontWeight="semibold"
                          lineHeight="1"
                          textAlign="center"
                          whiteSpace="nowrap"
                          transform="rotate(-90deg)"
                          transformOrigin="center"
                          title={p.name}
                        >
                          <Box as="span" display="block" whiteSpace="nowrap">
                            {firstLine}
                          </Box>
                          {secondLine ? (
                            <Box as="span" display="block" whiteSpace="nowrap">
                              {secondLine}
                            </Box>
                          ) : null}
                        </Text>
                      </Box>
                    </VStack>
                  </Th>
                );
              })}
              <Th
                textAlign="center"
                bg="brand.600"
                color="white"
                w="78px"
                minW="56px"
                maxW="78px"
                px={0.5}
                py={1}
              >
                <Text
                  fontSize="2xs"
                  lineHeight="1"
                  whiteSpace="nowrap"
                  mx="auto"
                  title="Total horas justificadas"
                  style={{ writingMode: "vertical-lr" }}
                >
                  TOTAL H
                </Text>
              </Th>
              <Th
                textAlign="center"
                bg="red.600"
                color="white"
                w="88px"
                minW="88px"
                maxW="88px"
                px={0.5}
              >
                <Text fontSize="xs" whiteSpace="nowrap" title={`Horas disponibles para ${summaryYear}`}>
                  DISP. {summaryYear}
                </Text>
              </Th>
            </Tr>

            <Tr bg="blue.50" borderBottomWidth="1px">
              <Th bg="blue.100" colSpan={1} textAlign="left" color="blue.800">
                Horas a justificar
              </Th>
              <Th bg="blue.100" colSpan={3} />
              {resolvedProjectColumns.map((p) => {
                const count = (summaryMilestones[p.id] ?? []).length || 1;
                return (
                  <Th
                    key={p.id}
                    textAlign="center"
                    w={projectColumnMinW}
                    minW={projectColumnMinW}
                    px={1}
                    borderColor="blue.200"
                    colSpan={count}
                  >
                    <Input
                      size="xs"
                      type="number"
                      value={projectJustify[p.id] ?? 0}
                      onChange={(e) =>
                        onProjectJustifyChange(
                          p.id,
                          Number(e.target.value || 0),
                        )
                      }
                      textAlign="center"
                      maxW="64px"
                      px={1}
                      py={1}
                    />
                  </Th>
                );
              })}
              <Th
                textAlign="center"
                bg="blue.100"
                color="blue.800"
                fontSize="xs"
                minW="56px"
                px={0.5}
              >
                {totalJustifiedVisible} h
              </Th>
              <Th />
            </Tr>

            <Tr bg="brand.50" borderBottomWidth="1px">
              <Th bg="brand.100" colSpan={1} textAlign="left" color="brand.800">
                Justificadas
              </Th>
              <Th bg="brand.100" colSpan={3} />
              {resolvedProjectColumns.map((p) => {
                const count = (summaryMilestones[p.id] ?? []).length || 1;
                return (
                  <Th
                    key={p.id}
                    textAlign="center"
                    w={projectColumnMinW}
                    minW={projectColumnMinW}
                    px={1}
                    borderColor="brand.200"
                    colSpan={count}
                  >
                    <Input
                      size="xs"
                      type="number"
                      value={projectJustified[p.id] ?? 0}
                      isReadOnly
                      focusBorderColor="brand.400"
                      textAlign="center"
                      maxW="64px"
                      px={1}
                      py={1}
                    />
                  </Th>
                );
              })}
              <Th
                textAlign="center"
                bg="brand.600"
                color="white"
                fontSize="xs"
                fontWeight="bold"
                minW="56px"
                px={0.5}
              >
                <Text lineHeight="1" whiteSpace="nowrap" title="Justificadas totales">
                  JUSTIF.
                </Text>
              </Th>
              <Th />
            </Tr>

            <Tr bg="orange.50" borderBottomWidth="1px">
              <Th bg="orange.100" colSpan={1} textAlign="left" color="orange.800">
                Faltan
              </Th>
              <Th bg="orange.100" colSpan={3} />
              {resolvedProjectColumns.map((p) => {
                const count = (summaryMilestones[p.id] ?? []).length || 1;
                const falt =
                  (projectJustify[p.id] ?? 0) - (projectJustified[p.id] ?? 0);
                return (
                  <Th
                    key={p.id}
                    textAlign="center"
                    w={projectColumnMinW}
                    minW={projectColumnMinW}
                    px={1}
                    color={falt > 0 ? "orange.600" : "brand.600"}
                    colSpan={count}
                  >
                    {falt} h
                  </Th>
                );
              })}
              <Th textAlign="center" bg="orange.100" />
              <Th />
            </Tr>

            <Tr bg="blue.100" borderBottomWidth="2px" borderColor="blue.200">
              <Th bg="blue.200" colSpan={1} textAlign="left" color="blue.800">
                % Ejecutado en {summaryYear}
              </Th>
              <Th bg="blue.200" colSpan={3} />
              {resolvedProjectColumns.map((p) => {
                const count = (summaryMilestones[p.id] ?? []).length || 1;
                const justify = projectJustify[p.id] ?? 0;
                const just = projectJustified[p.id] ?? 0;
                const pct = justify > 0 ? Math.round((just / justify) * 100) : 0;
                return (
                  <Th
                    key={p.id}
                    textAlign="center"
                    w={projectColumnMinW}
                    minW={projectColumnMinW}
                    px={1}
                    color="blue.800"
                    colSpan={count}
                  >
                    {pct}%
                  </Th>
                );
              })}
              <Th colSpan={2} />
            </Tr>

            <Tr bg="teal.50" borderBottomWidth="2px" borderColor="teal.200">
              <Th bg="teal.100" colSpan={1} textAlign="left" color="teal.800">
                Hitos (H1/H2/H3/H4)
              </Th>
              <Th bg="teal.100" colSpan={3} />
              {resolvedProjectColumns.map((p) => {
                const ms = summaryMilestones[p.id] ?? [];
                if (ms.length === 0) {
                  return (
                      <Th
                        key={`${p.id}-ms-empty`}
                        textAlign="center"
                        w={projectColumnMinW}
                        minW={projectColumnMinW}
                        px={1}
                        py={1}
                        color="teal.800"
                      >
                        <Button
                          size="xs"
                          bg="teal.700"
                          color="white"
                          _hover={{ bg: "teal.800" }}
                          borderRadius="full"
                          onClick={() => onAddSummaryMilestone(p.id)}
                          aria-label={`Anadir hito a ${p.name}`}
                          minW="20px"
                          h="20px"
                          p={0}
                        >
                          +
                        </Button>
                      </Th>
                  );
                }

                return ms.map((item, idx) => (
                      <Th
                        key={`${p.id}-ms-${idx}`}
                        textAlign="center"
                        w={projectColumnMinW}
                        minW={projectColumnMinW}
                        px={1}
                        py={1.5}
                      >
                        <HStack justify="center" spacing={1}>
                          <Text fontSize="xs" fontWeight="semibold" color="teal.800">
                            {item.label || `H${idx + 1}`}
                          </Text>
                      <Button
                        size="xs"
                        variant="ghost"
                        colorScheme="red"
                        p={0}
                        minW="18px"
                        h="18px"
                        onClick={() => onRemoveSummaryMilestone(p.id, idx)}
                      >
                        <Text fontSize="xs">x</Text>
                      </Button>
                    </HStack>
                  </Th>
                ));
              })}
              <Th colSpan={2} />
            </Tr>
          </Thead>

          <Tbody>
            {filteredSummaryEmployees.length === 0 ? (
              <Tr>
                <Td
                  colSpan={resolvedProjectColumns.length + 9}
                  textAlign="center"
                  color={subtleText}
                  py={6}
                >
                  No hay empleados registrados en RRHH.
                </Td>
              </Tr>
            ) : (
              filteredSummaryEmployees.map((emp) => {
                const available = employeeAvailability[emp.id] ?? 0;
                const deptId = emp.primary_department_id ?? -1;
                const firstName = emp.first_name?.trim() || emp.full_name?.trim() || "Sin nombre";
                const lastName = emp.last_name?.trim() || "-";
                const displayName = composeEmployeeName(
                  emp.first_name,
                  emp.last_name,
                  emp.full_name,
                ) || "Sin nombre";

                let totalEmpAllocated = 0;

                return (
                  <Tr key={emp.id}>
                    <Td
                      className="sticky-col-name"
                      fontWeight="semibold"
                      maxW={stickyNameWidth}
                      overflow="hidden"
                      textOverflow="ellipsis"
                    >
                      {firstName}
                    </Td>
                    <Td
                      className="sticky-col-surname"
                      minW={stickySurnameWidth}
                      maxW={stickySurnameWidth}
                      overflow="hidden"
                      textOverflow="ellipsis"
                    >
                      {lastName}
                    </Td>
                    <Td className="sticky-col-role" minW={roleColumnWidth} maxW={roleColumnWidth} overflow="hidden" textOverflow="ellipsis">
                      {emp.position || "-"}
                    </Td>
                    <Td className="sticky-col-legend" minW={legendColumnWidth} maxW={legendColumnWidth} px={1} textAlign="center">
                      <Flex align="center" justify="center">
                        <Box
                          w="12px"
                          h="12px"
                          borderRadius="full"
                          title={
                            departmentMap[emp.primary_department_id ?? -1] ??
                            "Sin departamento"
                          }
                          bg={
                            departmentColorMap[
                              emp.primary_department_id ?? -1
                            ] ?? "gray.300"
                          }
                        />
                      </Flex>
                    </Td>

                    {resolvedProjectColumns.map((p) => {
                      const count = (summaryMilestones[p.id] ?? []).length || 1;
                      const cells: JSX.Element[] = [];

                      for (let mIdx = 0; mIdx < count; mIdx += 1) {
                        const hasMilestones = (summaryMilestones[p.id] ?? []).length > 0;
                        const milestoneLabel =
                          summaryMilestones[p.id]?.[mIdx]?.label ??
                          `H${mIdx + 1}`;
                        const milestoneKey = hasMilestones
                          ? milestoneLabel
                          : "general";

                        const cellKey = allocationKey(
                          emp.id,
                          p.id,
                          summaryYear,
                          milestoneKey,
                        );
                        const cellExisting = allocationIndex.get(cellKey);
                        const cellValue =
                          allocationDraftsState[cellKey] ??
                          cellExisting?.allocated_hours?.toString() ??
                          "";
                        const cellNumeric = Number(
                          cellValue || cellExisting?.allocated_hours || 0,
                        );
                        totalEmpAllocated += Number.isFinite(cellNumeric)
                          ? cellNumeric
                          : 0;

                        cells.push(
                          <Td
                            key={`${emp.id}-${p.id}-${mIdx}`}
                            textAlign="center"
                            w={projectCellMinW}
                            minW={projectCellMinW}
                            px={1}
                          >
                            {summaryEditMode ? (
                              <Input
                                size="xs"
                                type="number"
                                min={0}
                                value={cellValue}
                                maxW="64px"
                                onChange={(e) =>
                                  onAllocationDraftChange(
                                    cellKey,
                                    e.target.value,
                                  )
                                }
                                onBlur={(e) =>
                                onAllocationBlur(
                                  emp,
                                  p.id,
                                  milestoneKey,
                                  e.target.value,
                                )
                              }
                                textAlign="center"
                              />
                            ) : (
                              <Text>{cellExisting?.allocated_hours ?? 0} h</Text>
                            )}
                          </Td>,
                        );
                      }

                      return cells;
                    })}

                    <Td
                      textAlign="center"
                      minW="56px"
                      px={0.5}
                      fontSize="sm"
                      fontWeight="bold"
                      color="white"
                      bg="brand.700"
                      whiteSpace="nowrap"
                    >
                      {totalEmpAllocated} h
                    </Td>
                    <Td
                      textAlign="center"
                      w="88px"
                      minW="88px"
                      maxW="88px"
                      px={0.5}
                      bg="white"
                    >
                      {(() => {
                        const remaining = available - totalEmpAllocated;
                        const safeRemaining = Math.max(0, remaining);
                        const percentRemaining =
                          available > 0
                            ? Math.max(
                                0,
                                Math.min(100, (safeRemaining / available) * 100),
                              )
                            : 0;
                        const colorScheme =
                          available === 0
                            ? "gray"
                            : percentRemaining >= 70
                              ? "brand"
                              : percentRemaining >= 40
                                ? "yellow"
                                : percentRemaining >= 15
                                  ? "orange"
                                  : "red";

                        return (
                          <Stack spacing={1} align="center">
                            <Box w="64px" h="5px" bg="gray.200" borderRadius="full">
                              <Box
                                h="5px"
                                borderRadius="full"
                                bg={`${colorScheme}.400`}
                                width={`${percentRemaining}%`}
                              />
                            </Box>
                            <Text
                              fontSize="2xs"
                              color={remaining < 0 ? "red.600" : "brand.700"}
                              fontWeight="semibold"
                              whiteSpace="nowrap"
                              maxW="86px"
                              overflow="hidden"
                              textOverflow="ellipsis"
                            >
                              {remaining} h ({Math.round(percentRemaining)}%)
                            </Text>
                          </Stack>
                        );
                      })()}
                    </Td>
                  </Tr>
                );
              })
            )}
          </Tbody>
        </Table>
        </Box>
      </Box>
        </Box>
    <Modal isOpen={isAddModalOpen} onClose={onCloseAddModal} size="md">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Agregar empleados</ModalHeader>
        <ModalBody>
          <Stack spacing={3}>
            <Box
              p={2}
              bg="gray.100"
              borderRadius="md"
              fontSize="xs"
              display="none"
            >
              <Text>Tenant ID: {hrTenantId ?? "undefined"}</Text>
              <Text>Empleados cargados: {hrEmployees.length}</Text>
              <Text>Departamentos cargados: {hrDepartments.length}</Text>
              <Text>Empleados seleccionados: {selectedEmployeeIds.length}</Text>
              <Text>Cargando empleados: {employeesLoading ? "si" : "no"}</Text>
              <Text>
                Cargando depts: {departmentsLoading ? "si" : "no"}
              </Text>
            </Box>

            {(employeesLoading || departmentsLoading) && (
              <Box
                p={3}
                bg="blue.50"
                borderRadius="md"
                borderWidth="1px"
                borderColor="blue.200"
              >
                <Text fontSize="xs" color="blue.800">
                  ? Cargando empleados y departamentos...
                </Text>
              </Box>
            )}

            {(employeesError || departmentsError) && (
              <Box
                p={3}
                bg="red.50"
                borderRadius="md"
                borderWidth="1px"
                borderColor="red.200"
              >
                <Text fontSize="xs" color="red.800" fontWeight="bold">
                  ?? Error al cargar datos
                </Text>
                {employeesError && (
                  <Text fontSize="xs" color="red.700" mt={1}>
                    Error cargando empleados:{" "}
                    {employeesErrorMsg?.toString() || "Desconocido"}
                  </Text>
                )}
                {departmentsError && (
                  <Text fontSize="xs" color="red.700" mt={1}>
                    Error cargando departamentos:{" "}
                    {departmentsErrorMsg?.toString() || "Desconocido"}
                  </Text>
                )}
                <Button
                  size="xs"
                  mt={2}
                  colorScheme="red"
                  onClick={onRetryEmployeesDepartments}
                >
                  Reintentar
                </Button>
              </Box>
            )}

            {!employeesError &&
              !departmentsError &&
              hrDepartments.length === 0 &&
              hrEmployees.length === 0 && (
                <Box
                  p={3}
                  bg="orange.50"
                  borderRadius="md"
                  borderWidth="1px"
                  borderColor="orange.200"
                >
                  <Text fontSize="xs" color="orange.800">
                    ?? Cargando datos de departamentos y empleados...
                  </Text>
                  <Button
                    size="xs"
                    mt={2}
                    colorScheme="orange"
                    onClick={onRetryEmployeesDepartments}
                  >
                    Recargar datos
                  </Button>
                </Box>
              )}

            {hrDepartments.length > 0 && (
              <Box
                p={3}
                bg="gray.50"
                borderRadius="md"
                borderWidth="1px"
                borderColor="gray.200"
              >
                <Text fontSize="xs" fontWeight="bold" mb={2}>
                  ?? Leyenda de departamentos:
                </Text>
                <Wrap spacing={2}>
                  {hrDepartments.map((dept, idx) => (
                    <Box
                      key={dept.id}
                      display="flex"
                      alignItems="center"
                      gap={1}
                    >
                      <Box
                        width="12px"
                        height="12px"
                        borderRadius="full"
                        bg={`${DEPARTMENT_COLOR_SCHEMES[idx % DEPARTMENT_COLOR_SCHEMES.length]}.500`}
                      />
                      <Text fontSize="xs">{dept.name}</Text>
                    </Box>
                  ))}
                </Wrap>
              </Box>
            )}

            <FormControl>
              <FormLabel fontSize="xs" mb={1}>
                Departamento
              </FormLabel>
              <Select
                size="sm"
                value={addDrawerDeptFilter}
                onChange={(e) => {
                  const value = e.target.value;
                  onAddDrawerDeptFilterChange(
                    value === "all" ? "all" : Number(value),
                  );
                }}
              >
                <option value="all">Todos los departamentos</option>
                {hrDepartments.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                  </option>
                ))}
              </Select>
            </FormControl>

            <FormControl>
              <FormLabel fontSize="xs" mb={1}>
                Buscar
              </FormLabel>
              <Input
                size="sm"
                placeholder="Nombre"
                value={addDrawerSearch}
                onChange={(e) => onAddDrawerSearchChange(e.target.value)}
              />
            </FormControl>

            <VStack align="stretch" spacing={2}>
              {employeesAvailableToAdd.length === 0 ? (
                <Text fontSize="xs" color="gray.500">
                  No hay empleados disponibles para agregar.
                </Text>
              ) : (
                employeesAvailableToAdd.map((emp) => {
                  const deptId = emp.primary_department_id ?? -1;
                  const deptIndex = hrDepartments.findIndex(
                    (d) => d.id === deptId,
                  );
                  const displayName =
                    composeEmployeeName(
                      emp.first_name,
                      emp.last_name,
                      emp.full_name,
                    ) || "Sin nombre";
                  const colorScheme =
                    DEPARTMENT_COLOR_SCHEMES[deptIndex >= 0 ? deptIndex : 0];
                  const deptName = departmentMap[deptId] ?? "Sin departamento";

                  return (
                    <Flex
                      key={emp.id}
                      align="center"
                      justify="space-between"
                      px={3}
                      py={2}
                      borderWidth="1px"
                      borderRadius="md"
                      borderColor={`${colorScheme}.200`}
                      bg={`${colorScheme}.50`}
                      _hover={{ bg: `${colorScheme}.100` }}
                    >
                      <Box flex={1}>
                        <Text
                          fontSize="sm"
                          fontWeight="semibold"
                          color="gray.800"
                        >
                          {displayName}
                        </Text>
                        <Flex align="center" gap={1} mt={1}>
                          <Box
                            width="10px"
                            height="10px"
                            borderRadius="full"
                            bg={`${colorScheme}.500`}
                          />
                          <Text
                            fontSize="xs"
                            color={`${colorScheme}.700`}
                            fontWeight="500"
                          >
                            {deptName}
                          </Text>
                        </Flex>
                      </Box>
                      <Button
                        size="xs"
                        colorScheme={colorScheme}
                        ml={2}
                        onClick={() => onAddEmployee(emp.id)}
                      >
                        Agregar
                      </Button>
                    </Flex>
                  );
                })
              )}
            </VStack>
          </Stack>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" onClick={onCloseAddModal}>
            Cerrar
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
    <Modal
      isOpen={pendingAllocationOverride != null}
      onClose={onCancelAllocationOverride}
      isCentered
      size="md"
    >
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Autorizacion de exceso</ModalHeader>
        <ModalBody>
          <Text>
            Esta asignacion supera el limite justificable de{" "}
            <Text as="span" fontWeight="bold">
              {pendingAllocationOverride?.employeeName ?? "empleado"}
            </Text>
            .
          </Text>
          <Text mt={2} color="gray.600">
            Horas solicitadas:{" "}
            {pendingAllocationOverride?.payload.allocated_hours ?? 0}h
            {" • "}Año: {pendingAllocationOverride?.payload.year ?? "-"}
          </Text>
          <Text mt={3} fontSize="sm" color="gray.600">
            Si confirmas, se guardara con autorizacion de sobreasignacion.
          </Text>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" mr={3} onClick={onCancelAllocationOverride}>
            Cancelar
          </Button>
          <Button colorScheme="red" onClick={() => void onConfirmAllocationOverride()}>
            Autorizar y guardar
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
      </Stack>
    </Box>
  );
};




