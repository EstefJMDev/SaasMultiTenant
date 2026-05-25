import React, { useState } from "react";

import {
  Box,
  Button,
  Heading,
  HStack,
  Input,
  Stack,
  Text,
  VStack,
} from "@chakra-ui/react";

import type { SimulationProject } from "@entities/simulations";

interface SimulationsListProps {
  projects: SimulationProject[];
  selectedProjectId: number | null;
  onSelect: (projectId: number) => void;
  onAddProject: (name: string) => void;
  onRemoveProject: (projectId: number) => void;
}

export const SimulationsList: React.FC<SimulationsListProps> = ({
  projects,
  selectedProjectId,
  onSelect,
  onAddProject,
  onRemoveProject,
}) => {
  const [name, setName] = useState("");

  const handleAdd = () => {
    onAddProject(name);
    setName("");
  };

  return (
    <Stack spacing={4}>
      <Box>
        <Heading size="sm" mb={2}>
          Proyectos a simular
        </Heading>
        <HStack>
          <Input
            size="sm"
            placeholder="Nombre del proyecto"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <Button size="sm" colorScheme="brand" onClick={handleAdd}>
            Añadir
          </Button>
        </HStack>
      </Box>

      {projects.length === 0 ? (
        <Text fontSize="sm" color="gray.500">
          Aun no tienes simulaciones.
        </Text>
      ) : (
        <VStack align="stretch" spacing={2}>
          {projects.map((project) => (
            <HStack
              key={project.id}
              p={2}
              borderWidth="1px"
              borderRadius="md"
              justify="space-between"
              bg={project.id === selectedProjectId ? "brand.50" : "white"}
              borderColor={project.id === selectedProjectId ? "brand.200" : "gray.200"}
              cursor="pointer"
              onClick={() => onSelect(project.id)}
            >
              <Text fontSize="sm" fontWeight="semibold">
                {project.name}
              </Text>
              <Button
                size="xs"
                variant="ghost"
                colorScheme="red"
                onClick={(event) => {
                  event.stopPropagation();
                  onRemoveProject(project.id);
                }}
              >
                Eliminar
              </Button>
            </HStack>
          ))}
        </VStack>
      )}
    </Stack>
  );
};
