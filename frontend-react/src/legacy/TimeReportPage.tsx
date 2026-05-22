import React, { useMemo, useState } from "react";
import {
  Box,
  Badge,
  Button,
  Checkbox,
  FormControl,
  FormLabel,
  Heading,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Select,
  SimpleGrid,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  useColorModeValue,
  useToast,
  Stack,
  HStack,
} from "@chakra-ui/react";
import { keyframes } from "@emotion/react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";

import {
  ErpProject,
  fetchErpProjects,
  fetchTimeReport,
  fetchTimeReportByDepartment,
  TimeReportDepartmentRow,
  TimeReportRow,
} from "@api/erpReports";
import { useHrEmployees, type EmployeeProfile } from "@entities/hr";
import { AppShell } from "@widgets/app-shell/AppShell";
import { PageHero } from "@widgets/app-shell/PageHero";
import { useCurrentUser } from "@hooks/useCurrentUser";

export const TimeReportPage: React.FC = () => {
  const toast = useToast();
  const { t } = useTranslation();
  const cardBg = useColorModeValue("white", "gray.700");
  const tableHeadBg = useColorModeValue("gray.50", "gray.800");
  const panelBg = useColorModeValue("gray.50", "gray.800");
  const accent = useColorModeValue("brand.500", "brand.300");
  const subtleText = useColorModeValue("gray.500", "gray.300");
  const fadeUp = keyframes`
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  `;

  const [projects, setProjects] = useState<ErpProject[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);

  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [rows, setRows] = useState<TimeReportRow[]>([]);
  const [rowsByDepartment, setRowsByDepartment] = useState<TimeReportDepartmentRow[]>([]);
  const [resultsSearch, setResultsSearch] = useState("");
  const [isLoadingReport, setIsLoadingReport] = useState(false);
  const [reportMode, setReportMode] = useState<"task" | "department">("task");
  const [employeeModalOpen, setEmployeeModalOpen] = useState(false);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<number[]>([]);
  const [employeeSearch, setEmployeeSearch] = useState("");

  const { data: currentUser } = useCurrentUser();
  const tenantId = currentUser?.is_super_admin === true
    ? undefined
    : currentUser?.tenant_id ?? undefined;

  const employeesQuery = useHrEmployees(tenantId, true);
  const employees = employeesQuery.data ?? [];
  const isLoadingEmployees = employeesQuery.isLoading;

  const loadProjectsIfNeeded = async () => {
    if (projects.length > 0 || isLoadingProjects) return;
    try {
      setIsLoadingProjects(true);
      const data = await fetchErpProjects(tenantId);
      setProjects(data);
    } catch (error: any) {
      toast({
        title: t("timeReport.messages.loadProjectsTitle"),
        description:
          error?.response?.data?.detail ??
          t("timeReport.messages.loadProjectsFallback"),
        status: "error",
      });
    } finally {
      setIsLoadingProjects(false);
    }
  };

  const handleGenerateReport = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsLoadingReport(true);
      const filters = {
        projectId: selectedProjectId,
        dateFrom: dateFrom || null,
        dateTo: dateTo || null,
        userIds: selectedEmployeeIds.length > 0 ? selectedEmployeeIds : null,
      };
      if (reportMode === "department") {
        const data = await fetchTimeReportByDepartment(filters, tenantId);
        setRowsByDepartment(data);
        setRows([]);
      } else {
        const data = await fetchTimeReport(filters, tenantId);
        setRows(data);
        setRowsByDepartment([]);
      }
    } catch (error: any) {
      toast({
        title: t("timeReport.messages.reportErrorTitle"),
        description:
          error?.response?.data?.detail ??
          t("timeReport.messages.reportErrorFallback"),
        status: "error",
      });
    } finally {
      setIsLoadingReport(false);
    }
  };

  const normalizedFilter = resultsSearch.trim().toLowerCase();
  const employeeIdSet = useMemo(
    () => new Set(selectedEmployeeIds),
    [selectedEmployeeIds]
  );

  const filteredRows = rows.filter((row) => {
    if (selectedEmployeeIds.length > 0) {
      if (!row.user_id || !employeeIdSet.has(row.user_id)) return false;
    }
    if (!normalizedFilter) return true;
    const haystack = `${row.project_name ?? ""} ${row.task_title ?? ""} ${row.username ?? ""}`.toLowerCase();
    return haystack.includes(normalizedFilter);
  });

  const filteredDepartmentRows = rowsByDepartment.filter((row) => {
    if (selectedEmployeeIds.length > 0) {
      if (!row.user_id || !employeeIdSet.has(row.user_id)) return false;
    }
    if (!normalizedFilter) return true;
    const haystack = `${row.department_name ?? ""} ${row.username ?? ""}`.toLowerCase();
    return haystack.includes(normalizedFilter);
  });

  const totalHours = (reportMode === "department" ? filteredDepartmentRows : filteredRows).reduce(
    (acc, row) => acc + Number(row.total_hours),
    0,
  );
  const totalCost =
    reportMode === "department"
      ? 0
      : filteredRows.reduce((acc, row) => {
          const rate = Number(row.hourly_rate ?? 0);
          const hours = Number(row.total_hours ?? 0);
          return acc + rate * hours;
        }, 0);
  const reportCount = reportMode === "department" ? filteredDepartmentRows.length : filteredRows.length;

  const handleExportCsv = () => {
    const activeRows = reportMode === "department" ? filteredDepartmentRows : filteredRows;
    if (activeRows.length === 0) {
      toast({
        title: t("timeReport.messages.exportEmptyTitle"),
        description: t("timeReport.messages.exportEmptyDesc"),
        status: "info",
      });
      return;
    }

    const lines =
      reportMode === "department"
        ? [
            ["Departamento", t("timeReport.table.user"), t("timeReport.table.hours")].join(";"),
            ...filteredDepartmentRows.map((row) =>
              [
                row.department_name ?? "",
                row.username ?? "",
                Number(row.total_hours).toFixed(2),
              ].join(";"),
            ),
          ]
        : [
            [
              t("timeReport.table.project"),
              t("timeReport.table.task"),
              t("timeReport.table.user"),
              t("timeReport.table.rate"),
              t("timeReport.table.hours"),
            ].join(";"),
            ...filteredRows.map((row) =>
              [
                row.project_name,
                row.task_title,
                row.username ?? "",
                row.hourly_rate ? Number(row.hourly_rate).toFixed(2) : "",
                Number(row.total_hours).toFixed(2),
              ].join(";"),
            ),
          ];

    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = t("timeReport.export.fileName");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <AppShell>
      <Box animation={`${fadeUp} 0.6s ease-out`} mb={8}>
        <PageHero
          eyebrow={t("timeReport.header.eyebrow")}
          title={t("timeReport.header.title")}
          subtitle={t("timeReport.header.subtitle")}
        />
      </Box>

      <Box
        as="form"
        onSubmit={handleGenerateReport}
        borderWidth="1px"
        borderRadius="xl"
        bg={panelBg}
        p={6}
        mb={8}
        w="100%"
      >
        <Heading as="h3" size="sm" mb={4}>
          {t("timeReport.filters.title")}
        </Heading>
        <HStack spacing={2} mb={2}>
          <Button
            size="sm"
            variant={reportMode === "task" ? "solid" : "outline"}
            colorScheme="green"
            onClick={() => setReportMode("task")}
            type="button"
          >
            Por tarea
          </Button>
          <Button
            size="sm"
            variant={reportMode === "department" ? "solid" : "outline"}
            colorScheme="green"
            onClick={() => setReportMode("department")}
            type="button"
          >
            Por departamento
          </Button>
        </HStack>
        <Stack spacing={4}>
          <SimpleGrid columns={{ base: 1, md: 2, lg: 4 }} spacing={4}>
            <FormControl>
              <FormLabel>{t("timeReport.filters.project")}</FormLabel>
              <Select
                placeholder={
                  isLoadingProjects
                    ? t("timeReport.filters.loadingProjects")
                    : t("timeReport.filters.allProjects")
                }
                value={selectedProjectId ?? ""}
                onFocus={loadProjectsIfNeeded}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedProjectId(val ? Number(val) : null);
                }}
                isDisabled={isLoadingProjects}
              >
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </Select>
            </FormControl>
            <FormControl>
              <FormLabel>{t("timeReport.filters.from")}</FormLabel>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </FormControl>
            <FormControl>
              <FormLabel>{t("timeReport.filters.to")}</FormLabel>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </FormControl>
            <FormControl>
              <FormLabel>{t("timeReport.filters.userContains")}</FormLabel>
              <HStack spacing={2} align="center">
                <Button
                  variant="outline"
                  colorScheme="green"
                  onClick={() => setEmployeeModalOpen(true)}
                  size="sm"
                  minW={{ base: "100%", md: "200px" }}
                  isLoading={isLoadingEmployees}
                >
                  Seleccionar empleados
                  {selectedEmployeeIds.length > 0 && (
                    <Badge ml={2} colorScheme="green">
                      {selectedEmployeeIds.length}
                    </Badge>
                  )}
                </Button>
                {selectedEmployeeIds.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedEmployeeIds([])}
                  >
                    Quitar selección
                  </Button>
                )}
              </HStack>
              {selectedEmployeeIds.length > 0 && (
                <Stack direction="row" spacing={2} mt={2} flexWrap="wrap">
                  {selectedEmployeeIds.map((id) => {
                    const emp = employees.find((e) => (e.user_id ?? e.id) === id);
                    const label = emp?.full_name || emp?.email || `#${id}`;
                    return (
                      <Badge
                        key={id}
                        colorScheme="green"
                        borderRadius="full"
                        px={2}
                        py={1}
                        cursor="pointer"
                        onClick={() =>
                          setSelectedEmployeeIds((prev) => prev.filter((x) => x !== id))
                        }
                      >
                        {label} ✕
                      </Badge>
                    );
                  })}
                </Stack>
              )}
            </FormControl>
          </SimpleGrid>
          <Box display="flex" justifyContent="flex-end" gap={2}>
            <Button
              type="submit"
              colorScheme="green"
              isLoading={isLoadingReport}
            >{t("timeReport.filters.submit")}</Button>
            <Button
              variant="outline"
              onClick={handleExportCsv}
              isDisabled={(reportMode === "department" ? filteredDepartmentRows : filteredRows).length === 0}
            >{t("timeReport.filters.export")}</Button>
          </Box>
        </Stack>
      </Box>

      <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4} mb={6}>
        <Box borderWidth="1px" borderRadius="xl" p={4} bg={cardBg}>
          <Text fontSize="xs" textTransform="uppercase" color={subtleText}>{t("timeReport.stats.totalHours")}</Text>
          <Heading size="md">{totalHours.toFixed(2)} h</Heading>
        </Box>
        <Box borderWidth="1px" borderRadius="xl" p={4} bg={cardBg}>
          <Text fontSize="xs" textTransform="uppercase" color={subtleText}>{t("timeReport.stats.entries")}</Text>
          <Heading size="md">{reportCount}</Heading>
        </Box>
        <Box borderWidth="1px" borderRadius="xl" p={4} bg={cardBg}>
          <Text fontSize="xs" textTransform="uppercase" color={subtleText}>Coste estimado</Text>
          <Heading size="md">{reportMode === "department" ? "-" : `${totalCost.toFixed(2)} €`}</Heading>
        </Box>
      </SimpleGrid>

      <Box mb={3}>
        <FormControl maxW={{ base: "100%", md: "320px" }}>
          <FormLabel fontSize="sm" color={subtleText}>Buscar en resultados</FormLabel>
          <Input
            size="sm"
            placeholder="Proyecto, tarea o usuario"
            value={resultsSearch}
            onChange={(e) => setResultsSearch(e.target.value)}
          />
        </FormControl>
      </Box>

      <Box
          borderWidth="1px"
          borderRadius="xl"
          bg={cardBg}
          overflowX="auto"
        overflowY="hidden"
        borderColor={accent}
        >
          <Table size="sm" minW="760px">
          <Thead bg={tableHeadBg} position="sticky" top={0} zIndex={1}>
            <Tr>
              {reportMode === "department" ? (
                <Th>Departamento</Th>
              ) : (
                <Th>{t("timeReport.filters.project")}</Th>
              )}
              {reportMode === "department" ? null : <Th>{t("timeReport.table.task")}</Th>}
              <Th>{t("timeReport.table.user")}</Th>
              {reportMode === "department" ? null : <Th isNumeric>{t("timeReport.table.rate")}</Th>}
              <Th isNumeric>{t("timeReport.table.hours")}</Th>
              {reportMode === "department" ? null : <Th isNumeric>Coste</Th>}
            </Tr>
          </Thead>
          <Tbody>
            {(reportMode === "department" ? filteredDepartmentRows.length : filteredRows.length) === 0 ? (
              <Tr>
                <Td colSpan={reportMode === "department" ? 3 : 6}>
                  <Text fontSize="sm" color="gray.500">                    {t("timeReport.table.empty")}
                  </Text>
                </Td>
              </Tr>
              ) : (
                reportMode === "department"
                  ? filteredDepartmentRows.map((row) => (
                      <Tr key={`${row.department_id}-${row.user_id ?? "na"}`}>
                        <Td>{row.department_name ?? `#${row.department_id}`}</Td>
                        <Td>{row.username ?? t("timeReport.table.unassignedUser")}</Td>
                        <Td isNumeric>{Number(row.total_hours).toFixed(2)}</Td>
                      </Tr>
                    ))
                  : filteredRows.map((row) => (
                      <Tr key={`${row.project_id}-${row.task_id}-${row.user_id ?? "na"}`}>
                        <Td>{row.project_name}</Td>
                        <Td>{row.task_title}</Td>
                        <Td>{row.username ?? t("timeReport.table.unassignedUser")}</Td>
                        <Td isNumeric>{Number(row.hourly_rate ?? 0).toFixed(2)}</Td>
                        <Td isNumeric>{Number(row.total_hours).toFixed(2)}</Td>
                        <Td isNumeric>
                          {(Number(row.hourly_rate ?? 0) * Number(row.total_hours ?? 0)).toFixed(2)}
                        </Td>
                      </Tr>
                    ))
              )}
          </Tbody>
        </Table>
      </Box>

      <Modal isOpen={employeeModalOpen} onClose={() => setEmployeeModalOpen(false)} size="lg">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Seleccionar empleados</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Stack spacing={3}>
              <Input
                placeholder="Buscar por nombre o email"
                value={employeeSearch}
                onChange={(e) => setEmployeeSearch(e.target.value)}
              />
              <Box maxH="320px" overflowY="auto" borderWidth="1px" borderRadius="md" p={3}>
                <Stack spacing={2}>
                  {isLoadingEmployees && (
                    <Text fontSize="sm" color={subtleText}>
                      Cargando empleados...
                    </Text>
                  )}
                  {employees
                    .filter((emp) => {
                      const term = employeeSearch.trim().toLowerCase();
                      if (!term) return true;
                      const haystack = `${emp.full_name ?? ""} ${emp.email ?? ""}`.toLowerCase();
                      return haystack.includes(term);
                    })
                    .map((emp) => {
                      const id = emp.user_id ?? emp.id;
                      const label = emp.full_name || emp.email || `Empleado ${id}`;
                      return (
                        <Checkbox
                          key={`${id}-${emp.email}`}
                          isChecked={selectedEmployeeIds.includes(id)}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setSelectedEmployeeIds((prev) =>
                              checked ? Array.from(new Set([...prev, id])) : prev.filter((x) => x !== id)
                            );
                          }}
                        >
                          {label}
                        </Checkbox>
                      );
                    })}
                  {employees.length === 0 && (
                    <Text fontSize="sm" color={subtleText}>
                      No hay empleados disponibles.
                    </Text>
                  )}
                </Stack>
              </Box>
            </Stack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={() => setEmployeeModalOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button colorScheme="green" onClick={() => setEmployeeModalOpen(false)}>
              {t("common.save")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
      <Modal isOpen={employeeModalOpen} onClose={() => setEmployeeModalOpen(false)} size="lg">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Seleccionar empleados</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Stack spacing={3}>
              <Input
                placeholder="Buscar por nombre o email"
                value={employeeSearch}
                onChange={(e) => setEmployeeSearch(e.target.value)}
              />
              <Box maxH="320px" overflowY="auto" borderWidth="1px" borderRadius="md" p={3}>
                <Stack spacing={2}>
                  {employees
                    .filter((emp) => {
                      const term = employeeSearch.trim().toLowerCase();
                      if (!term) return true;
                      const haystack = `${emp.full_name ?? ""} ${emp.email ?? ""}`.toLowerCase();
                      return haystack.includes(term);
                    })
                    .map((emp) => {
                      const id = emp.user_id ?? emp.id;
                      const label = emp.full_name || emp.email || `Empleado ${id}`;
                      return (
                        <Checkbox
                          key={`${id}-${emp.email ?? ""}`}
                          isChecked={selectedEmployeeIds.includes(id)}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setSelectedEmployeeIds((prev) =>
                              checked ? Array.from(new Set([...prev, id])) : prev.filter((x) => x !== id)
                            );
                          }}
                        >
                          {label}
                        </Checkbox>
                      );
                    })}
                  {employees.length === 0 && (
                    <Text fontSize="sm" color={subtleText}>
                      No hay empleados disponibles.
                    </Text>
                  )}
                </Stack>
              </Box>
            </Stack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={() => setEmployeeModalOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button colorScheme="green" onClick={() => setEmployeeModalOpen(false)}>
              {t("common.save")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

    </AppShell>
  );
};




