import React from "react";

import { Box, Button, Divider, SimpleGrid, Text } from "@chakra-ui/react";
import { Users } from "lucide-react";

import { InputField } from "@widgets/contracts/components/InputField";
import { Section } from "@widgets/contracts/components/Section";

interface ContractSupplierSectionProps {
  supplierName: string;
  supplierTaxId: string;
  supplierContactName: string;
  supplierPhone: string;
  supplierEmail: string;
  supplierCity: string;
  supplierPostalCode: string;
  supplierCountry: string;
  supplierEmailNormalized: string;
  isSupplierEmailValid: boolean;
  isLookupLoading: boolean;
  lastLookupAutofillCount: number;
  isGeneratingSupplierLink: boolean;
  onSupplierNameChange: (value: string) => void;
  onSupplierTaxIdChange: (value: string) => void;
  onSupplierContactNameChange: (value: string) => void;
  onSupplierPhoneChange: (value: string) => void;
  onSupplierEmailChange: (value: string) => void;
  onSupplierCityChange: (value: string) => void;
  onSupplierPostalCodeChange: (value: string) => void;
  onSupplierCountryChange: (value: string) => void;
  onRegenerateSupplierLink: () => void;
}

export const ContractSupplierSection: React.FC<ContractSupplierSectionProps> = ({
  supplierName,
  supplierTaxId,
  supplierContactName,
  supplierPhone,
  supplierEmail,
  supplierCity,
  supplierPostalCode,
  supplierCountry,
  supplierEmailNormalized,
  isSupplierEmailValid,
  isLookupLoading,
  lastLookupAutofillCount,
  isGeneratingSupplierLink,
  onSupplierNameChange,
  onSupplierTaxIdChange,
  onSupplierContactNameChange,
  onSupplierPhoneChange,
  onSupplierEmailChange,
  onSupplierCityChange,
  onSupplierPostalCodeChange,
  onSupplierCountryChange,
  onRegenerateSupplierLink,
}) => {
  return (
    <Section icon={<Users size={18} />} title="SECCIÓN 2: Datos del Proveedor">
      <Box p={4} bg="blue.50" border="1px solid" borderColor="blue.200" rounded="lg" mb={4}>
        <Text fontSize="sm" color="blue.800">
          Datos precargados desde BD de Proveedores
        </Text>
      </Box>
      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
        <InputField label="Razón social / Empresa" value={supplierName} onChange={onSupplierNameChange} required />
        <InputField label="NIF/CIF" value={supplierTaxId} onChange={onSupplierTaxIdChange} required />
        <Box gridColumn={{ base: "span 1", md: "span 2" }}>
          <Divider />
        </Box>
        <InputField label="Nombre gerente / contacto" value={supplierContactName} onChange={onSupplierContactNameChange} />
        <InputField label="Teléfono" value={supplierPhone} onChange={onSupplierPhoneChange} />
        <InputField
          label="Email"
          value={supplierEmail}
          onChange={onSupplierEmailChange}
          isInvalid={supplierEmailNormalized.length > 0 && !isSupplierEmailValid}
          fullWidth
        />
        <InputField label="Ciudad" value={supplierCity} onChange={onSupplierCityChange} />
        <InputField label="CP" value={supplierPostalCode} onChange={onSupplierPostalCodeChange} />
        <InputField label="País" value={supplierCountry} onChange={onSupplierCountryChange} />
      </SimpleGrid>
      <Text fontSize="xs" color={isLookupLoading ? "blue.600" : "gray.500"} mt={3}>
        {isLookupLoading
          ? "Buscando proveedor por CIF..."
          : lastLookupAutofillCount > 0
            ? `CIF encontrado: se autocompletaron ${lastLookupAutofillCount} campos desde BD.`
            : "Al cambiar CIF se autocompleta desde BD."}
      </Text>
      {supplierEmailNormalized.length > 0 && !isSupplierEmailValid && (
        <Text fontSize="xs" color="red.500" mt={2}>
          Si informas email, debe tener formato válido.
        </Text>
      )}
      <Box mt={3}>
        <Button size="sm" variant="outline" isLoading={isGeneratingSupplierLink} loadingText="Generando..." onClick={onRegenerateSupplierLink}>
          Regenerar enlace proveedor
        </Button>
      </Box>
    </Section>
  );
};
