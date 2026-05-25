import React from "react";

import { Alert, AlertIcon, Box, SimpleGrid, Stack, Text } from "@chakra-ui/react";
import { Building2, Calendar, FileText, Hammer, Truck, User, Wallet } from "lucide-react";

import { InputField } from "@widgets/contracts/components/InputField";
import { Section } from "@widgets/contracts/components/Section";
import { SelectField } from "@widgets/contracts/components/SelectField";

export interface SuministroFormValues {
  contractDate: string;
  supplierLegalRepName: string;
  supplierLegalRepDni: string;
  supplierAddress: string;
  supplierName: string;
  supplierTaxId: string;
  projectName: string;
  projectNumber: string;
  promoter: string;
  workStartDate: string;
  workEndDate: string;
  durationText: string;
  milestonesText: string;
  paymentMethod: string;
  paymentMethodOtherText: string;
  freightResponsible: string;
  unloadingResponsible: string;
  paymentDays: string;
}

export interface SuministroFormHandlers {
  onSupplierLegalRepNameChange: (value: string) => void;
  onSupplierLegalRepDniChange: (value: string) => void;
  onSupplierAddressChange: (value: string) => void;
  onSupplierNameChange: (value: string) => void;
  onSupplierTaxIdChange: (value: string) => void;
  onProjectNameChange: (value: string) => void;
  onProjectNumberChange: (value: string) => void;
  onPromoterChange: (value: string) => void;
  onWorkStartDateChange: (value: string) => void;
  onWorkEndDateChange: (value: string) => void;
  onDurationTextChange: (value: string) => void;
  onMilestonesTextChange: (value: string) => void;
  onPaymentMethodChange: (value: string) => void;
  onPaymentMethodOtherTextChange: (value: string) => void;
  onFreightResponsibleChange: (value: string) => void;
  onUnloadingResponsibleChange: (value: string) => void;
  onPaymentDaysChange: (value: string) => void;
}

interface SuministroFormProps extends SuministroFormValues, SuministroFormHandlers {}

const PAYMENT_OPTIONS = ["CONFIRMING", "TRANSFERENCIA", "PAGARÉ", "OTROS"];
const LOGISTICS_OPTIONS = ["URDECON", "PROVEEDOR"];

