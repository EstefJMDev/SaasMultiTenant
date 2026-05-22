import React from "react";
import {
  Badge,
  Box,
  Button,
  Flex,
  Heading,
  HStack,
  Icon,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  useColorModeValue,
  VStack,
} from "@chakra-ui/react";

import type { Invoice } from "@api/invoices";
import { formatAmount, formatDate } from "@shared/utils/erp/invoices";

interface InvoicesTableCardProps {
  invoices: Invoice[];
  isLoading: boolean;
  onOpenDetails: (invoice: Invoice) => void;
  onDownload: (invoice: Invoice) => void;
  onMarkPaid: (invoiceId: number) => void;
  onReprocess: (invoiceId: number) => void;
  onDelete: (invoiceId: number) => void;
  isMarkingPaid: boolean;
  isReprocessing: boolean;
  isDeleting: boolean;
  totalAmount: number;
  pendingAmount: number;
  paidAmount: number;
}

export const InvoicesTableCard: React.FC<InvoicesTableCardProps> = ({
  invoices,
  isLoading,
  onOpenDetails,
  onDownload,
  onMarkPaid,
  onReprocess,
  onDelete,
  isMarkingPaid,
  isReprocessing,
  isDeleting,
  totalAmount,
  pendingAmount,
  paidAmount,
}) => {
  const cardBg = useColorModeValue("white", "gray.700");
  const panelBg = useColorModeValue("gray.50", "gray.800");
  const subtleText = useColorModeValue("gray.600", "gray.300");
  const borderColor = useColorModeValue("gray.200", "gray.600");

  const resolveStatusMeta = (status: Invoice["status"]) => {
    switch (status) {
      case "paid":
        return { label: "Pagada", colorScheme: "brand" as const };
      case "uploaded":
        return { label: "Subida", colorScheme: "gray" as const };
      case "extracting":
        return { label: "Extrayendo", colorScheme: "blue" as const };
      case "extracted":
        return { label: "Extraída", colorScheme: "cyan" as const };
      case "suggested":
        return { label: "Sugerida", colorScheme: "purple" as const };
      case "validated":
        return { label: "Validada", colorScheme: "green" as const };
      case "pending":
        return { label: "Pendiente", colorScheme: "orange" as const };
      case "failed":
        return { label: "Fallida", colorScheme: "red" as const };
      default:
        return { label: status, colorScheme: "gray" as const };
    }
  };

  return (
    <Box
      bg={cardBg}
      borderRadius="2xl"
      borderWidth="1px"
      borderColor={borderColor}
      boxShadow="xl"
      overflow="hidden"
    >
      <Flex
        align="center"
        justify="space-between"
        px={6}
        py={5}
        bg={panelBg}
        borderBottomWidth="1px"
        borderColor={borderColor}
      >
        <HStack spacing={3}>
          <Box
            w="10"
            h="10"
            bgGradient="linear(to-br, brand.500, brand.600)"
            borderRadius="xl"
            display="flex"
            alignItems="center"
            justifyContent="center"
          >
            <Icon viewBox="0 0 24 24" boxSize={5} color="white">
              <path
                fill="currentColor"
                d="M19,3H5C3.89,3 3,3.89 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5C21,3.89 20.1,3 19,3M19,5V19H5V5H19Z"
              />
            </Icon>
          </Box>
          <Heading size="md" fontWeight="bold">
            Listado
          </Heading>
          <Badge
            colorScheme="brand"
            fontSize="sm"
            px={3}
            py={1}
            borderRadius="full"
            fontWeight="bold"
          >
            {invoices.length} facturas
          </Badge>
        </HStack>
        <Text color={subtleText} fontSize="sm">
          {isLoading && "Cargando..."}
        </Text>
      </Flex>

      <Box overflowX="auto">
        <Table size="sm" variant="simple">
          <Thead bg={panelBg}>
            <Tr>
              <Th
                textTransform="uppercase"
                fontSize="xs"
                fontWeight="bold"
                letterSpacing="wide"
                py={4}
              >
                Nº Factura
              </Th>
              <Th
                textTransform="uppercase"
                fontSize="xs"
                fontWeight="bold"
                letterSpacing="wide"
                py={4}
              >
                Importe
              </Th>
              <Th
                textTransform="uppercase"
                fontSize="xs"
                fontWeight="bold"
                letterSpacing="wide"
                py={4}
              >
                Emisión
              </Th>
              <Th
                textTransform="uppercase"
                fontSize="xs"
                fontWeight="bold"
                letterSpacing="wide"
                py={4}
              >
                Pago
              </Th>
              <Th
                textTransform="uppercase"
                fontSize="xs"
                fontWeight="bold"
                letterSpacing="wide"
                py={4}
              >
                Vencimiento
              </Th>
              <Th
                textTransform="uppercase"
                fontSize="xs"
                fontWeight="bold"
                letterSpacing="wide"
                py={4}
              >
                Proveedor
              </Th>
              <Th
                textTransform="uppercase"
                fontSize="xs"
                fontWeight="bold"
                letterSpacing="wide"
                py={4}
              >
                Estado
              </Th>
              <Th
                textTransform="uppercase"
                fontSize="xs"
                fontWeight="bold"
                letterSpacing="wide"
                py={4}
                textAlign="right"
              >
                Acciones
              </Th>
            </Tr>
          </Thead>
          <Tbody>
            {invoices.map((invoice) => (
              <Tr
                key={invoice.id}
                transition="all 0.2s"
                borderLeftWidth="3px"
                borderLeftColor="transparent"
                _hover={{
                  borderLeftColor: "brand.500",
                }}
              >
                {(() => {
                  const statusMeta = resolveStatusMeta(invoice.status);
                  const hasExtractedCore =
                    Boolean(invoice.invoice_number) ||
                    Boolean(invoice.supplier_name) ||
                    invoice.total_amount != null;
                  const invoiceLabel = invoice.invoice_number || `ID-${invoice.id}`;
                  const issueOrCreated = invoice.issue_date ?? invoice.created_at;
                  const providerLabel =
                    invoice.supplier_name || invoice.original_filename || "-";
                  return (
                    <>
                <Td py={4}>
                  <Text fontWeight="bold" fontFamily="mono" fontSize="sm">
                    {invoiceLabel}
                  </Text>
                </Td>
                <Td py={4}>
                  <Text fontWeight="bold" color="brand.700" fontFamily="mono">
                    {invoice.total_amount != null
                      ? formatAmount(invoice.total_amount, invoice.currency)
                      : "-"}
                  </Text>
                </Td>
                <Td py={4}>
                  <Text fontSize="sm">{formatDate(issueOrCreated)}</Text>
                </Td>
                <Td py={4}>
                  <Text
                    fontSize="sm"
                    fontWeight={invoice.paid_at ? "semibold" : "normal"}
                    color={invoice.paid_at ? "brand.600" : "gray.400"}
                  >
                    {formatDate(invoice.paid_at)}
                  </Text>
                </Td>
                <Td py={4}>
                  <Text fontSize="sm">{formatDate(invoice.due_date)}</Text>
                </Td>
                <Td py={4}>
                  <Text fontSize="sm" fontWeight="medium" noOfLines={2}>
                    {providerLabel}
                  </Text>
                </Td>
                <Td py={4}>
                  <VStack align="start" spacing={1}>
                    <Badge
                      colorScheme={statusMeta.colorScheme}
                      px={3}
                      py={1}
                      borderRadius="full"
                      fontSize="xs"
                      fontWeight="bold"
                      display="inline-flex"
                      alignItems="center"
                      gap={1}
                    >
                      <Icon viewBox="0 0 24 24" boxSize={3}>
                        <path
                          fill="currentColor"
                          d="M12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22C6.47,22 2,17.5 2,12A10,10 0 0,1 12,2M12.5,7V12.25L17,14.92L16.25,16.15L11,13V7H12.5Z"
                        />
                      </Icon>
                      {statusMeta.label}
                    </Badge>
                    {!hasExtractedCore &&
                      (invoice.status === "uploaded" ||
                        invoice.status === "extracting") && (
                        <Text fontSize="xs" color={subtleText}>
                          Pendiente de extracción
                        </Text>
                      )}
                  </VStack>
                </Td>
                <Td py={4}>
                  <HStack spacing={1} justify="flex-end">
                    <Button
                      size="xs"
                      variant="outline"
                      colorScheme="blue"
                      onClick={() => onOpenDetails(invoice)}
                      borderRadius="lg"
                    >
                      Ver
                    </Button>
                    <Button
                      size="xs"
                      variant="outline"
                      colorScheme="gray"
                      onClick={() => onDownload(invoice)}
                      borderRadius="lg"
                    >
                      Descargar
                    </Button>
                    {invoice.status !== "paid" && (
                      <Button
                        size="xs"
                        colorScheme="brand"
                        onClick={() => onMarkPaid(invoice.id)}
                        isLoading={isMarkingPaid}
                        borderRadius="lg"
                        fontWeight="semibold"
                      >
                        Pagar
                      </Button>
                    )}
                    <Button
                      size="xs"
                      variant="outline"
                      colorScheme="blue"
                      onClick={() => onReprocess(invoice.id)}
                      isLoading={isReprocessing}
                      borderRadius="lg"
                    >
                      Reprocesar
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      colorScheme="red"
                      onClick={() => {
                        if (
                          window.confirm(
                            "¿Seguro que quieres eliminar esta factura?",
                          )
                        ) {
                          onDelete(invoice.id);
                        }
                      }}
                      isLoading={isDeleting}
                      borderRadius="lg"
                    >
                      Eliminar
                    </Button>
                  </HStack>
                </Td>
                    </>
                  );
                })()}
              </Tr>
            ))}
            {invoices.length === 0 && !isLoading && (
              <Tr>
                <Td colSpan={8} textAlign="center" py={16}>
                  <VStack spacing={3}>
                    <Icon viewBox="0 0 24 24" boxSize={16} color="gray.300">
                      <path
                        fill="currentColor"
                        d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"
                      />
                    </Icon>
                    <Text
                      fontSize="lg"
                      fontWeight="semibold"
                      color="gray.600"
                    >
                      No hay facturas para mostrar
                    </Text>
                    <Text fontSize="sm" color={subtleText}>
                      Intenta ajustar tus filtros o sube una nueva factura
                    </Text>
                  </VStack>
                </Td>
              </Tr>
            )}
          </Tbody>
        </Table>
      </Box>

      <Box
        px={6}
        py={5}
        bg={panelBg}
        borderTopWidth="1px"
        borderColor={borderColor}
      >
        <Flex align="center" justify="space-between" wrap="wrap" gap={4}>
          <Text fontSize="sm" color={subtleText}>
            Mostrando{" "}
            <Text as="span" fontWeight="bold" color="gray.900">
              {invoices.length}
            </Text>{" "}
            facturas
          </Text>
          <HStack
            spacing={6}
            fontSize="sm"
            fontFamily="mono"
            fontWeight="semibold"
          >
            <HStack>
              <Text color={subtleText}>Total:</Text>
              <Text color="gray.900">{formatAmount(totalAmount, "EUR")}</Text>
            </HStack>
            <HStack>
              <Text color={subtleText}>Pendiente:</Text>
              <Text color="orange.600">
                {formatAmount(pendingAmount, "EUR")}
              </Text>
            </HStack>
            <HStack>
              <Text color={subtleText}>Pagado:</Text>
              <Text color="brand.600">{formatAmount(paidAmount, "EUR")}</Text>
            </HStack>
          </HStack>
        </Flex>
      </Box>
    </Box>
  );
};

