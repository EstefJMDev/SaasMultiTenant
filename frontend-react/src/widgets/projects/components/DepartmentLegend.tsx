import React from "react";

import { Box, Flex, HStack, Text } from "@chakra-ui/react";

import type { Department } from "@entities/hr";

interface DepartmentLegendProps {
  hrDepartments: Department[];
  departmentColorMap: Record<number, string>;
  borderColor: string;
}

export const DepartmentLegend: React.FC<DepartmentLegendProps> = ({
  hrDepartments,
  departmentColorMap,
  borderColor,
}) => {
  return (
    <Flex wrap="wrap" gap={4} mt={4} pt={4} borderTop="1px" borderColor={borderColor}>
      {hrDepartments.map((dept) => (
        <HStack key={`legend-${dept.id}`} spacing={2}>
          <Box
            w="12px"
            h="12px"
            borderRadius="full"
            bg={departmentColorMap[dept.id] ?? "gray.300"}
            boxShadow="sm"
          />
          <Text fontSize="sm" color="gray.700" fontWeight="medium">
            {dept.name}
          </Text>
        </HStack>
      ))}
    </Flex>
  );
};
