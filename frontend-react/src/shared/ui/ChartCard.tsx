import React from "react";
import { Box, HStack, Text, VStack } from "@chakra-ui/react";

import { Card } from "./Card";

interface ChartCardProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export const ChartCard: React.FC<ChartCardProps> = ({
  title,
  subtitle,
  actions,
  children,
}) => (
  <Card px={4} py={4} h="100%">
    <HStack justify="space-between" align="start" spacing={4} mb={4}>
      <Box>
        <Text fontWeight="semibold">{title}</Text>
        {subtitle && (
          <Text fontSize="sm" color="text.muted">
            {subtitle}
          </Text>
        )}
      </Box>
      {actions && <Box>{actions}</Box>}
    </HStack>
    <VStack align="stretch" spacing={2}>
      {children}
    </VStack>
  </Card>
);
