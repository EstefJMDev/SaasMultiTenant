import React from "react";

import { SimpleGrid } from "@chakra-ui/react";

import { KpiCard } from "@shared/ui";

interface DashboardKpiItem {
  label: string;
  value: string | number;
  delta?: string;
  deltaTone?: "positive" | "negative" | "neutral";
}

interface DashboardKpiGridProps {
  items: DashboardKpiItem[];
}

export const DashboardKpiGrid: React.FC<DashboardKpiGridProps> = ({
  items,
}) => {
  return (
    <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4} mb={8}>
      {items.map((item) => (
        <KpiCard
          key={item.label}
          label={item.label}
          value={item.value}
          delta={item.delta}
          deltaTone={item.deltaTone}
        />
      ))}
    </SimpleGrid>
  );
};
