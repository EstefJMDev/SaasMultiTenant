import React, { useMemo } from "react";

import {
  Box,
  Button,
  Divider,
  HStack,
  Input,
  Stack,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  useColorModeValue,
} from "@chakra-ui/react";

import type { SimulationProject } from "@entities/simulations";
import { formatEuroValue } from "@shared/utils/erp";

interface SimulationPanelProps {
  project: SimulationProject;
  onBudgetChange: (value: string) => void;
  onPercentChange: (value: string) => void;
  onThresholdChange: (value: string) => void;
  onAddExpense: () => void;
  onExpenseConceptChange: (expenseId: number, value: string) => void;
  onExpenseAmountChange: (expenseId: number, value: string) => void;
  onRemoveExpense: (expenseId: number) => void;
}

export const SimulationPanel: React.FC<SimulationPanelProps> = ({
  project,
  onBudgetChange,
  onPercentChange,
  onThresholdChange,
  onAddExpense,
  onExpenseConceptChange,
  onExpenseAmountChange,
  onRemoveExpense,
}) => {
  const panelBg = useColorModeValue("white", "gray.700");
  const panelBorder = useColorModeValue("gray.200", "gray.600");
  const inputBg = useColorModeValue("white", "gray.800");
  const inputBorder = useColorModeValue("gray.300", "gray.600");
  const subtleText = useColorModeValue("gray.600", "gray.300");
  const resultBg = useColorModeValue("gray.900", "gray.900");
  const resultText = useColorModeValue("white", "white");

  const subsidyAmount = useMemo(
    () => (project.budget * project.subsidyPercent) / 100,
    [project.budget, project.subsidyPercent],
  );

  const totalExpenses = useMemo(
    () => project.expenses.reduce((sum, item) => sum + (item.amount || 0), 0),
    [project.expenses],
  );

  const result = subsidyAmount - totalExpenses;
  const threshold = subsidyAmount * (project.thresholdPercent / 100);
  const isFavorable = result >= threshold;

  const unfavorablePercent = useMemo(() => {
    if (threshold <= 0 || isFavorable) return 0;

    const gap = Math.max(0, threshold - result);
    return Math.min(100, (gap / threshold) * 100);
  }, [isFavorable, result, threshold]);

  return (
    <Stack
      spacing={5}
      bg={panelBg}
      borderRadius="xl"
      p={6}
      borderWidth="1px"
      borderColor={panelBorder}
    >
      <HStack justify="space-between" align="flex-start" flexWrap="wrap">
        <Stack spacing={2}>
          <Text fontSize="lg" fontWeight="bold">
            Simulacion: {project.name}
          </Text>

          <HStack spacing={4} flexWrap="wrap">
            <HStack>
              <Text>Presupuesto:</Text>
              <Input
                size="sm"
                type="text"
                inputMode="decimal"
                value={project.budget}
                onChange={(event) => onBudgetChange(event.target.value)}
                bg={inputBg}
                borderColor={inputBorder}
                maxW="130px"
              />
            </HStack>

            <HStack>
              <Text>% subvencion:</Text>
              <Input
                size="sm"
                type="text"
                inputMode="decimal"
                value={project.subsidyPercent}
                onChange={(event) => onPercentChange(event.target.value)}
                bg={inputBg}
                borderColor={inputBorder}
                maxW="90px"
              />
            </HStack>

            <HStack>
              <Text>% umbral:</Text>
              <Input
                size="sm"
                type="text"
                inputMode="decimal"
                value={project.thresholdPercent}
                onChange={(event) => onThresholdChange(event.target.value)}
                bg={inputBg}
                borderColor={inputBorder}
                maxW="90px"
              />
            </HStack>
          </HStack>

          <Text color={subtleText}>
            Subvencionado: {formatEuroValue(subsidyAmount)} €
          </Text>
          <Text color={subtleText}>
            Umbral ({project.thresholdPercent}%): {formatEuroValue(threshold)} €
          </Text>
        </Stack>

        <Box
          textAlign="right"
          bg={resultBg}
          color={resultText}
          p={4}
          borderRadius="lg"
        >
          <Text fontSize="sm" fontWeight="bold" color="gray.200">
            RESULTADO
          </Text>
          <Text fontSize="xl" fontWeight="bold">
            {formatEuroValue(result)} €
          </Text>
          <Text color={isFavorable ? "brand.300" : "red.300"}>
            {isFavorable ? "Favorable" : "Desfavorable"}
          </Text>

          {!isFavorable && (
            <Text color="red.200" fontSize="sm">
              {unfavorablePercent.toFixed(1)}% lejos de ser favorable
            </Text>
          )}
        </Box>
      </HStack>

      <Divider borderColor={panelBorder} />

      <Stack spacing={3}>
        <HStack justify="space-between">
          <Text fontWeight="semibold">Gastos</Text>
          <Button
            size="sm"
            colorScheme="brand"
            variant="outline"
            onClick={onAddExpense}
          >
            + Añadir gasto
          </Button>
        </HStack>

        <Table size="sm" variant="simple">
          <Thead>
            <Tr>
              <Th color="gray.300">Concepto</Th>
              <Th color="gray.300">Importe (€)</Th>
              <Th color="gray.300">Accion</Th>
            </Tr>
          </Thead>
          <Tbody>
            {project.expenses.length === 0 ? (
              <Tr>
                <Td colSpan={3} color={subtleText}>
                  Aun no hay gastos.
                </Td>
              </Tr>
            ) : (
              project.expenses.map((expense) => (
                <Tr key={expense.id}>
                  <Td>
                    <Input
                      size="sm"
                      value={expense.concept}
                      onChange={(event) =>
                        onExpenseConceptChange(expense.id, event.target.value)
                      }
                      bg={inputBg}
                      borderColor={inputBorder}
                    />
                  </Td>
                  <Td>
                    <Input
                      size="sm"
                      type="text"
                      inputMode="decimal"
                      value={expense.amount}
                      onChange={(event) =>
                        onExpenseAmountChange(expense.id, event.target.value)
                      }
                      bg={inputBg}
                      borderColor={inputBorder}
                    />
                  </Td>
                  <Td>
                    <Button
                      size="xs"
                      colorScheme="red"
                      variant="ghost"
                      onClick={() => onRemoveExpense(expense.id)}
                    >
                      X
                    </Button>
                  </Td>
                </Tr>
              ))
            )}
          </Tbody>
        </Table>

        <Text fontWeight="semibold">
          Total gastos: {formatEuroValue(totalExpenses)} €
        </Text>
      </Stack>
    </Stack>
  );
};
