import React from "react";
import { FormControl, FormLabel, HStack, Input, Select } from "@chakra-ui/react";

import type { DepartmentRead } from "@features/departments/types";

interface ProjectsFiltersProps {
  search: string;
  departmentId: string;
  departments: DepartmentRead[];
  onSearchChange: (value: string) => void;
  onDepartmentChange: (value: string) => void;
}

export const ProjectsFilters: React.FC<ProjectsFiltersProps> = ({
  search,
  departmentId,
  departments,
  onSearchChange,
  onDepartmentChange,
}) => (
  <HStack spacing={4} align="end" flexWrap="wrap">
    <FormControl maxW="320px">
      <FormLabel fontSize="sm">Buscar</FormLabel>
      <Input
        placeholder="Nombre, descripcion o codigo"
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
      />
    </FormControl>
    <FormControl maxW="260px">
      <FormLabel fontSize="sm">Departamento</FormLabel>
      <Select
        value={departmentId}
        onChange={(event) => onDepartmentChange(event.target.value)}
      >
        <option value="all">Todos</option>
        {departments.map((dept) => (
          <option key={dept.id} value={String(dept.id)}>
            {dept.name}
          </option>
        ))}
      </Select>
    </FormControl>
  </HStack>
);
