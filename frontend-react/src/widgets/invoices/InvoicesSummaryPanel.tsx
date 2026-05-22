import React, { useMemo } from "react";
import {
  Box,
  Flex,
  Heading,
  HStack,
  Icon,
  SimpleGrid,
  Stack,
  Text,
  useColorModeValue,
  VStack,
} from "@chakra-ui/react";

import type { Invoice } from "@api/invoices";
import type { ErpProject } from "@api/erpReports";
import type { ErpMilestone } from "@api/erpStructure";
import { formatAmount } from "@shared/utils/erp/invoices";

type InvoiceSummaryItem = {
  label: string;
  amount: number;
};

type InvoiceSummaryTotals = {
  total: number;
  subsidizable: number;
  nonSubsidizable: number;
  unclassified: number;
  subsidizableItems: InvoiceSummaryItem[];
  nonSubsidizableItems: InvoiceSummaryItem[];
  unclassifiedItems: InvoiceSummaryItem[];
  milestoneItems: InvoiceSummaryItem[];
  topMilestone?: InvoiceSummaryItem;
};

const parseBoolean = (value: unknown) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["si", "true", "1", "yes"].includes(normalized)) return true;
    if (["no", "false", "0"].includes(normalized)) return false;
  }
  return undefined;
};

const getInvoiceAmount = (invoice: Invoice) => {
  if (invoice.total_amount == null) return 0;
  if (typeof invoice.total_amount === "number") return invoice.total_amount;
  const sanitized = invoice.total_amount.replace(/\s/g, "").replace(",", ".");
  const parsed = Number(sanitized);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const getExpenseType = (invoice: Invoice) => {
  if (invoice.expense_type && invoice.expense_type.trim()) {
    return invoice.expense_type.trim();
  }
  const suggestions = invoice.classification_suggestions ?? {};
  const rawType =
    (suggestions as Record<string, unknown>).expense_type ??
    (suggestions as Record<string, unknown>).expense_category ??
    (suggestions as Record<string, unknown>).tipo_gasto ??
    (suggestions as Record<string, unknown>).category ??
    (suggestions as Record<string, unknown>).destino;
  if (typeof rawType === "string" && rawType.trim()) {
    return rawType.trim();
  }
  return "Otros";
};

const getSubsidizableFlag = (invoice: Invoice) => {
  if (invoice.subsidizable !== null && invoice.subsidizable !== undefined) {
    return invoice.subsidizable;
  }
  const suggestions = invoice.classification_suggestions ?? {};
  const rawFlag =
    (suggestions as Record<string, unknown>).subsidizable ??
    (suggestions as Record<string, unknown>).is_subsidizable ??
    (suggestions as Record<string, unknown>).subvencionable ??
    (suggestions as Record<string, unknown>).grantable;
  return parseBoolean(rawFlag);
};

const summarizeInvoices = (
  invoices: Invoice[],
  projects: ErpProject[],
  milestones: ErpMilestone[],
): InvoiceSummaryTotals => {
  const subsidizableMap = new Map<string, number>();
  const nonSubsidizableMap = new Map<string, number>();
  const unclassifiedMap = new Map<string, number>();
  const milestoneMap = new Map<string, number>();
  const projectNameById = new Map(
    projects.map((project) => [project.id, project.name]),
  );
  const milestoneTitleById = new Map(
    milestones.map((milestone) => [milestone.id, milestone.title]),
  );

  let total = 0;
  let subsidizable = 0;
  let nonSubsidizable = 0;
  let unclassified = 0;

  invoices.forEach((invoice) => {
    const amount = getInvoiceAmount(invoice);
    if (!amount) return;
    total += amount;

    const expenseType = getExpenseType(invoice);
    const subsidizableFlag = getSubsidizableFlag(invoice);

    if (subsidizableFlag === true) {
      subsidizable += amount;
      subsidizableMap.set(
        expenseType,
        (subsidizableMap.get(expenseType) ?? 0) + amount,
      );
    } else if (subsidizableFlag === false) {
      nonSubsidizable += amount;
      nonSubsidizableMap.set(
        expenseType,
        (nonSubsidizableMap.get(expenseType) ?? 0) + amount,
      );
    } else {
      unclassified += amount;
      unclassifiedMap.set(
        expenseType,
        (unclassifiedMap.get(expenseType) ?? 0) + amount,
      );
    }

    const milestoneLabel =
      invoice.milestone_id && milestoneTitleById.get(invoice.milestone_id)
        ? milestoneTitleById.get(invoice.milestone_id)!
        : invoice.project_id && projectNameById.get(invoice.project_id)
          ? projectNameById.get(invoice.project_id)!
          : "Sin hito asociado";
    milestoneMap.set(
      milestoneLabel,
      (milestoneMap.get(milestoneLabel) ?? 0) + amount,
    );
  });

  const mapToItems = (source: Map<string, number>) =>
    Array.from(source.entries())
      .map(([label, amount]) => ({ label, amount }))
      .sort((a, b) => b.amount - a.amount);

  const milestoneItems = mapToItems(milestoneMap);

  return {
    total,
    subsidizable,
    nonSubsidizable,
    unclassified,
    subsidizableItems: mapToItems(subsidizableMap),
    nonSubsidizableItems: mapToItems(nonSubsidizableMap),
    unclassifiedItems: mapToItems(unclassifiedMap),
    milestoneItems,
    topMilestone: milestoneItems[0],
  };
};

const SummaryRow: React.FC<{ label: string; amount: number }> = ({
  label,
  amount,
}) => {
  const subtleText = useColorModeValue("gray.600", "gray.300");
  return (
    <Flex align="center" justify="space-between" fontSize="sm">
      <Text color={subtleText}>{label}</Text>
      <Text fontWeight="bold" color="brand.700">
        {formatAmount(amount, "EUR")}
      </Text>
    </Flex>
  );
};

interface InvoicesExpenseSummaryCardProps {
  invoices: Invoice[];
  projects: ErpProject[];
  milestones: ErpMilestone[];
}

export const InvoicesExpenseSummaryCard: React.FC<
  InvoicesExpenseSummaryCardProps
> = ({ invoices, projects, milestones }) => {
  const cardBg = useColorModeValue("white", "gray.700");
  const borderColor = useColorModeValue("gray.200", "gray.600");
  const headerBg = useColorModeValue("gray.50", "gray.800");

  const summary = useMemo(
    () => summarizeInvoices(invoices, projects, milestones),
    [invoices, projects, milestones],
  );

  return (
    <Box
      w="full"
      bg={cardBg}
      borderRadius="xl"
      borderWidth="1px"
      borderColor={borderColor}
      boxShadow="sm"
      overflow="hidden"
    >
      <Flex
        align="center"
        gap={3}
        px={5}
        py={4}
        bg={headerBg}
        borderBottomWidth="1px"
        borderColor={borderColor}
      >
        <Box
          w="10"
          h="10"
          bgGradient="linear(to-br, brand.600, brand.500)"
          borderRadius="lg"
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          <Icon viewBox="0 0 24 24" boxSize={5} color="white">
            <path
              fill="currentColor"
              d="M3 3h18v18H3V3zm4 4h2v10H7V7zm4 3h2v7h-2v-7zm4-2h2v9h-2V8z"
            />
          </Icon>
        </Box>
        <Heading size="sm" fontWeight="bold">
          Resumen por tipo de gasto
        </Heading>
      </Flex>

      <Stack spacing={4} px={5} py={4}>
        <Box bg={headerBg} borderRadius="lg" px={4} py={3}>
          <Text fontWeight="bold" fontSize="sm" mb={3} color="brand.700">
            Gastos subvencionables
          </Text>
          <Stack spacing={2}>
            {summary.subsidizableItems.length > 0 ? (
              summary.subsidizableItems.map((item) => (
                <SummaryRow key={item.label} label={item.label} amount={item.amount} />
              ))
            ) : (
              <Text fontSize="sm" color="gray.500">
                Sin datos subvencionables
              </Text>
            )}
            {summary.unclassified > 0 && (
              <SummaryRow label="Sin clasificar" amount={summary.unclassified} />
            )}
          </Stack>
        </Box>

        <Box bg={headerBg} borderRadius="lg" px={4} py={3}>
          <Text fontWeight="bold" fontSize="sm" mb={3} color="brand.700">
            Gastos no subvencionables
          </Text>
          <Stack spacing={2}>
            {summary.nonSubsidizableItems.length > 0 ? (
              summary.nonSubsidizableItems.map((item) => (
                <SummaryRow key={item.label} label={item.label} amount={item.amount} />
              ))
            ) : (
              <Text fontSize="sm" color="gray.500">
                Sin datos no subvencionables
              </Text>
            )}
          </Stack>
        </Box>

        <Box
          bg="brand.700"
          color="white"
          borderRadius="lg"
          px={4}
          py={3}
          display="flex"
          alignItems="center"
          justifyContent="space-between"
          fontWeight="bold"
        >
          <Text fontSize="sm">Total general</Text>
          <Text fontSize="lg">{formatAmount(summary.total, "EUR")}</Text>
        </Box>
      </Stack>
    </Box>
  );
};

interface InvoicesSummaryPanelProps {
  invoices: Invoice[];
  projects: ErpProject[];
  milestones: ErpMilestone[];
}

export const InvoicesSummaryPanel: React.FC<InvoicesSummaryPanelProps> = ({
  invoices,
  projects,
  milestones,
}) => {
  const cardBg = useColorModeValue("white", "gray.700");
  const borderColor = useColorModeValue("gray.200", "gray.600");
  const subtleText = useColorModeValue("gray.600", "gray.300");
  const softBg = useColorModeValue("gray.50", "gray.800");

  const summary = useMemo(
    () => summarizeInvoices(invoices, projects, milestones),
    [invoices, projects, milestones],
  );

  const pieSegments = useMemo(() => {
    const total = summary.total || 1;
    const parts = [
      { label: "Subvencionables", value: summary.subsidizable, color: "#2f855a" },
      { label: "No subvencionables", value: summary.nonSubsidizable, color: "#a0aec0" },
      { label: "Sin clasificar", value: summary.unclassified, color: "#CBD5E0" },
    ];
    let accumulated = 0;
    return parts.map((part) => {
      const start = accumulated;
      const slice = (part.value / total) * 360;
      accumulated += slice;
      return {
        ...part,
        start,
        end: accumulated,
      };
    });
  }, [summary]);

  const pieStyle = useMemo(() => {
    if (!summary.total) {
      return "radial-gradient(circle at center, #e2e8f0 0 60%, transparent 61%)";
    }
    const stops = pieSegments
      .map((segment) => `${segment.color} ${segment.start}deg ${segment.end}deg`)
      .join(", ");
    return `conic-gradient(${stops})`;
  }, [pieSegments, summary.total]);

  const subsidyPercent = summary.total
    ? Math.round((summary.subsidizable / summary.total) * 100)
    : 0;
  const topMilestonePercent =
    summary.total && summary.topMilestone
      ? Math.round((summary.topMilestone.amount / summary.total) * 100)
      : 0;

  return (
    <Stack spacing={6}>
      <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={6}>
        <Box
          bg={cardBg}
          borderRadius="2xl"
          borderWidth="1px"
          borderColor={borderColor}
          boxShadow="sm"
          p={{ base: 4, md: 6 }}
        >
          <HStack spacing={3} mb={4}>
            <Box
              w="10"
              h="10"
              bgGradient="linear(to-br, brand.600, brand.500)"
              borderRadius="lg"
              display="flex"
              alignItems="center"
              justifyContent="center"
            >
              <Icon viewBox="0 0 24 24" boxSize={5} color="white">
                <path
                  fill="currentColor"
                  d="M3 3h18v18H3V3zm4 4h2v10H7V7zm4 3h2v7h-2v-7zm4-2h2v9h-2V8z"
                />
              </Icon>
            </Box>
            <Heading size="sm" fontWeight="bold">
              Desglose por tipo de gasto
            </Heading>
          </HStack>

          <Flex
            align="center"
            justify="center"
            gap={{ base: 6, md: 8 }}
            flexWrap="wrap"
          >
            <Box
              w={{ base: "180px", md: "220px" }}
              h={{ base: "180px", md: "220px" }}
              borderRadius="full"
              bg={pieStyle}
              position="relative"
              boxShadow="inset 0 0 0 12px #ffffff"
            />
            <VStack align="stretch" spacing={3} minW="200px">
              <SummaryRow label="Subvencionables" amount={summary.subsidizable} />
              <SummaryRow label="No subvencionables" amount={summary.nonSubsidizable} />
              {summary.unclassified > 0 && (
                <SummaryRow label="Sin clasificar" amount={summary.unclassified} />
              )}
              <Flex
                align="center"
                justify="space-between"
                fontSize="sm"
                fontWeight="bold"
                pt={2}
                borderTopWidth="1px"
                borderColor={borderColor}
              >
                <Text>Total general</Text>
                <Text color="brand.700">{formatAmount(summary.total, "EUR")}</Text>
              </Flex>
            </VStack>
          </Flex>
        </Box>

        <Box
          bg={cardBg}
          borderRadius="2xl"
          borderWidth="1px"
          borderColor={borderColor}
          boxShadow="sm"
          p={{ base: 4, md: 6 }}
        >
          <HStack spacing={3} mb={4}>
            <Box
              w="10"
              h="10"
              bgGradient="linear(to-br, brand.600, brand.500)"
              borderRadius="lg"
              display="flex"
              alignItems="center"
              justifyContent="center"
            >
              <Icon viewBox="0 0 24 24" boxSize={5} color="white">
                <path
                  fill="currentColor"
                  d="M3 3h18v18H3V3zm4 4h2v10H7V7zm4-2h2v12h-2V5zm4 6h2v6h-2v-6z"
                />
              </Icon>
            </Box>
            <Heading size="sm" fontWeight="bold">
              Gastos por hito
            </Heading>
          </HStack>

          <VStack align="stretch" spacing={3}>
            {summary.milestoneItems.length > 0 ? (
              summary.milestoneItems.map((item) => (
                <SummaryRow key={item.label} label={item.label} amount={item.amount} />
              ))
            ) : (
              <Text fontSize="sm" color={subtleText}>
                No hay gastos asociados a hitos todavía.
              </Text>
            )}
          </VStack>

          <Box
            mt={6}
            bg={softBg}
            borderRadius="lg"
            px={4}
            py={3}
            borderLeftWidth="4px"
            borderLeftColor="brand.500"
          >
            <Text fontWeight="bold" color="brand.700" fontSize="sm" mb={1}>
              Análisis
            </Text>
            <Text fontSize="sm" color={subtleText}>
              {summary.total
                ? `El ${subsidyPercent}% de los gastos son subvencionables. ${summary.topMilestone?.label ?? "El hito principal"} concentra el ${topMilestonePercent}% del total.`
                : "Aún no hay facturas suficientes para generar un análisis."}
            </Text>
          </Box>
        </Box>
      </SimpleGrid>
    </Stack>
  );
};

