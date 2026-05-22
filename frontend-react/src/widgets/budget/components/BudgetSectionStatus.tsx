import React from "react";

import { Text } from "@chakra-ui/react";

interface BudgetSectionStatusProps {
  selectedBudgetProjectId: number | null;
  isFetching: boolean;
  isError: boolean;
  subtleText: string;
}

export const BudgetSectionStatus: React.FC<BudgetSectionStatusProps> = ({
  selectedBudgetProjectId,
  isFetching,
  isError,
  subtleText,
}) => {
  if (!selectedBudgetProjectId) {
    return (
      <Text fontSize="sm" color={subtleText}>
        Selecciona un proyecto para ver sus presupuestos.
      </Text>
    );
  }

  if (isFetching) {
    return (
      <Text fontSize="sm" color={subtleText}>
        Cargando presupuestos...
      </Text>
    );
  }

  if (isError) {
    return (
      <Text fontSize="sm" color="red.500">
        No se pudieron cargar los presupuestos.
      </Text>
    );
  }

  return null;
};
