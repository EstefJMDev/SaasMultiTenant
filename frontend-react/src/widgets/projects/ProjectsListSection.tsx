
import React from "react";

import {
  Badge,
  Box,
  Button,
  Flex,
  Heading,
  HStack,
  SimpleGrid,
  Stack,
  Text,
} from "@chakra-ui/react";

import type { ErpProject as ErpProjectApi } from "@api/erpReports";
import type { ErpActivity, ErpMilestone } from "@api/erpStructure";
import type { ErpTask as ErpTaskApi } from "@api/erpTimeTracking";

interface ProjectsListSectionProps {
  projects: ErpProjectApi[];
  activities: ErpActivity[];
  milestones: ErpMilestone[];
  rawTasks: ErpTaskApi[];
  onEditProject: (project: ErpProjectApi) => void;
  onViewProjectDetails: (project: ErpProjectApi) => void;
  onViewProjectDocs: (project: ErpProjectApi) => void;
  cardBg: string;
  subtleText: string;
}

export const ProjectsListSection: React.FC<ProjectsListSectionProps> = ({
  projects,
  activities,
  milestones,
  rawTasks,
  onEditProject,
  onViewProjectDetails,
  onViewProjectDocs,
  cardBg,
  subtleText,
}) => (
  <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
    {projects.map((project) => (
      <Box
        key={project.id}
        borderWidth="1px"
        borderRadius="lg"
        p={4}
        bg={cardBg}
        _hover={{ boxShadow: "md" }}
      >
        <Flex justify="space-between" align="flex-start" mb={2}>
          <Heading size="sm">{project.name}</Heading>
          <Badge colorScheme={project.is_active === false ? "red" : "brand"}>
            {project.is_active === false ? "Inactivo" : "Activo"}
          </Badge>
        </Flex>

        <Text fontSize="sm" color={subtleText} mb={3}>
          {project.description || "Sin descripcion"}
        </Text>

        <Stack fontSize="xs" color={subtleText} spacing={1} mb={3}>
          <HStack spacing={2}>
            <Badge colorScheme="gray">Fechas</Badge>
            <Text>
              {project.start_date || "Sin inicio"} OCo{" "}
              {project.end_date || "Sin fin"}
            </Text>
          </HStack>

          <HStack spacing={2}>
            <Badge colorScheme="gray">Actividades</Badge>
            <Text>
              {activities.filter((a) => a.project_id === project.id).length}
            </Text>
          </HStack>

          <HStack spacing={2}>
            <Badge colorScheme="gray">Hitos</Badge>
            <Text>
              {milestones.filter((m) => m.project_id === project.id).length}
            </Text>
          </HStack>

          <HStack spacing={2}>
            <Badge colorScheme="gray">Tareas</Badge>
            <Text>
              {rawTasks.filter((t) => t.project_id === project.id).length}
            </Text>
          </HStack>
        </Stack>

        <HStack spacing={2} justify="flex-end">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onEditProject(project)}
          >
            Editar
          </Button>
          <Button
            size="sm"
            colorScheme="brand"
            variant="solid"
            onClick={() => onViewProjectDetails(project)}
          >
            Detalles
          </Button>
          <Button size="sm" onClick={() => onViewProjectDocs(project)}>
            Documentación
          </Button>
        </HStack>
      </Box>
    ))}
  </SimpleGrid>
);

