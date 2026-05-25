import React, { useMemo, useState } from "react";
import {
  Box,
  SimpleGrid,
  Stack,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  useDisclosure,
  useToast,
} from "@chakra-ui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AppShell } from "@widgets/app-shell/AppShell";
import {
  InvoiceDetailsPanel,
  InvoicesFiltersCard,
  InvoicesExpenseSummaryCard,
  InvoicesSummaryPanel,
  InvoicesTableCard,
  InvoicesUploadCard,
} from "@widgets/invoices";
import { ProjectHero } from "@widgets/projects";
import { useCurrentUser } from "@hooks/useCurrentUser";
import { useEffectiveTenantId } from "@hooks/useEffectiveTenantId";
import { projectKeys } from "@entities/projects";
import {
  fetchErpProjects,
  fetchProjectBudgetMilestones,
  type ErpProject,
  type ProjectBudgetMilestone,
} from "@api/erpReports";
import { fetchMilestones, type ErpMilestone } from "@api/erpStructure";
import { useHrDepartments, type Department } from "@entities/hr";
import {
  deleteInvoice,
  markInvoicePaid,
  reprocessInvoice,
  updateInvoice,
  downloadInvoiceFile,
  uploadInvoice,
} from "@api/invoices";
import {
  useInvoices,
  type Invoice,
  type InvoiceFilters,
  type InvoiceUpdatePayload,
} from "@entities/invoices";
import { formatCurrency } from "@shared/utils/erp/formatters";

