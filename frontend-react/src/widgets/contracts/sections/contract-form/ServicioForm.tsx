import React from "react";

import { SimpleGrid, Stack } from "@chakra-ui/react";
import { Briefcase, Building2, Calendar, Hammer, User, Wallet } from "lucide-react";

import { InputField } from "@widgets/contracts/components/InputField";
import { Section } from "@widgets/contracts/components/Section";
import { SelectField } from "@widgets/contracts/components/SelectField";

export interface ServicioFormValues {
  contractDate: string;
  supplierLegalRepName: string;
  supplierLegalRepDni: string;
  supplierAddress: string;
  supplierName: string;
  supplierTaxId: string;
  projectName: string;
  serviceType: string;
  workStartDate: string;
  workEndDate: string;
  paymentMethod: string;
  paymentDays: string;
  paymentMethodOtherText: string;
}

export interface ServicioFormHandlers {
  onSupplierLegalRepNameChange: (value: string) => void;
  onSupplierLegalRepDniChange: (value: string) => void;
  onSupplierAddressChange: (value: string) => void;
  onSupplierNameChange: (value: string) => void;
  onSupplierTaxIdChange: (value: string) => void;
  onServiceTypeChange: (value: string) => void;
  onWorkStartDateChange: (value: string) => void;
  onWorkEndDateChange: (value: string) => void;
  onPaymentMethodChange: (value: string) => void;
  onPaymentDaysChange: (value: string) => void;
  onPaymentMethodOtherTextChange: (value: string) => void;
}

interface ServicioFormProps extends ServicioFormValues, ServicioFormHandlers {}

const PAYMENT_OPTIONS = ["CONFIRMING", "TRANSFERENCIA", "PAGARÉ", "OTROS"];

export const ServicioForm: React.FC<ServicioFormProps> = ({
  contractDate,
  supplierLegalRepName,
  supplierLegalRepDni,
  supplierAddress,
  supplierName,
  supplierTaxId,
  projectName,
  serviceType,
  workStartDate,
  workEndDate,
  paymentMethod,
  paymentDays,
  paymentMethodOtherText,
  onSupplierLegalRepNameChange,
  onSupplierLegalRepDniChange,
  onSupplierAddressChange,
  onSupplierNameChange,
  onSupplierTaxIdChange,
  onServiceTypeChange,
  onWorkStartDateChange,
  onWorkEndDateChange,
  onPaymentMethodChange,
  onPaymentDaysChange,
  onPaymentMethodOtherTextChange,
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

      {/* [NOMBRE_OBRA] */}
      <Section icon={<Hammer size={18} />} title="Obra">
        <SimpleGrid columns={{ base: 1, md: 1 }} spacing={4}>
          <InputField
            label="Nombre obra"
            value={projectName}
            disabled
            helper="Vinculada al comparativo"
          />
        </SimpleGrid>
      </Section>

      {/* [TIPO_SERVICIO] */}
      <Section icon={<Briefcase size={18} />} title="Servicio prestado">
        <InputField
          label="Tipo de servicio"
          value={serviceType}
          onChange={onServiceTypeChange}
          required
          fullWidth
        />
      </Section>

      {/* [FECHA_INICIO] [FECHA_FIN] */}
      <Section icon={<Calendar size={18} />} title="Duración del servicio">
        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
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
        </SimpleGrid>
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
    </Stack>
  );
};
