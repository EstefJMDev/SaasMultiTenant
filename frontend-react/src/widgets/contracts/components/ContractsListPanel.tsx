import React from "react";
import { Box, Button, HStack, Table, Tbody, Td, Text, Th, Thead, Tr } from "@chakra-ui/react";
import { CardContainer } from "./CardContainer";
import { CardHeader } from "./CardHeader";
import type { Contract } from "@entities/contracts";
import type { ContractStatus } from "@api/contracts";
import type { ViewState } from "../types";

interface ContractsListPanelProps {
  contracts: Contract[];
  cardBg: string;
  borderColor: string;
  defaultOpenView: ViewState;
  onSelectContract: (contract: Contract, view: ViewState) => void;
  onEditContract: (contract: Contract) => void;
  onDeleteContract: (contract: Contract) => void;
  formatContractType: (type?: string | null) => string;
  formatContractStatus: (status?: string | null) => string;
  formatDate: (value?: string | null) => string;
}

export const ContractsListPanel: React.FC<ContractsListPanelProps> = ({
  contracts,
  cardBg,
  borderColor,
  defaultOpenView,
  onSelectContract,
  onEditContract,
  onDeleteContract,
  formatContractType,
  formatContractStatus,
  formatDate,
}) => {
  const editableStatuses: ContractStatus[] = ["DRAFT"];
  const deletableStatuses: ContractStatus[] = ["DRAFT", "REJECTED"];

  return (
    <CardContainer bg={cardBg} borderColor={borderColor} overflow="hidden">
      <CardHeader borderColor={borderColor} title="Listado de Contratos" />
      <Box
        overflowX="auto"
        sx={{
          "& th, & td": { paddingInlineStart: "1.5rem", paddingInlineEnd: "1.5rem" },
        }}
      >
        <Table size="sm">
          <Thead>
            <Tr>
              <Th>Contrato</Th>
              <Th>Tipo</Th>
              <Th>Estado</Th>
              <Th>Proveedor</Th>
              <Th>Actualizado</Th>
              <Th textAlign="right">Acciones</Th>
            </Tr>
          </Thead>
          <Tbody>
            {contracts.map((contract) => (
              <Tr key={contract.id}>
                <Td fontWeight="semibold">CT-{contract.id}</Td>
                <Td>{formatContractType(contract.type)}</Td>
                <Td>{formatContractStatus(contract.status)}</Td>
                <Td>{contract.supplier_name ?? "Pendiente"}</Td>
                <Td>{formatDate(contract.updated_at)}</Td>
                <Td>
                  <HStack justify="flex-end" spacing={2}>
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => onSelectContract(contract, defaultOpenView)}
                    >
                      Ver
                    </Button>
                    <Button
                      size="xs"
                      colorScheme="blue"
                      variant="outline"
                      onClick={() => onEditContract(contract)}
                      isDisabled={!editableStatuses.includes(contract.status)}
                    >
                      Editar
                    </Button>
                    <Button
                      size="xs"
                      colorScheme="red"
                      variant="outline"
                      onClick={() => onDeleteContract(contract)}
                      isDisabled={!deletableStatuses.includes(contract.status)}
                    >
                      Eliminar
                    </Button>
                  </HStack>
                </Td>
              </Tr>
            ))}
            {contracts.length === 0 && (
              <Tr>
                <Td colSpan={6}>
                  <Text fontSize="sm" color="gray.500">
                    No hay contratos todavía.
                  </Text>
                </Td>
              </Tr>
            )}
          </Tbody>
        </Table>
      </Box>
    </CardContainer>
  );
};
