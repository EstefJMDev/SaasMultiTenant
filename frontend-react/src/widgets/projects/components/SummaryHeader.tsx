import React from "react";

import { Box, Heading, HStack, Tag, Text } from "@chakra-ui/react";

interface SummaryHeaderProps {
  summaryYear: number;
  subtleText: string;
  loadingSummaryYear: boolean;
  saveStatusLabel?: string;
  saveErrorMessage?: string;
  headerGradient: string;
  badgeBg: string;
  badgeColor: string;
}

export const SummaryHeader: React.FC<SummaryHeaderProps> = ({
  summaryYear,
  subtleText,
  loadingSummaryYear,
  saveStatusLabel,
  saveErrorMessage,
  headerGradient,
  badgeBg,
  badgeColor,
}) => {
  return (
    <Box>
      <Heading
        size="lg"
        bgGradient={headerGradient}
        bgClip="text"
        fontWeight="black"
        letterSpacing="tight"
        mb={2}
      >
        Gestión y seguimiento de proyectos
      </Heading>
      <HStack spacing={2} mb={2}>
        <Tag
          colorScheme="brand"
          size="sm"
          px={3}
          py={1}
          borderRadius="full"
          bg={badgeBg}
          color={badgeColor}
          fontWeight="bold"
        >
          Año {summaryYear}
        </Tag>
        <Text fontSize="sm" color={subtleText}>
          Filtrando por año {summaryYear}
        </Text>
      </HStack>
      <Text fontSize="sm" color={subtleText} maxW="600px">
        Tablero tipo Excel con horas a justificar, justificadas y asignación por
        empleado.
      </Text>
      {loadingSummaryYear && (
        <Text fontSize="xs" color={subtleText} mt={1}>
          Cargando los datos del año {summaryYear}...
        </Text>
      )}
      {saveStatusLabel && !loadingSummaryYear && (
        <Text fontSize="xs" color="gray.500" mt={1}>
          {saveStatusLabel}
        </Text>
      )}
      {saveErrorMessage && !loadingSummaryYear && (
        <Text fontSize="xs" color="red.500" mt={1}>
          {saveErrorMessage}
        </Text>
      )}
    </Box>
  );
};
