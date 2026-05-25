import React from "react";

import { Box, Heading, SimpleGrid, Text } from "@chakra-ui/react";

interface SummaryStatsCardsProps {
  cardBg: string;
  borderColor: string;
  subtleText: string;
  totalToJustify: number;
  totalJustified: number;
  totalMissing: number;
}

export const SummaryStatsCards: React.FC<SummaryStatsCardsProps> = ({
  cardBg,
  borderColor,
  subtleText,
  totalToJustify,
  totalJustified,
  totalMissing,
}) => {
  return (
    <SimpleGrid columns={{ base: 1, md: 3 }} gap={4}>
      <Box p={4} borderRadius="lg" bg={cardBg} borderWidth="1px" borderColor={borderColor}>
        <Text fontSize="xs" color={subtleText}>
          Horas a justificar
        </Text>
        <Heading size="lg">{totalToJustify} h</Heading>
      </Box>

      <Box p={4} borderRadius="lg" bg={cardBg} borderWidth="1px" borderColor={borderColor}>
        <Text fontSize="xs" color={subtleText}>
          Justificadas
        </Text>
        <Heading size="lg" color="brand.600">
          {totalJustified} h
        </Heading>
      </Box>

      <Box p={4} borderRadius="lg" bg={cardBg} borderWidth="1px" borderColor={borderColor}>
        <Text fontSize="xs" color={subtleText}>
          Faltantes
        </Text>
        <Heading size="lg" color="orange.600">
          {totalMissing} h
        </Heading>
      </Box>
    </SimpleGrid>
  );
};
