import React, { useMemo } from "react";
import {
  Box,
  Button,
  Divider,
  Flex,
  FormControl,
  FormLabel,
  Heading,
  HStack,
  Icon,
  Input,
  Select,
  SimpleGrid,
  Text,
  useColorModeValue,
} from "@chakra-ui/react";

import type { Department } from "@entities/hr";
import type { ErpProject } from "@api/erpReports";
import type { ProjectBudgetMilestone } from "@api/erpReports";
import type { Invoice } from "@api/invoices";

interface InvoiceDetailsPanelProps {
  invoice: Invoice;
  activeProjects: ErpProject[];
  budgetMilestones: ProjectBudgetMilestone[];
  departments: Department[];
  onInvoiceChange: (invoice: Invoice) => void;
  onSave: () => void;
  onClose: () => void;
  isSaving: boolean;
}

export const InvoiceDetailsPanel: React.FC<InvoiceDetailsPanelProps> = ({
  invoice,
  activeProjects,
  budgetMilestones,
  departments,
  onInvoiceChange,
  onSave,
  onClose,
  isSaving,
}) => {
  const cardBg = useColorModeValue("white", "gray.700");
  const borderColor = useColorModeValue("gray.200", "gray.600");
  const subtleText = useColorModeValue("gray.600", "gray.300");

  const subsidizableDestinations = [
    "Materiales",
    "Colaboraciones externas",
    "Otros gastos subvencionables",
  ];
  const nonSubsidizableDestinations = ["Otros gastos (no subvencionables)"];

  const destinationOptions = invoice.subsidizable
    ? subsidizableDestinations
    : nonSubsidizableDestinations;

  const milestonesForInvoice = useMemo(() => {
    if (!invoice.project_id) return [];
    return budgetMilestones.filter(
      (milestone) => milestone.project_id === invoice.project_id,
    );
  }, [invoice.project_id, budgetMilestones]);

  return (
    <Box
      bg={cardBg}
      borderRadius="2xl"
      p={6}
      borderWidth="1px"
      borderColor={borderColor}
      boxShadow="2xl"
    >
      <Flex align="center" justify="space-between" mb={6}>
        <HStack spacing={3}>
          <Box
            w="10"
            h="10"
            bgGradient="linear(to-br, blue.500, blue.600)"
            borderRadius="xl"
            display="flex"
            alignItems="center"
            justifyContent="center"
          >
            <Icon viewBox="0 0 24 24" boxSize={5} color="white">
              <path
                fill="currentColor"
                d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"
              />
            </Icon>
          </Box>
          <Heading size="md" fontWeight="bold">
            Detalle de factura #{invoice.id}
          </Heading>
        </HStack>
        <Button
          size="sm"
          variant="ghost"
          onClick={onClose}
          borderRadius="lg"
          fontWeight="semibold"
        >
          Cerrar
        </Button>
      </Flex>
      <Divider mb={6} />
      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={5}>
        <FormControl>
          <FormLabel fontSize="sm" fontWeight="semibold">
            Proveedor
          </FormLabel>
          <Input
            value={invoice.supplier_name ?? ""}
            onChange={(e) =>
              onInvoiceChange({
                ...invoice,
                supplier_name: e.target.value,
              })
            }
            borderRadius="xl"
            borderColor={borderColor}
            _focus={{
              borderColor: "blue.500",
              boxShadow: "0 0 0 1px var(--chakra-colors-blue-500)",
            }}
          />
        </FormControl>
        <FormControl>
          <FormLabel fontSize="sm" fontWeight="semibold">
            NIF/CIF
          </FormLabel>
          <Input
            value={invoice.supplier_tax_id ?? ""}
            onChange={(e) =>
              onInvoiceChange({
                ...invoice,
                supplier_tax_id: e.target.value,
              })
            }
            borderRadius="xl"
            borderColor={borderColor}
            _focus={{
              borderColor: "blue.500",
              boxShadow: "0 0 0 1px var(--chakra-colors-blue-500)",
            }}
          />
        </FormControl>
        <FormControl>
          <FormLabel fontSize="sm" fontWeight="semibold">
            Número
          </FormLabel>
          <Input
            value={invoice.invoice_number ?? ""}
            onChange={(e) =>
              onInvoiceChange({
                ...invoice,
                invoice_number: e.target.value,
              })
            }
            borderRadius="xl"
            borderColor={borderColor}
            _focus={{
              borderColor: "blue.500",
              boxShadow: "0 0 0 1px var(--chakra-colors-blue-500)",
            }}
          />
        </FormControl>
        <FormControl>
          <FormLabel fontSize="sm" fontWeight="semibold">
            Fecha emisión
          </FormLabel>
          <Input
            type="date"
            value={invoice.issue_date ?? ""}
            onChange={(e) =>
              onInvoiceChange({
                ...invoice,
                issue_date: e.target.value,
              })
            }
            borderRadius="xl"
            borderColor={borderColor}
            _focus={{
              borderColor: "blue.500",
              boxShadow: "0 0 0 1px var(--chakra-colors-blue-500)",
            }}
          />
        </FormControl>
        <FormControl>
          <FormLabel fontSize="sm" fontWeight="semibold">
            Fecha vencimiento
          </FormLabel>
          <Input
            type="date"
            value={invoice.due_date ?? ""}
            onChange={(e) =>
              onInvoiceChange({
                ...invoice,
                due_date: e.target.value,
              })
            }
            borderRadius="xl"
            borderColor={borderColor}
            _focus={{
              borderColor: "blue.500",
              boxShadow: "0 0 0 1px var(--chakra-colors-blue-500)",
            }}
          />
        </FormControl>
        <FormControl>
          <FormLabel fontSize="sm" fontWeight="semibold">
            Total
          </FormLabel>
          <Input
            type="text"
            inputMode="decimal"
            placeholder="Ej. 1234,56"
            value={invoice.total_amount != null ? String(invoice.total_amount) : ""}
            onChange={(e) =>
              onInvoiceChange({
                ...invoice,
                total_amount: e.target.value,
              })
            }
            borderRadius="xl"
            borderColor={borderColor}
            _focus={{
              borderColor: "blue.500",
              boxShadow: "0 0 0 1px var(--chakra-colors-blue-500)",
            }}
          />
        </FormControl>
        <FormControl>
          <FormLabel fontSize="sm" fontWeight="semibold">
            Moneda
          </FormLabel>
          <Input
            value={invoice.currency ?? ""}
            onChange={(e) =>
              onInvoiceChange({
                ...invoice,
                currency: e.target.value,
              })
            }
            borderRadius="xl"
            borderColor={borderColor}
            _focus={{
              borderColor: "blue.500",
              boxShadow: "0 0 0 1px var(--chakra-colors-blue-500)",
            }}
          />
        </FormControl>
        <FormControl>
          <FormLabel fontSize="sm" fontWeight="semibold">
            Concepto
          </FormLabel>
          <Input
            value={invoice.concept ?? ""}
            onChange={(e) =>
              onInvoiceChange({
                ...invoice,
                concept: e.target.value,
              })
            }
            borderRadius="xl"
            borderColor={borderColor}
            _focus={{
              borderColor: "blue.500",
              boxShadow: "0 0 0 1px var(--chakra-colors-blue-500)",
            }}
          />
        </FormControl>
        <FormControl>
          <FormLabel fontSize="sm" fontWeight="semibold">
            Tipo de gasto
          </FormLabel>
          <Select
            value={
              invoice.subsidizable === null || invoice.subsidizable === undefined
                ? ""
                : invoice.subsidizable
                  ? "subsidizable"
                  : "non_subsidizable"
            }
            onChange={(e) =>
              onInvoiceChange({
                ...invoice,
                subsidizable:
                  e.target.value === ""
                    ? null
                    : e.target.value === "subsidizable",
                expense_type: "",
              })
            }
            borderRadius="xl"
            borderColor={borderColor}
            _focus={{
              borderColor: "blue.500",
              boxShadow: "0 0 0 1px var(--chakra-colors-blue-500)",
            }}
          >
            <option value="">Sin clasificar</option>
            <option value="subsidizable">Subvencionable</option>
            <option value="non_subsidizable">No subvencionable</option>
          </Select>
        </FormControl>
        <FormControl>
          <FormLabel fontSize="sm" fontWeight="semibold">
            Destino del gasto
          </FormLabel>
          <Text fontSize="xs" color={subtleText} mb={2}>
            Selecciona el destino segun el tipo de gasto
          </Text>
          <Select
            value={invoice.expense_type ?? ""}
            onChange={(e) =>
              onInvoiceChange({
                ...invoice,
                expense_type: e.target.value,
              })
            }
            borderRadius="xl"
            borderColor={borderColor}
            isDisabled={invoice.subsidizable == null}
            _focus={{
              borderColor: "blue.500",
              boxShadow: "0 0 0 1px var(--chakra-colors-blue-500)",
            }}
          >
            <option value="">Selecciona destino</option>
            {destinationOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        </FormControl>
        <FormControl>
          <FormLabel fontSize="sm" fontWeight="semibold">
            Hito asociado
          </FormLabel>
          <Select
            value={invoice.budget_milestone_id ?? ""}
            onChange={(e) =>
              onInvoiceChange({
                ...invoice,
                budget_milestone_id: e.target.value ? Number(e.target.value) : null,
              })
            }
            borderRadius="xl"
            borderColor={borderColor}
            isDisabled={!invoice.project_id}
            _focus={{
              borderColor: "blue.500",
              boxShadow: "0 0 0 1px var(--chakra-colors-blue-500)",
            }}
          >
            <option value="">Sin hito asociado</option>
            {milestonesForInvoice.map((milestone) => (
              <option key={milestone.id} value={milestone.id}>
                {milestone.name}
              </option>
            ))}
          </Select>
        </FormControl>
        <FormControl>
          <FormLabel fontSize="sm" fontWeight="semibold">
            Proyecto
          </FormLabel>
          <Select
            value={invoice.project_id ?? ""}
            onChange={(e) =>
              onInvoiceChange({
                ...invoice,
                project_id: e.target.value ? Number(e.target.value) : null,
              })
            }
            borderRadius="xl"
            borderColor={borderColor}
            _focus={{
              borderColor: "blue.500",
              boxShadow: "0 0 0 1px var(--chakra-colors-blue-500)",
            }}
          >
            <option value="">Sin proyecto</option>
            {activeProjects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </Select>
        </FormControl>
        <FormControl>
          <FormLabel fontSize="sm" fontWeight="semibold">
            Departamento
          </FormLabel>
          <Select
            value={invoice.department_id ?? ""}
            onChange={(e) =>
              onInvoiceChange({
                ...invoice,
                department_id: e.target.value ? Number(e.target.value) : null,
              })
            }
            borderRadius="xl"
            borderColor={borderColor}
            _focus={{
              borderColor: "blue.500",
              boxShadow: "0 0 0 1px var(--chakra-colors-blue-500)",
            }}
          >
            <option value="">Sin departamento</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </Select>
        </FormControl>
        <FormControl>
          <FormLabel fontSize="sm" fontWeight="semibold">
            Estado
          </FormLabel>
          <Select
            value={invoice.status}
            onChange={(e) =>
              onInvoiceChange({
                ...invoice,
                status: e.target.value as Invoice["status"],
              })
            }
            borderRadius="xl"
            borderColor={borderColor}
            _focus={{
              borderColor: "blue.500",
              boxShadow: "0 0 0 1px var(--chakra-colors-blue-500)",
            }}
          >
            <option value="uploaded">Subida</option>
            <option value="extracting">Extrayendo</option>
            <option value="extracted">Extraída</option>
            <option value="suggested">Sugerida</option>
            <option value="validated">Validada</option>
            <option value="pending">Pendiente</option>
            <option value="paid">Pagada</option>
            <option value="failed">Fallida</option>
          </Select>
        </FormControl>
        <FormControl>
          <FormLabel fontSize="sm" fontWeight="semibold">
            Error extracción
          </FormLabel>
          <Input
            value={invoice.extraction_error ?? ""}
            isReadOnly
            borderRadius="xl"
            borderColor={borderColor}
            bg="gray.50"
          />
        </FormControl>
      </SimpleGrid>
      <HStack mt={8} spacing={3}>
        <Button
          colorScheme="brand"
          onClick={onSave}
          isLoading={isSaving}
          borderRadius="xl"
          size="lg"
          fontWeight="bold"
        >
          Guardar cambios
        </Button>
        <Button
          variant="outline"
          onClick={onClose}
          borderRadius="xl"
          size="lg"
          fontWeight="semibold"
        >
          Cancelar
        </Button>
      </HStack>
    </Box>
  );
};

