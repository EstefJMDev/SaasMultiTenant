import React from "react";

import {
  Alert,
  AlertIcon,
  Box,
  HStack,
  Radio,
  RadioGroup,
  SimpleGrid,
  Stack,
  Text,
} from "@chakra-ui/react";

import { InputField } from "@widgets/contracts/components/InputField";
import { Section } from "@widgets/contracts/components/Section";
import { SelectField } from "@widgets/contracts/components/SelectField";

interface ContractEconomicSectionProps {
  priceType: string;
  totalExecutionPrice: string;
  priceText: string;
  paymentMethod: string;
  insuranceAmount: string;
  retention: string;
  onPriceTypeChange: (value: string) => void;
  onTotalExecutionPriceChange: (value: string) => void;
  onPriceTextChange: (value: string) => void;
  onPaymentMethodChange: (value: string) => void;
  onInsuranceAmountChange: (value: string) => void;
  onRetentionChange: (value: string) => void;
}

export const ContractEconomicSection: React.FC<ContractEconomicSectionProps> = ({
  priceType,
  totalExecutionPrice,
  priceText,
  paymentMethod,
  insuranceAmount,
  retention,
  onPriceTypeChange,
  onTotalExecutionPriceChange,
  onPriceTextChange,
  onPaymentMethodChange,
  onInsuranceAmountChange,
  onRetentionChange,
}) => {
  return (
    <Section icon={<span>?</span>} title="SECCIÓN 3: Condiciones Económicas">
      <Stack spacing={4}>
        <Box>
          <Text fontSize="sm" fontWeight="semibold" mb={2}>
            Tipo Precio
          </Text>
          <RadioGroup value={priceType} onChange={onPriceTypeChange}>
            <HStack spacing={6}>
              <Radio value="CERRADO">CERRADO</Radio>
              <Radio value="EJECUTADO EN OBRA">EJECUTADO EN OBRA</Radio>
            </HStack>
          </RadioGroup>
        </Box>
        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
          <InputField label="Precio total de la ejecución" value={totalExecutionPrice} onChange={onTotalExecutionPriceChange} suffix="€" required />
          <InputField label="Precio (letras)" value={priceText} onChange={onPriceTextChange} required />
          <SelectField
            label="Forma de Pago"
            options={["CONFIRMING 60", "CONFIRMING 120", "OTRAS"]}
            value={paymentMethod}
            onChange={(event) => onPaymentMethodChange(event.target.value)}
          />
          <InputField label="Seguro" value={insuranceAmount} onChange={onInsuranceAmountChange} suffix="€" required />
        </SimpleGrid>
        {paymentMethod === "OTRAS" && (
          <Alert status="warning" borderRadius="md">
            <AlertIcon />
            El contrato queda bloqueado hasta aprobaci?n de Administraci?n, Compras y Jurídico.
          </Alert>
        )}
        <Box>
          <Text fontSize="sm" fontWeight="semibold" mb={2}>
            Retención
          </Text>
          <RadioGroup value={retention} onChange={onRetentionChange}>
            <HStack spacing={6}>
              <Radio value="SI">Sí</Radio>
              <Radio value="NO">NO</Radio>
            </HStack>
          </RadioGroup>
        </Box>
      </Stack>
    </Section>
  );
};
