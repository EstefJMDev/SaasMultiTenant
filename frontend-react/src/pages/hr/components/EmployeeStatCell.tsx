import React from "react";

import { Box, Text, useColorModeValue } from "@chakra-ui/react";

interface EmployeeStatCellProps {
  label: string;
  value: React.ReactNode;
}

export const EmployeeStatCell: React.FC<EmployeeStatCellProps> = ({
  label,
  value,
}) => {
  const border = useColorModeValue("gray.200", "gray.700");
  const bg = useColorModeValue("gray.50", "gray.800");
  const subtle = useColorModeValue("gray.600", "gray.400");

  return (
    <Box borderWidth="1px" borderColor={border} borderRadius="md" p={3} bg={bg}>
      <Text fontSize="xs" color={subtle} mb={1} fontWeight="bold">
        {label}
      </Text>
      <Text as="div" fontWeight="semibold">
        {value}
      </Text>
    </Box>
  );
};