export const ErpInvoicesPage: React.FC = () => {
  const toast = useToast();
  const queryClient = useQueryClient();

  const { data: currentUser } = useCurrentUser();
  const { tenantId, tenantIdString, isSuperAdmin } = useEffectiveTenantId();
  const [file, setFile] = useState<File | null>(null);
  const [uploadProjectId, setUploadProjectId] = useState<string>("");
  const [subsidizable, setSubsidizable] = useState<string>("");
  const [expenseType, setExpenseType] = useState<string>("");
  const [budgetMilestoneId, setBudgetMilestoneId] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<string>("all");
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const filtersDisclosure = useDisclosure({ defaultIsOpen: true });

  const effectiveTenantId = tenantId ?? undefined;

  const tenantReady = Boolean(
    currentUser && (!isSuperAdmin || effectiveTenantId),
  );

  const formatDateInput = (value: Date) => {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const parseAmountInput = (
    value: Invoice["total_amount"] | null | undefined,
  ): number | null => {
    if (value == null || value === "") return null;
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : null;
    }
    let raw = String(value).trim();
    if (!raw) return null;
    raw = raw.replace(/\s/g, "").replace(/[€$]/g, "");
    const hasComma = raw.includes(",");
    const hasDot = raw.includes(".");
    if (hasComma && hasDot) {
      if (raw.lastIndexOf(",") > raw.lastIndexOf(".")) {
        raw = raw.replace(/\./g, "").replace(",", ".");
      } else {
        raw = raw.replace(/,/g, "");
      }
    } else if (hasComma) {
      raw = raw.replace(",", ".");
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const dateRangeValues = useMemo(() => {
    if (dateRange === "all") return { from: undefined, to: undefined };
    const today = new Date();
    const endToday = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    );

    switch (dateRange) {
      case "today":
        return {
          from: formatDateInput(endToday),
          to: formatDateInput(endToday),
        };
      case "last7": {
        const from = new Date(endToday);
        from.setDate(from.getDate() - 7);
        return { from: formatDateInput(from), to: formatDateInput(endToday) };
      }
      case "last30": {
        const from = new Date(endToday);
        from.setDate(from.getDate() - 30);
        return { from: formatDateInput(from), to: formatDateInput(endToday) };
      }
      case "thisMonth": {
        const from = new Date(endToday.getFullYear(), endToday.getMonth(), 1);
        const to = new Date(endToday.getFullYear(), endToday.getMonth() + 1, 0);
        return { from: formatDateInput(from), to: formatDateInput(to) };
      }
      case "lastMonth": {
        const from = new Date(
          endToday.getFullYear(),
          endToday.getMonth() - 1,
          1,
        );
        const to = new Date(endToday.getFullYear(), endToday.getMonth(), 0);
        return { from: formatDateInput(from), to: formatDateInput(to) };
      }
      default:
        return { from: undefined, to: undefined };
    }
  }, [dateRange]);

  const invoiceFilters: InvoiceFilters = {
    projectId: projectFilter !== "all" ? Number(projectFilter) : undefined,
    departmentId:
      departmentFilter !== "all" ? Number(departmentFilter) : undefined,
    status:
      statusFilter !== "all" ? (statusFilter as Invoice["status"]) : undefined,
    dateFrom: dateRangeValues.from,
    dateTo: dateRangeValues.to,
  };

  const { data: invoices = [], isLoading } = useInvoices(
    effectiveTenantId,
    invoiceFilters,
    tenantReady,
  );

  const { data: projects = [] } = useQuery<ErpProject[]>({
    queryKey: projectKeys.list(effectiveTenantId),
    queryFn: () => fetchErpProjects(effectiveTenantId ?? undefined),
    enabled: tenantReady,
  });

  const activeProjects = useMemo(() => {
    const filtered = projects.filter((project) => project.is_active !== false);
    if (!isSuperAdmin) return filtered;
    if (!tenantId) return [];
    const tenantIdNum = Number(tenantId);
    return filtered.filter((project) => project.tenant_id === tenantIdNum);
  }, [isSuperAdmin, projects, tenantId]);

  const departmentsQuery = useHrDepartments(effectiveTenantId, tenantReady);
  const departments = departmentsQuery.data ?? [];

  const { data: milestones = [] } = useQuery<ErpMilestone[]>({
    queryKey: projectKeys.milestones(effectiveTenantId, "all"),
    queryFn: () => fetchMilestones({}, effectiveTenantId),
    enabled: tenantReady,
  });

  const { data: budgetMilestonesForUpload = [] } = useQuery<
    ProjectBudgetMilestone[]
  >({
    queryKey: [
      "erp-budget-milestones",
      uploadProjectId || "none",
      effectiveTenantId ?? "all",
    ],
    queryFn: () =>
      fetchProjectBudgetMilestones(
        Number(uploadProjectId),
        effectiveTenantId,
      ),
    enabled: tenantReady && Boolean(uploadProjectId),
  });

  const selectedInvoiceProjectId = selectedInvoice?.project_id ?? null;
  const { data: budgetMilestonesForSelectedInvoice = [] } = useQuery<
    ProjectBudgetMilestone[]
  >({
    queryKey: [
      "erp-budget-milestones",
      selectedInvoiceProjectId ?? "none",
      effectiveTenantId ?? "all",
    ],
    queryFn: () =>
      fetchProjectBudgetMilestones(
        Number(selectedInvoiceProjectId),
        effectiveTenantId,
      ),
    enabled: tenantReady && Boolean(selectedInvoiceProjectId),
  });

  const filteredInvoices = useMemo(() => {
    return invoices.filter((invoice) => {
      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      return (
        String(invoice.id).includes(term) ||
        (invoice.supplier_name || "").toLowerCase().includes(term) ||
        (invoice.invoice_number || "").toLowerCase().includes(term)
      );
    });
  }, [invoices, searchTerm]);

  const totalAmount = filteredInvoices.reduce(
    (acc, invoice) => acc + (parseAmountInput(invoice.total_amount) ?? 0),
    0,
  );
  const pendingAmount = filteredInvoices.reduce(
    (acc, invoice) =>
      acc +
      (invoice.status === "paid" ? 0 : (parseAmountInput(invoice.total_amount) ?? 0)),
    0,
  );
  const paidAmount = filteredInvoices.reduce(
    (acc, invoice) =>
      acc +
      (invoice.status === "paid" ? (parseAmountInput(invoice.total_amount) ?? 0) : 0),
    0,
  );
  const pendingCount = filteredInvoices.filter(
    (invoice) => invoice.status !== "paid",
  ).length;
  const paidCount = filteredInvoices.filter(
    (invoice) => invoice.status === "paid",
  ).length;
  const heroItems = [
    { label: "Total facturas", value: filteredInvoices.length },
    { label: "Pendientes", value: pendingCount },
    { label: "Pagadas", value: paidCount },
    { label: "Importe total", value: formatCurrency(totalAmount) },
  ];

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Selecciona un archivo.");
      if (!uploadProjectId) {
        throw new Error("Selecciona un proyecto activo.");
      }
      return uploadInvoice(
        file,
        effectiveTenantId,
        Number(uploadProjectId),
        subsidizable === "subsidizable",
        expenseType || null,
        null,
        budgetMilestoneId ? Number(budgetMilestoneId) : null,
      );
    },
    onSuccess: async () => {
      setFile(null);
      setUploadProjectId("");
      setSubsidizable("");
      setExpenseType("");
      setBudgetMilestoneId("");
      await queryClient.invalidateQueries({
        queryKey: ["erp-invoices", effectiveTenantId ?? "all"],
      });
      toast({ title: "Factura subida", status: "success" });
    },
    onError: (error: any) => {
      toast({
        title: "Error al subir",
        description:
          error?.response?.data?.detail ?? "No se pudo subir la factura.",
        status: "error",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: InvoiceUpdatePayload) => {
      if (!selectedInvoice) throw new Error("No hay factura seleccionada.");
      return updateInvoice(selectedInvoice.id, payload, effectiveTenantId);
    },
    onSuccess: async (updated) => {
      setSelectedInvoice(updated);
      await queryClient.invalidateQueries({
        queryKey: ["erp-invoices", effectiveTenantId ?? "all"],
      });
      toast({ title: "Factura actualizada", status: "success" });
    },
    onError: (error: any) => {
      toast({
        title: "Error al actualizar",
        description:
          error?.response?.data?.detail ?? "No se pudo actualizar la factura.",
        status: "error",
      });
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: async (invoiceId: number) =>
      markInvoicePaid(invoiceId, effectiveTenantId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["erp-invoices", effectiveTenantId ?? "all"],
      });
      toast({ title: "Factura marcada como pagada", status: "success" });
    },
    onError: (error: any) => {
      toast({
        title: "Error al marcar como pagada",
        description:
          error?.response?.data?.detail ?? "No se pudo marcar la factura.",
        status: "error",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (invoiceId: number) =>
      deleteInvoice(invoiceId, effectiveTenantId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["erp-invoices", effectiveTenantId ?? "all"],
      });
      toast({ title: "Factura eliminada", status: "success" });
    },
    onError: (error: any) => {
      toast({
        title: "Error al eliminar",
        description:
          error?.response?.data?.detail ?? "No se pudo eliminar la factura.",
        status: "error",
      });
    },
  });

  const reprocessMutation = useMutation({
    mutationFn: async (invoiceId: number) =>
      reprocessInvoice(invoiceId, effectiveTenantId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["erp-invoices", effectiveTenantId ?? "all"],
      });
      toast({ title: "Reprocesando factura", status: "info" });
    },
    onError: (error: any) => {
      toast({
        title: "Error al reprocesar",
        description:
          error?.response?.data?.detail ?? "No se pudo reprocesar la factura.",
        status: "error",
      });
    },
  });

  const handleOpenDetails = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    onOpen();
  };

  const handleDownload = async (invoice: Invoice) => {
    try {
      const blob = await downloadInvoiceFile(invoice.id, effectiveTenantId);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = invoice.original_filename || `invoice-${invoice.id}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      toast({
        title: "Error al descargar",
        description:
          error?.response?.data?.detail ?? "No se pudo descargar el archivo.",
        status: "error",
      });
    }
  };

  const handleSaveDetails = () => {
    if (!selectedInvoice) return;
    updateMutation.mutate({
      supplier_name: selectedInvoice.supplier_name ?? null,
      supplier_tax_id: selectedInvoice.supplier_tax_id ?? null,
      invoice_number: selectedInvoice.invoice_number ?? null,
      issue_date: selectedInvoice.issue_date ?? null,
      due_date: selectedInvoice.due_date ?? null,
      total_amount: parseAmountInput(selectedInvoice.total_amount),
      currency: selectedInvoice.currency ?? null,
      concept: selectedInvoice.concept ?? null,
      subsidizable:
        selectedInvoice.subsidizable !== undefined
          ? selectedInvoice.subsidizable
          : null,
      expense_type: selectedInvoice.expense_type ?? null,
      milestone_id: selectedInvoice.milestone_id ?? null,
      budget_milestone_id: selectedInvoice.budget_milestone_id ?? null,
      project_id: selectedInvoice.project_id ?? null,
      department_id: selectedInvoice.department_id ?? null,
      status: selectedInvoice.status,
    });
  };

  const handleClearFilters = () => {
    setSearchTerm("");
    setStatusFilter("all");
    setProjectFilter("all");
    setDepartmentFilter("all");
    setDateRange("all");
  };

  const handleUploadProjectChange = (value: string) => {
    setUploadProjectId(value);
    setBudgetMilestoneId("");
    setExpenseType("");
  };

  const subsidizableDestinations = [
    "Materiales",
    "Colaboraciones externas",
    "Otros gastos subvencionables",
  ];
  const nonSubsidizableDestinations = ["Otros gastos (no subvencionables)"];

  const handleSubsidizableChange = (value: string) => {
    setSubsidizable(value);
    setExpenseType("");
  };

  return (
    <AppShell>
      <Stack spacing={6}>
        <ProjectHero
          items={heroItems}
          title="Gestión de facturas"
          subtitle="Sube facturas, revisa extracciones y gestiona el estado de pago."
          breadcrumb="Gestión de proyectos"
        />

        <Tabs variant="unstyled">
          <TabList
            bg="white"
            borderRadius="12px"
            p="6px"
            boxShadow="0 1px 10px rgba(0,0,0,0.08)"
            border="1px solid"
            borderColor="gray.100"
            gap={1}
            flexWrap="wrap"
            w="fit-content"
          >
            <Tab
              px={4}
              py={2}
              borderRadius="10px"
              fontSize="sm"
              fontWeight={600}
              _selected={{
                bg: "brand.600",
                color: "white",
                _hover: { bg: "brand.600", color: "white" },
              }}
              _hover={{ bg: "gray.50" }}
            >
              Subir factura
            </Tab>
            <Tab
              px={4}
              py={2}
              borderRadius="10px"
              fontSize="sm"
              fontWeight={500}
              _selected={{
                bg: "brand.600",
                color: "white",
                fontWeight: 600,
                _hover: { bg: "brand.600", color: "white", fontWeight: 600 },
              }}
              _hover={{ bg: "gray.50" }}
            >
              Listado de facturas
            </Tab>
            <Tab
              px={4}
              py={2}
              borderRadius="10px"
              fontSize="sm"
              fontWeight={500}
              _selected={{
                bg: "brand.600",
                color: "white",
                fontWeight: 600,
                _hover: { bg: "brand.600", color: "white", fontWeight: 600 },
              }}
              _hover={{ bg: "gray.50" }}
            >
              Resumen de gastos
            </Tab>
          </TabList>

          <TabPanels pt={6}>
            <TabPanel px={0}>
              <SimpleGrid
                columns={{ base: 1, lg: 2 }}
                spacing={6}
                alignItems="start"
              >
                <InvoicesUploadCard
                  isSuperAdmin={isSuperAdmin}
                  tenantReady={tenantReady}
                  selectedTenantId={tenantIdString ?? ""}
                  file={file}
                  onFileChange={setFile}
                  uploadProjectId={uploadProjectId}
                  onUploadProjectChange={handleUploadProjectChange}
                  activeProjects={activeProjects}
                  subsidizable={subsidizable}
                  onSubsidizableChange={handleSubsidizableChange}
                  expenseType={expenseType}
                  onExpenseTypeChange={setExpenseType}
                  subsidizableDestinations={subsidizableDestinations}
                  nonSubsidizableDestinations={nonSubsidizableDestinations}
                  budgetMilestoneId={budgetMilestoneId}
                  onBudgetMilestoneChange={setBudgetMilestoneId}
                  budgetMilestones={budgetMilestonesForUpload}
                  onUpload={() => uploadMutation.mutate()}
                  isUploading={uploadMutation.isPending}
                />
                <InvoicesExpenseSummaryCard
                  invoices={filteredInvoices}
                  projects={activeProjects}
                  milestones={milestones}
                />
              </SimpleGrid>
            </TabPanel>

            <TabPanel px={0}>
              <Stack spacing={6}>
                <InvoicesFiltersCard
                  isOpen={filtersDisclosure.isOpen}
                  onToggle={filtersDisclosure.onToggle}
                  searchTerm={searchTerm}
                  onSearchTermChange={setSearchTerm}
                  statusFilter={statusFilter}
                  onStatusFilterChange={setStatusFilter}
                  projectFilter={projectFilter}
                  onProjectFilterChange={setProjectFilter}
                  departmentFilter={departmentFilter}
                  onDepartmentFilterChange={setDepartmentFilter}
                  dateRange={dateRange}
                  onDateRangeChange={setDateRange}
                  activeProjects={activeProjects}
                  departments={departments}
                  onClearFilters={handleClearFilters}
                />

                <InvoicesTableCard
                  invoices={filteredInvoices}
                  isLoading={isLoading}
                  onOpenDetails={handleOpenDetails}
                  onDownload={handleDownload}
                  onMarkPaid={(invoiceId) => markPaidMutation.mutate(invoiceId)}
                  onReprocess={(invoiceId) => reprocessMutation.mutate(invoiceId)}
                  onDelete={(invoiceId) => deleteMutation.mutate(invoiceId)}
                  isMarkingPaid={markPaidMutation.isPending}
                  isReprocessing={reprocessMutation.isPending}
                  isDeleting={deleteMutation.isPending}
                  totalAmount={totalAmount}
                  pendingAmount={pendingAmount}
                  paidAmount={paidAmount}
                />
              </Stack>
            </TabPanel>

            <TabPanel px={0}>
              <Box>
                <InvoicesSummaryPanel
                  invoices={filteredInvoices}
                  projects={activeProjects}
                  milestones={milestones}
                />
              </Box>
            </TabPanel>
          </TabPanels>
        </Tabs>

        {selectedInvoice && isOpen && (
          <InvoiceDetailsPanel
            invoice={selectedInvoice}
            activeProjects={activeProjects}
            budgetMilestones={budgetMilestonesForSelectedInvoice}
            departments={departments}
            onInvoiceChange={(invoice) => setSelectedInvoice(invoice)}
            onSave={handleSaveDetails}
            onClose={onClose}
            isSaving={updateMutation.isPending}
          />
        )}
      </Stack>
    </AppShell>
  );
};

export default ErpInvoicesPage;

