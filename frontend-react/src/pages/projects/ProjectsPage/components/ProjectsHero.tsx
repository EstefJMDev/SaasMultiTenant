import React from "react";
import { Stack, Text } from "@chakra-ui/react";
import { ProjectHero } from "@widgets/projects";

export const ProjectsHero: React.FC = () => (
  <Stack spacing={4}>
    <ProjectHero
      items={[]}
      title="Gestión de proyectos"
      subtitle="Visualiza proyectos activos, estados y departamentos asociados."
      breadcrumb="Gestión"
    />
    <Text color="text.muted" fontSize="sm">
      Datos en tiempo real desde el backend. Usa los filtros para encontrar
      proyectos por nombre, descripcion o codigo.
    </Text>
  </Stack>
);
