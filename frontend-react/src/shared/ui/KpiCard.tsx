import React from "react";
import { HStack, Text, VStack, Badge } from "@chakra-ui/react";

import { Card } from "./Card";

interface KpiCardProps {
  label: string;
  value: string | number;
  delta?: string;
  deltaTone?: "positive" | "negative" | "neutral";
}

const deltaColorMap: Record<NonNullable<KpiCardProps["deltaTone"]>, string> = {
  positive: "brand",
  negative: "red",
  neutral: "gray",
};

export const KpiCard: React.FC<KpiCardProps> = ({
  label,
  value,
  delta,
  deltaTone = "neutral",
}) => {
  return (
    <Card px={4} py={4} minW="180px">
      <VStack align="start" spacing={2}>
        <Text fontSize="xs" color="text.muted" textTransform="uppercase">
          {label}
        </Text>
        <HStack justify="space-between" w="100%">
          <Text fontSize="2xl" fontWeight="semibold">
            {value}
          </Text>
          {delta && (
            <Badge colorScheme={deltaColorMap[deltaTone]} variant="subtle">
              {delta}
            </Badge>
          )}
        </HStack>
      </VStack>
    </Card>
  );
};

