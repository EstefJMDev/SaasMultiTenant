import React from "react";

import { Box, SimpleGrid, Stack, Text } from "@chakra-ui/react";
import {
  Building2,
  Calendar,
  FileText,
  Hammer,
  Scale,
  ShieldCheck,
  User,
  Users,
  Wallet,
} from "lucide-react";

import { InputField } from "@widgets/contracts/components/InputField";
import { Section } from "@widgets/contracts/components/Section";
import { SelectField } from "@widgets/contracts/components/SelectField";

export interface SubcontratacionFormValues {
  contractDate: string;
  supplierLegalRepName: string;
  supplierLegalRepDni: string;
  supplierAddress: string;
  supplierName: string;
  supplierTaxId: string;
  deedType: string;
  deedDate: string;
  notaryName: string;
  notaryProtocol: string;
  projectName: string;
  projectNumber: string;
  promoter: string;
  workStartDate: string;
  workEndDate: string;
  durationText: string;
  milestonesText: string;
  paymentMethod: string;
  paymentDays: string;
  paymentMethodOtherText: string;
  priceNumber: string;
  priceText: string;
  numWorkers: string;
  warrantyText: string;
}

export interface SubcontratacionFormHandlers {
  onSupplierLegalRepNameChange: (value: string) => void;
  onSupplierLegalRepDniChange: (value: string) => void;
  onSupplierAddressChange: (value: string) => void;
  onSupplierNameChange: (value: string) => void;
  onSupplierTaxIdChange: (value: string) => void;
  onDeedTypeChange: (value: string) => void;
  onDeedDateChange: (value: string) => void;
  onNotaryNameChange: (value: string) => void;
  onNotaryProtocolChange: (value: string) => void;
  onProjectNumberChange: (value: string) => void;
  onPromoterChange: (value: string) => void;
  onWorkStartDateChange: (value: string) => void;
  onWorkEndDateChange: (value: string) => void;
  onDurationTextChange: (value: string) => void;
  onMilestonesTextChange: (value: string) => void;
  onPaymentMethodChange: (value: string) => void;
  onPaymentDaysChange: (value: string) => void;
  onPaymentMethodOtherTextChange: (value: string) => void;
  onPriceNumberChange: (value: string) => void;
  onNumWorkersChange: (value: string) => void;
  onWarrantyTextChange: (value: string) => void;
}

interface SubcontratacionFormProps
  extends SubcontratacionFormValues,
    SubcontratacionFormHandlers {}

const PAYMENT_OPTIONS = ["CONFIRMING", "TRANSFERENCIA", "PAGARÉ", "OTROS"];

export const SubcontratacionForm: React.FC<SubcontratacionFormProps> = ({
  contractDate,
  supplierLegalRepName,
  supplierLegalRepDni,
  supplierAddress,
  supplierName,
  supplierTaxId,
  deedType,
  deedDate,
  notaryName,
  notaryProtocol,
  projectName,
  projectNumber,
  promoter,
  workStartDate,
  workEndDate,
  durationText,
  milestonesText,
  paymentMethod,
  paymentDays,
  paymentMethodOtherText,
  priceNumber,
  priceText,
  numWorkers,
  warrantyText,
  onSupplierLegalRepNameChange,
  onSupplierLegalRepDniChange,
  onSupplierAddressChange,
  onSupplierNameChange,
  onSupplierTaxIdChange,
  onDeedTypeChange,
  onDeedDateChange,
  onNotaryNameChange,
  onNotaryProtocolChange,
  onProjectNumberChange,
  onPromoterChange,
  onWorkStartDateChange,
  onWorkEndDateChange,
  onDurationTextChange,
  onMilestonesTextChange,
  onPaymentMethodChange,
  onPaymentDaysChange,
  onPaymentMethodOtherTextChange,
  onPriceNumberChange,
  onNumWorkersChange,
  onWarrantyTextChange,
}) => {
  // Normalizar a MAYÚSCULAS para que el comparativo (CamelCase) encaje con las
  // opciones del <select>. Sin esto el browser cae al primer option silenciosamente.
  const normalizedPaymentMethod = (paymentMethod || "").toUpperCase().trim();
  const paymentSelectValue =
    PAYMENT_OPTIONS.find((option) => option === normalizedPaymentMethod) ?? "";
  const isPaymentOther = paymentSelectValue === "OTROS";

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

      {/* [TIPO_ESCRITURA] [FECHA_ESCRITURA] [NOMBRE_NOTARIO] [NUMERO_PROTOCOLO] */}
      <Section icon={<Scale size={18} />} title="Escritura del proveedor">
        <Text fontSize="sm" color="gray.600" mb={3}>
          Datos de constitución. Por defecto se cargan desde la ficha del
          proveedor (tabla `proveedores`); aquí puedes corregirlos para este
          contrato.
        </Text>
        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
          <InputField
            label="Tipo de escritura"
            value={deedType}
            onChange={onDeedTypeChange}
          />
          <InputField
            label="Fecha de escritura"
            type="date"
            value={deedDate}
            onChange={onDeedDateChange}
          />
          <InputField
            label="Nombre del notario"
            value={notaryName}
            onChange={onNotaryNameChange}
          />
          <InputField
            label="Número de protocolo"
            value={notaryProtocol}
            onChange={onNotaryProtocolChange}
          />
        </SimpleGrid>
      </Section>

      {/* [NOMBRE_OBRA] [NUM_OBRA / NUMERO_OBRA] [PROMOTORA] */}
      <Section icon={<Hammer size={18} />} title="Obra">
        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
          <InputField
            label="Nombre obra"
            value={projectName}
            disabled
            helper="Vinculada al comparativo"
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

      {/* [FECHA_INICIO] [FECHA_FIN / FIN_OBRA] [DURACION_OBRA] */}
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

      {/* [FORMA_PAGO] */}
      <Section icon={<Wallet size={18} />} title="Forma de pago">
        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
          <SelectField
            label="Forma de pago"
            options={PAYMENT_OPTIONS}
            value={paymentSelectValue}
            onChange={(event) => onPaymentMethodChange(event.target.value)}
          />
          <InputField
            label="Términos de pago"
            type="number"
            value={paymentDays}
            onChange={onPaymentDaysChange}
            helper="Plazo legal de pago en días. Se renderiza junto al método."
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
      </Section>

      {/* [PRECIO_NUMERO] [PRECIO_LETRA] */}
      <Section icon={<Wallet size={18} />} title="Precio de la ejecución">
        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
          <InputField
            label="Precio (€)"
            value={priceNumber}
            onChange={onPriceNumberChange}
            required
            helper="Número. La versión en letras se calcula automáticamente."
          />
          <InputField
            label="Precio en letras"
            value={priceText}
            disabled
            helper="Generado automáticamente desde el importe"
          />
        </SimpleGrid>
      </Section>

      {/* [NUM_TRAB] [NUM_TRAB_LETRA] */}
      <Section icon={<Users size={18} />} title="Trabajadores en obra">
        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
          <InputField
            label="Número de trabajadores"
            type="number"
            value={numWorkers}
            onChange={onNumWorkersChange}
            required
          />
        </SimpleGrid>
      </Section>

      {/* [GARANTIA] */}
      <Section icon={<ShieldCheck size={18} />} title="Garantía">
        <Box
          as="textarea"
          rows={3}
          value={warrantyText}
          onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
            onWarrantyTextChange(event.target.value)
          }
          placeholder="Importe o texto de la garantía..."
          width="100%"
          border="1px solid"
          borderColor="gray.200"
          rounded="md"
          px={3}
          py={2}
          fontSize="sm"
        />
      </Section>
    </Stack>
  );
};
