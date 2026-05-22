import React from "react";

import { Box, FormControl, FormLabel, HStack, Select, Text } from "@chakra-ui/react";

import { formatEuroValue } from "@shared/utils/erp";

interface BudgetProjectSummaryProps {
  baseResult: number;
  subtleText: string;
  durationLabel: string;
  resolvedSelectedYear: number | null;
  setSelectedYear: (year: number | null) => void;
  yearOptions: number[];
  monthsActivePerYear: number;
}

export const BudgetProjectSummary: React.FC<BudgetProjectSummaryProps> = ({
  baseResult,
  subtleText,
  durationLabel,
  resolvedSelectedYear,
  setSelectedYear,
  yearOptions,
  monthsActivePerYear,
}) => {
  return (
    <Box>
      <HStack spacing={2}>
        <Text fontWeight="bold">Resultado</Text>
        <Text>{formatEuroValue(baseResult)} EUR</Text>
      </HStack>
      <HStack spacing={2}>
        <Text fontSize="sm" color={subtleText}>
          Duracion del proyecto
        </Text>
        <Text fontWeight="semibold">{durationLabel}</Text>
      </HStack>
      <HStack spacing={2} mt={2} align="center">
        <FormControl maxW="160px">
          <FormLabel fontSize="xs" mb={1}>
            Anualizar por año
          </FormLabel>
          <Select
            size="sm"
            value={resolvedSelectedYear ?? ""}
            onChange={(e) =>
              setSelectedYear(e.target.value ? Number(e.target.value) : null)
            }
            isDisabled={!yearOptions.length}
          >
            {yearOptions.length === 0 && <option value="">Sin fechas</option>}
            {yearOptions.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </Select>
        </FormControl>
        {resolvedSelectedYear != null && (
          <Text fontSize="sm" color={subtleText}>
            Meses activos: {monthsActivePerYear}
          </Text>
        )}
      </HStack>
    </Box>
  );
};
