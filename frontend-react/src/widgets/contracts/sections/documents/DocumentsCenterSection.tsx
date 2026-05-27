import React from "react";

import { FormControl, FormLabel, Select } from "@chakra-ui/react";

import type { Contract } from "@entities/contracts";

import { CardContainer } from "@widgets/contracts/components/CardContainer";

interface DocumentsCenterSectionProps {
  cardBg: string;
  borderColor: string;
  selectedContractId: string;
  contracts: Contract[];
  onContractChange: (value: string) => void;
  formatContractType: (value: Contract["type"]) => string;
}

export const DocumentsCenterSection: React.FC<DocumentsCenterSectionProps> = ({
  cardBg,
  borderColor,
  selectedContractId,
  contracts,
  onContractChange,
  formatContractType,
}) => {
  return (
    <CardContainer bg={cardBg} borderColor={borderColor} p={5}>
      <FormControl maxW="360px">
        <FormLabel fontSize="sm" fontWeight="semibold">
          Contrato
        </FormLabel>
        <Select
          value={selectedContractId}
          onChange={(event) => onContractChange(event.target.value)}
          placeholder="Selecciona contrato"
        >
          {contracts.map((contract) => (
            <option key={contract.id} value={contract.id}>
              {`CT-${contract.id} | ${formatContractType(contract.type)} | ${contract.supplier_display_name ?? contract.supplier_name ?? "Sin proveedor"}`}
            </option>
          ))}
        </Select>
      </FormControl>
    </CardContainer>
  );
};
