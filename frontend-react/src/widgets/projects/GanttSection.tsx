
import React from "react";

import {
  Box,
  FormControl,
  FormLabel,
  HStack,
  Select,
  Stack,
  Text,
} from "@chakra-ui/react";

import type { ErpProject as ErpProjectApi } from "@api/erpReports";
import type { GanttTask } from "@shared/utils/erp";
import { ProfessionalGantt } from "./ProfessionalGantt";

interface GanttSectionProps {
  ganttProjects: ErpProjectApi[];
  selectedProjectId: string;
  onSelectedProjectChange: (value: string) => void;
  ganttTasks: GanttTask[];
  subtleText: string;
}

export const GanttSection: React.FC<GanttSectionProps> = ({
  ganttProjects,
  selectedProjectId,
  onSelectedProjectChange,
  ganttTasks,
  subtleText,
}) => (
  <Stack spacing={4}>
    <HStack spacing={3} align="flex-end" flexWrap="wrap">
      <FormControl minW="200px" maxW="260px">
        <FormLabel fontSize="sm">Proyecto</FormLabel>
        <Select
          value={selectedProjectId}
          onChange={(e) => onSelectedProjectChange(e.target.value)}
          size="sm"
        >
          <option value="all">Todos los proyectos</option>
          {ganttProjects.map((p) => (
            <option key={p.id} value={String(p.id)}>
              {p.name}
            </option>
          ))}
        </Select>
      </FormControl>

      <HStack spacing={4} ml="auto" fontSize="sm" color={subtleText} flexWrap="wrap">
        <HStack spacing={1}>
          <Box w={4} h={4} borderRadius="md" bg="brand.500" />
          <Text>A tiempo</Text>
        </HStack>
        <HStack spacing={1}>
          <Box w={4} h={4} borderRadius="md" bg="orange.400" />
          <Text>En riesgo</Text>
        </HStack>
        <HStack spacing={1}>
          <Box w={4} h={4} borderRadius="md" bg="red.500" />
          <Text>Retrasado</Text>
        </HStack>
        <HStack spacing={1}>
          <Box w={4} h={4} borderRadius="md" bg="#b8c2d1" />
          <Text>Planificado</Text>
        </HStack>
      </HStack>
    </HStack>

    <ProfessionalGantt
      tasks={ganttTasks}
      viewMode="month"
      centerOnToday
      onProjectClick={(id) => {
        const clickedProjectId = String(id);
        onSelectedProjectChange(
          selectedProjectId === clickedProjectId ? "all" : clickedProjectId,
        );
      }}
      showMilestoneLines={selectedProjectId !== "all"}
    />
  </Stack>
);

