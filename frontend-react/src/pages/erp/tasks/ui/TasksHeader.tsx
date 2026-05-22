import React from "react";
import { Tab, TabList } from "@chakra-ui/react";
import type { TFunction } from "i18next";

interface TasksHeaderProps {
  t: TFunction;
}

export const TasksHeader: React.FC<TasksHeaderProps> = ({ t }) => (
  <TabList
    bg="white"
    borderRadius="12px"
    p="6px"
    boxShadow="0 1px 10px rgba(0,0,0,0.08)"
    border="1px solid"
    borderColor="gray.100"
    gap={1}
    flexWrap="wrap"
    w="fit-content"
  >
    <Tab
      px={4}
      py={2}
      borderRadius="10px"
      fontSize="sm"
      fontWeight={600}
      _selected={{
        bg: "brand.600",
        color: "white",
        _hover: { bg: "brand.600", color: "white" },
      }}
      _hover={{ bg: "gray.50" }}
    >
      {t("erp.tasks.tabs.summary")}
    </Tab>
    <Tab
      px={4}
      py={2}
      borderRadius="10px"
      fontSize="sm"
      fontWeight={500}
      _selected={{
        bg: "brand.600",
        color: "white",
        fontWeight: 600,
        _hover: { bg: "brand.600", color: "white", fontWeight: 600 },
      }}
      _hover={{ bg: "gray.50" }}
    >
      {t("erp.tasks.tabs.kanban")}
    </Tab>
  </TabList>
);

