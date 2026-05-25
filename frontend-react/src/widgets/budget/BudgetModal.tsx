import React, { useEffect, useState } from "react";

import {
  Button,
  FormControl,
  FormLabel,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  SimpleGrid,
  Stack,
  Text,
} from "@chakra-ui/react";

import type { ProjectBudgetLinePayload } from "@api/erpBudgets";

interface BudgetModalForm {
  concept: string;
  hito1_budget: string;
  justified_hito1: string;
  hito2_budget: string;
  justified_hito2: string;
  approved_budget: string;
  percent_spent: string;
  forecasted_spent: string;
}

interface BudgetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (payload: ProjectBudgetLinePayload) => void;
  initialValues?: ProjectBudgetLinePayload;
  title: string;
  submitLabel?: string;
  isSaving?: boolean;
}

export const BudgetModal: React.FC<BudgetModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialValues,
  title,
  submitLabel,
  isSaving = false,
}) => {
  const [form, setForm] = useState<BudgetModalForm>({
    concept: "",
    hito1_budget: "",
    justified_hito1: "",
    hito2_budget: "",
    justified_hito2: "",
    approved_budget: "",
    percent_spent: "",
    forecasted_spent: "",
  });

  useEffect(() => {
    if (!isOpen) return;
    setForm({
      concept: initialValues?.concept ?? "",
      hito1_budget:
        initialValues?.hito1_budget !== undefined
          ? String(initialValues.hito1_budget)
          : "",
      justified_hito1:
        initialValues?.justified_hito1 !== undefined
          ? String(initialValues.justified_hito1)
          : "",
      hito2_budget:
        initialValues?.hito2_budget !== undefined
          ? String(initialValues.hito2_budget)
          : "",
      justified_hito2:
        initialValues?.justified_hito2 !== undefined
          ? String(initialValues.justified_hito2)
          : "",
      approved_budget:
        initialValues?.approved_budget !== undefined
          ? String(initialValues.approved_budget)
          : "",
      percent_spent:
        initialValues?.percent_spent !== undefined
          ? String(initialValues.percent_spent)
          : "",
      forecasted_spent:
        initialValues?.forecasted_spent !== undefined
          ? String(initialValues.forecasted_spent)
          : "",
    });
  }, [initialValues, isOpen]);

  const parseNumber = (value: string) => {
    const raw = value.trim().replace(/\s+/g, "");
    if (!raw) return 0;
    // Aceptar formato español: "29.161,58" o "29161,58"
    const normalized = raw.replace(/\./g, "").replace(",", ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const hitoSum =
    parseNumber(form.hito1_budget) + parseNumber(form.hito2_budget);
  const approvedValue = parseNumber(form.approved_budget);
  // Regla de negocio: la suma de los hitos
  // no puede superar el presupuesto aprobado,
  // pero puede ser menor mientras no se haya repartido todo.
  const totalsValid = hitoSum <= approvedValue + 0.01;

  const handleSubmit = () => {
    onSave({
      concept: form.concept.trim(),
      hito1_budget: parseNumber(form.hito1_budget),
      justified_hito1: parseNumber(form.justified_hito1),
      hito2_budget: parseNumber(form.hito2_budget),
      justified_hito2: parseNumber(form.justified_hito2),
      approved_budget: parseNumber(form.approved_budget),
      percent_spent: parseNumber(form.percent_spent),
      forecasted_spent: parseNumber(form.forecasted_spent),
    });
  };

  const updateField = (field: keyof BudgetModalForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>{title}</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Stack spacing={3}>
            <FormControl isRequired>
              <FormLabel>Concepto</FormLabel>
              <Input
                value={form.concept}
                onChange={(e) => updateField("concept", e.target.value)}
              />
            </FormControl>
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
              <FormControl>
                <FormLabel>Hito 1</FormLabel>
                <Input
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9.,]*"
                  value={form.hito1_budget}
                  onChange={(e) => updateField("hito1_budget", e.target.value)}
                />
              </FormControl>
              <FormControl>
                <FormLabel>Justificado H1</FormLabel>
                <Input
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9.,]*"
                  value={form.justified_hito1}
                  onChange={(e) =>
                    updateField("justified_hito1", e.target.value)
                  }
                />
              </FormControl>
            </SimpleGrid>
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
              <FormControl>
                <FormLabel>Hito 2</FormLabel>
                <Input
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9.,]*"
                  value={form.hito2_budget}
                  onChange={(e) => updateField("hito2_budget", e.target.value)}
                />
              </FormControl>
              <FormControl>
                <FormLabel>Justificado H2</FormLabel>
                <Input
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9.,]*"
                  value={form.justified_hito2}
                  onChange={(e) =>
                    updateField("justified_hito2", e.target.value)
                  }
                />
              </FormControl>
            </SimpleGrid>
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
              <FormControl>
                <FormLabel>Total aprobado</FormLabel>
                <Input
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9.,]*"
                  value={form.approved_budget}
                  onChange={(e) =>
                    updateField("approved_budget", e.target.value)
                  }
                />
              </FormControl>
              <FormControl>
                <FormLabel>% Gastado</FormLabel>
                <Input
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9.,]*"
                  value={form.percent_spent}
                  onChange={(e) => updateField("percent_spent", e.target.value)}
                />
              </FormControl>
            </SimpleGrid>
            <FormControl>
              <FormLabel>Gasto previsto</FormLabel>
              <Input
                type="text"
                inputMode="decimal"
                pattern="[0-9.,]*"
                value={form.forecasted_spent}
                onChange={(e) =>
                  updateField("forecasted_spent", e.target.value)
                }
              />
            </FormControl>
            <Text color={totalsValid ? "brand.500" : "red.500"} fontSize="sm">
              {totalsValid
                ? "La suma de Hito 1 y Hito 2 no supera el presupuesto aprobado."
                : "La suma de los hitos no puede superar el presupuesto aprobado."}
            </Text>
          </Stack>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" mr={3} onClick={onClose}>
            Cancelar
          </Button>
          <Button
            colorScheme="brand"
            onClick={handleSubmit}
            isDisabled={!totalsValid || !form.concept.trim()}
            isLoading={isSaving}
          >
            {submitLabel ?? "Guardar"}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

