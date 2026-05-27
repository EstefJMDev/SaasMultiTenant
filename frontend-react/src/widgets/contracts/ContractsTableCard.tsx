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

import type { Contract } from "@entities/contracts";
import { formatAmount, formatDate } from "@shared/utils/erp/invoices";

interface ContractsTableCardProps {
  contracts: Contract[];
  isLoading: boolean;
  onOpenDetails?: (contract: Contract) => void;
}

const statusLabelMap: Record<string, string> = {
  DRAFT: "Borrador",
  PENDING_SUPPLIER: "Pendiente Proveedor",
  PENDING_JEFE_OBRA: "Pendiente Jefe de Obra",
  PENDING_GERENCIA: "Pendiente Gerencia",
  PENDING_DEPARTAMENTOS: "Pendiente Departamentos",
  PENDING_ADMIN: "Pendiente Administraci?n",
  PENDING_COMPRAS: "Pendiente Compras",
  PENDING_JURIDICO: "Pendiente Jur?dico",
  IN_SIGNATURE: "En firma",
  SIGNED: "Firmado",
  REJECTED: "Rechazado",
};

const statusColorMap: Record<string, string> = {
  DRAFT: "gray",
  PENDING_SUPPLIER: "yellow",
  PENDING_JEFE_OBRA: "orange",
  PENDING_GERENCIA: "purple",
  PENDING_DEPARTAMENTOS: "orange",
  PENDING_ADMIN: "orange",
  PENDING_COMPRAS: "orange",
  PENDING_JURIDICO: "orange",
  IN_SIGNATURE: "blue",
  SIGNED: "brand",
  REJECTED: "red",
};

export const ContractsTableCard: React.FC<ContractsTableCardProps> = ({
  contracts,
  isLoading,
  onOpenDetails,
}) => {
  const cardBg = useColorModeValue("white", "gray.700");
  const panelBg = useColorModeValue("gray.50", "gray.800");
  const subtleText = useColorModeValue("gray.600", "gray.300");
  const borderColor = useColorModeValue("gray.200", "gray.600");

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
                d="M6,2H14L20,8V22H6A2,2 0 0,1 4,20V4A2,2 0 0,1 6,2M13,9V3.5L18.5,9H13Z"
              />
            </Icon>
          </Box>
          <Heading size="md" fontWeight="bold">
            Contratos
          </Heading>
          <Badge
            colorScheme="brand"
            fontSize="sm"
            px={3}
            py={1}
            borderRadius="full"
            fontWeight="bold"
          >
            {contracts.length} expedientes
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
              <Th py={4} fontSize="xs" fontWeight="bold" textTransform="uppercase">
                ID
              </Th>
              <Th py={4} fontSize="xs" fontWeight="bold" textTransform="uppercase">
                Tipo
              </Th>
              <Th py={4} fontSize="xs" fontWeight="bold" textTransform="uppercase">
                Proveedor
              </Th>
              <Th py={4} fontSize="xs" fontWeight="bold" textTransform="uppercase">
                Importe
              </Th>
              <Th py={4} fontSize="xs" fontWeight="bold" textTransform="uppercase">
                Creado
              </Th>
              <Th py={4} fontSize="xs" fontWeight="bold" textTransform="uppercase">
                Estado
              </Th>
              {onOpenDetails && (
                <Th py={4} fontSize="xs" fontWeight="bold" textTransform="uppercase">
                  Acciones
                </Th>
              )}
            </Tr>
          </Thead>
          <Tbody>
            {contracts.map((contract) => (
              <Tr key={contract.id} transition="all 0.2s">
                <Td py={4}>
                  <Text fontWeight="bold" fontFamily="mono" fontSize="sm">
                    {contract.id}
                  </Text>
                </Td>
                <Td py={4}>
                  <Text fontSize="sm" fontWeight="medium">
                    {contract.type}
                  </Text>
                </Td>
                <Td py={4}>
                  <Text fontSize="sm" fontWeight="medium" noOfLines={2}>
                    {contract.supplier_display_name || contract.supplier_name || "-"}
                  </Text>
                </Td>
                <Td py={4}>
                  <Text fontWeight="bold" color="brand.600" fontFamily="mono">
                    {formatAmount(contract.total_amount, contract.currency)}
                  </Text>
                </Td>
                <Td py={4}>
                  <Text fontSize="sm">{formatDate(contract.created_at)}</Text>
                </Td>
                <Td py={4}>
                  <Badge
                    colorScheme={statusColorMap[contract.status] ?? "gray"}
                    px={3}
                    py={1}
                    borderRadius="full"
                    fontSize="xs"
                    fontWeight="bold"
                  >
                    {statusLabelMap[contract.status] ?? contract.status}
                  </Badge>
                </Td>
                {onOpenDetails && (
                  <Td py={4}>
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => onOpenDetails(contract)}
                      borderRadius="lg"
                      _hover={{ bg: "blue.50", color: "blue.600" }}
                    >
                      Ver / Editar
                    </Button>
                  </Td>
                )}
              </Tr>
            ))}
            {contracts.length === 0 && !isLoading && (
              <Tr>
                <Td colSpan={6} textAlign="center" py={16}>
                  <VStack spacing={3}>
                    <Icon viewBox="0 0 24 24" boxSize={16} color="gray.300">
                      <path
                        fill="currentColor"
                        d="M6,2H14L20,8V22H6A2,2 0 0,1 4,20V4A2,2 0 0,1 6,2M13,9V3.5L18.5,9H13Z"
                      />
                    </Icon>
                    <Text fontSize="lg" fontWeight="semibold" color="gray.600">
                      No hay contratos para mostrar
                    </Text>
                    <Text fontSize="sm" color={subtleText}>
                      Ajusta los filtros o crea un nuevo expediente
                    </Text>
                  </VStack>
                </Td>
              </Tr>
            )}
          </Tbody>
        </Table>
      </Box>
    </Box>
  );
};