export const SuministroForm: React.FC<SuministroFormProps> = ({
  contractDate,
  supplierLegalRepName,
  supplierLegalRepDni,
  supplierAddress,
  supplierName,
  supplierTaxId,
  projectName,
  projectNumber,
  promoter,
  workStartDate,
  workEndDate,
  durationText,
  milestonesText,
  paymentMethod,
  paymentMethodOtherText,
  freightResponsible,
  unloadingResponsible,
  paymentDays,
  onSupplierLegalRepNameChange,
  onSupplierLegalRepDniChange,
  onSupplierAddressChange,
  onSupplierNameChange,
  onSupplierTaxIdChange,
  onProjectNameChange,
  onProjectNumberChange,
  onPromoterChange,
  onWorkStartDateChange,
  onWorkEndDateChange,
  onDurationTextChange,
  onMilestonesTextChange,
  onPaymentMethodChange,
  onPaymentMethodOtherTextChange,
  onFreightResponsibleChange,
  onUnloadingResponsibleChange,
  onPaymentDaysChange,
}) => {
  // Normalizar el valor entrante a MAYÚSCULAS para que coincida con las
  // opciones del <select>. El comparativo guarda "Confirming"/"Transferencia"
  // en CamelCase y aquí trabajamos con MAYÚSCULA (token [FORMA_PAGO] de la
  // plantilla). Sin esta normalización el browser no encuentra match y
  // renderiza el primer option (CONFIRMING) aunque el dato real sea otro.
  const normalizedPaymentMethod = (paymentMethod || "").toUpperCase().trim();
  const selectValue =
    PAYMENT_OPTIONS.find((option) => option === normalizedPaymentMethod) ?? "";
  const isPaymentOther = selectValue === "OTROS";

  // Mismo patrón para Portes/Descargas: el comparativo guarda "Proveedor"/
  // "Urdecon" (CamelCase) y las opciones están en MAYÚSCULAS. Sin match el
  // browser muestra el primer option (URDECON) aunque el valor real sea otro.
  const freightSelectValue =
    LOGISTICS_OPTIONS.find(
      (option) => option === (freightResponsible || "").toUpperCase().trim(),
    ) ?? "";
  const unloadingSelectValue =
    LOGISTICS_OPTIONS.find(
      (option) => option === (unloadingResponsible || "").toUpperCase().trim(),
    ) ?? "";

  return (
    <Stack spacing={8}>
      {/* [DIA] [MES] [ANIO] */}
      <Section icon={<Calendar size={18} />} title="Fecha del contrato">
        <InputField
          label="DIA / MES / AÑO"
          value={contractDate}
          disabled
          helper="Fecha de creación del contrato"
        />
      </Section>

      {/* [NOMBRE_GERENTE] [NIF_GERENTE] [DIRECCION_EMPRESA] */}
      <Section icon={<User size={18} />} title="Firmante por el proveedor">
        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
          <InputField
            label="Nombre gerente"
            value={supplierLegalRepName}
            onChange={onSupplierLegalRepNameChange}
            required
          />
          <InputField
            label="NIF gerente"
            value={supplierLegalRepDni}
            onChange={onSupplierLegalRepDniChange}
            required
          />
          <InputField
            label="Dirección empresa"
            value={supplierAddress}
            onChange={onSupplierAddressChange}
            required
            fullWidth
          />
        </SimpleGrid>
      </Section>

      {/* [RAZON_SOCIAL] [CIF] */}
      <Section icon={<Building2 size={18} />} title="Empresa proveedora">
        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
          <InputField
            label="Razón social"
            value={supplierName}
            onChange={onSupplierNameChange}
            required
          />
          <InputField
            label="CIF"
            value={supplierTaxId}
            onChange={onSupplierTaxIdChange}
            required
          />
        </SimpleGrid>
      </Section>

      {/* [NOMBRE_OBRA] [NUM_OBRA] [PROMOTORA] */}
      <Section icon={<Hammer size={18} />} title="Obra">
        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
          <InputField
            label="Nombre obra"
            value={projectName}
            onChange={onProjectNameChange}
          />
          <InputField
            label="Número de obra"
            value={projectNumber}
            onChange={onProjectNumberChange}
            required
          />
          <InputField
            label="Promotora"
            value={promoter}
            onChange={onPromoterChange}
            required
            fullWidth
          />
        </SimpleGrid>
      </Section>

      {/* [FECHA_INICIO] [FECHA_FIN] [DURACION_OBRA] */}
      <Section icon={<Calendar size={18} />} title="Plazos">
        <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
          <InputField
            label="Fecha inicio"
            type="date"
            value={workStartDate}
            onChange={onWorkStartDateChange}
            required
          />
          <InputField
            label="Fecha fin"
            type="date"
            value={workEndDate}
            onChange={onWorkEndDateChange}
            required
          />
          <InputField
            label="Duración obra"
            value={durationText}
            onChange={onDurationTextChange}
            helper="Texto libre, p. ej. 3 meses"
          />
        </SimpleGrid>
      </Section>

      {/* [HITOS] */}
      <Section icon={<FileText size={18} />} title="Hitos">
        <Text fontSize="sm" color="gray.600" mb={2}>
          Hitos o fases que se reflejarán en el contrato.
        </Text>
        <Box
          as="textarea"
          rows={4}
          value={milestonesText}
          onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
            onMilestonesTextChange(event.target.value)
          }
          placeholder="Definir hitos del contrato..."
          width="100%"
          border="1px solid"
          borderColor="gray.200"
          rounded="md"
          px={3}
          py={2}
          fontSize="sm"
        />
      </Section>

      {/* [FORMA_PAGO] + [TERMINO_PAGO] */}
      <Section icon={<Wallet size={18} />} title="Forma de pago">
        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
          <SelectField
            label="Forma de pago"
            options={PAYMENT_OPTIONS}
            value={selectValue}
            onChange={(event) => onPaymentMethodChange(event.target.value)}
          />
          <InputField
            label="Términos de pago"
            type="number"
            value={paymentDays}
            onChange={onPaymentDaysChange}
            helper="Plazo legal de pago en días. Se renderizará como '{N} días' en la plantilla."
          />
          {isPaymentOther && (
            <InputField
              label="Especificar forma de pago"
              value={paymentMethodOtherText}
              onChange={onPaymentMethodOtherTextChange}
              required
              fullWidth
            />
          )}
        </SimpleGrid>
        {isPaymentOther && (
          <Alert status="info" borderRadius="md" mt={3}>
            <AlertIcon />
            Si la forma de pago es "OTROS", el texto rellenado aquí es el que viaja al token [FORMA_PAGO] de la plantilla.
          </Alert>
        )}
      </Section>

      {/* [PORTES] [DESCARGAS] */}
      <Section icon={<Truck size={18} />} title="Logística">
        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
          <SelectField
            label="Portes"
            options={LOGISTICS_OPTIONS}
            value={freightSelectValue}
            onChange={(event) => onFreightResponsibleChange(event.target.value)}
          />
          <SelectField
            label="Descargas"
            options={LOGISTICS_OPTIONS}
            value={unloadingSelectValue}
            onChange={(event) => onUnloadingResponsibleChange(event.target.value)}
          />
        </SimpleGrid>
      </Section>
    </Stack>
  );
};
