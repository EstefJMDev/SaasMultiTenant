import React from "react";
import { Box, Text, useColorModeValue } from "@chakra-ui/react";

interface ProjectCodeChipProps {
  value: string;
}

export const ProjectCodeChip: React.FC<ProjectCodeChipProps> = ({ value }) => {
  const bg = useColorModeValue("gray.100", "whiteAlpha.200");
  const border = useColorModeValue("gray.200", "whiteAlpha.300");
  const color = useColorModeValue("gray.700", "whiteAlpha.900");

  return (
    <Box
      display="inline-flex"
      alignItems="center"
      px={2}
      py={1}
      borderRadius="full"
      bg={bg}
      border="1px solid"
      borderColor={border}
    >
      <Text fontSize="xs" fontFamily="mono" color={color}>
        {value}
      </Text>
    </Box>
  );
};
