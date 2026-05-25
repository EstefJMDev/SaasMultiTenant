import React from "react";
import { Box, HStack, Text, useColorModeValue } from "@chakra-ui/react";

interface ProjectsStatusBadgeProps {
  status: "Activo" | "Inactivo";
}

export const ProjectsStatusBadge: React.FC<ProjectsStatusBadgeProps> = ({
  status,
}) => {
  const isActive = status === "Activo";
  const bg = useColorModeValue(
    isActive ? "brand.50" : "red.50",
    isActive ? "brand.900" : "red.900",
  );
  const color = useColorModeValue(
    isActive ? "brand.700" : "red.700",
    isActive ? "brand.200" : "red.200",
  );
  const dot = useColorModeValue(
    isActive ? "brand.500" : "red.500",
    isActive ? "brand.300" : "red.300",
  );

  return (
    <HStack
      spacing={2}
      px={2.5}
      py={1}
      borderRadius="full"
      bg={bg}
      display="inline-flex"
    >
      <Box w="6px" h="6px" borderRadius="full" bg={dot} />
      <Text fontSize="xs" fontWeight={600} color={color}>
        {status}
      </Text>
    </HStack>
  );
};

