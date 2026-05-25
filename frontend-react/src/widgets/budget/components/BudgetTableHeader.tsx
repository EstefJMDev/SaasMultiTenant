import React from "react";

import { Box, Flex, HStack, Text } from "@chakra-ui/react";

interface BudgetTableHeaderProps {
  selectedProjectName?: string;
  resolvedSelectedYear: number | null;
  subtleText: string;
}

export const BudgetTableHeader: React.FC<BudgetTableHeaderProps> = ({
  selectedProjectName,
  resolvedSelectedYear,
  subtleText,
}) => {
  return (
    <Box px={4} py={3} borderBottomWidth="1px" bg="gray.50">
      <Flex align="center" justify="space-between" wrap="wrap" gap={2}>
        <Text fontWeight="bold">Tabla de presupuesto</Text>
        <HStack spacing={3}>
          {selectedProjectName && (
            <Text fontSize="sm" color={subtleText}>
              {selectedProjectName}
            </Text>
          )}
          {resolvedSelectedYear != null && (
            <Text fontSize="sm" color={subtleText}>
              Año {resolvedSelectedYear}
            </Text>
          )}
        </HStack>
      </Flex>
    </Box>
  );
};
