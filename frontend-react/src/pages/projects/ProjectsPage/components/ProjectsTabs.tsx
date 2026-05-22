import React from "react";
import { HStack, Tab, TabList, Tabs, Text } from "@chakra-ui/react";

export type ProjectStatusFilter = "all" | "active" | "inactive";

interface ProjectsTabsProps {
  activeFilter: ProjectStatusFilter;
  total: number;
  activeCount: number;
  inactiveCount: number;
  onChange: (next: ProjectStatusFilter) => void;
}

const filterByIndex: ProjectStatusFilter[] = [
  "all",
  "active",
  "inactive",
];

export const ProjectsTabs: React.FC<ProjectsTabsProps> = ({
  activeFilter,
  total,
  activeCount,
  inactiveCount,
  onChange,
}) => {
  const activeIndex = filterByIndex.indexOf(activeFilter);

  return (
    <Tabs
      index={activeIndex >= 0 ? activeIndex : 0}
      onChange={(index) => onChange(filterByIndex[index] ?? "all")}
      variant="soft-rounded"
      colorScheme="brand"
      size="sm"
    >
      <TabList>
        <Tab>
          <HStack spacing={2}>
            <Text>Todos</Text>
            <Text color="text.muted">({total})</Text>
          </HStack>
        </Tab>
        <Tab>
          <HStack spacing={2}>
            <Text>Activos</Text>
            <Text color="text.muted">({activeCount})</Text>
          </HStack>
        </Tab>
        <Tab>
          <HStack spacing={2}>
            <Text>Inactivos</Text>
            <Text color="text.muted">({inactiveCount})</Text>
          </HStack>
        </Tab>
      </TabList>
    </Tabs>
  );
};

