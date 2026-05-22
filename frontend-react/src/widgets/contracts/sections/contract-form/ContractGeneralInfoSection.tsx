import React from "react";

import { SimpleGrid } from "@chakra-ui/react";
import { FileText } from "lucide-react";

import type { ContractType } from "@entities/contracts";

import { InputField } from "@widgets/contracts/components/InputField";
import { Section } from "@widgets/contracts/components/Section";
import { SelectField } from "@widgets/contracts/components/SelectField";

interface ContractGeneralInfoSectionProps {
  contractId?: number;
  tipoContrato: ContractType;
  title: string;
  onTipoContratoChange: (value: ContractType) => void;
  onTitleChange: (value: string) => void;
  formatContractType: (value: ContractType) => string;
}

export const ContractGeneralInfoSection: React.FC<
  ContractGeneralInfoSectionProps
> = ({
  contractId,
  tipoContrato,
  title,
  onTipoContratoChange,
  onTitleChange,
  formatContractType,
}) => {
  return (
    <Section icon={<FileText size={18} />} title="SECCIÓN 1: Información General">
      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
        <InputField
          label="ID Contrato"
          defaultValue={contractId ? `CT-${contractId}` : "Auto-generado"}
          disabled
          helper="Generado automáticamente"
        />
        <SelectField label="Tipo Documento" options={["CONTRATO"]} />
        <SelectField
          label="Tipo Contrato"
          options={["SUBCONTRATACIÓN", "SUMINISTRO", "SERVICIO"]}
          value={formatContractType(tipoContrato)}
          onChange={(e) =>
            onTipoContratoChange(
              (e.target.value as string).replace(
                "SUBCONTRATACIÓN",
                "SUBCONTRATACION",
              ) as ContractType,
            )
          }
        />
        <InputField label="Título" value={title} onChange={onTitleChange} required />
      </SimpleGrid>
    </Section>
  );
};
