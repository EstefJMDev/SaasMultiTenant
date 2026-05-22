import React from "react";

import { FormControl, FormLabel, Select } from "@chakra-ui/react";

import type { ErpProject as ErpProjectApi } from "@api/erpReports";

interface BudgetProjectSelectControlProps {
  projects: ErpProjectApi[];
  budgetProjectFilter: string;
  onBudgetProjectChange: (value: string) => void;
}

export const BudgetProjectSelectControl: React.FC<
  BudgetProjectSelectControlProps
> = ({ projects, budgetProjectFilter, onBudgetProjectChange }) => {
  return (
    <FormControl minW="220px" maxW="320px">
      <FormLabel>Proyecto</FormLabel>
      <Select
        size="sm"
        value={budgetProjectFilter}
        onChange={(e) => onBudgetProjectChange(e.target.value)}
      >
        <option value="">Selecciona un proyecto</option>
        {projects.map((project) => (
          <option key={project.id} value={String(project.id)}>
            {project.name}
          </option>
        ))}
      </Select>
    </FormControl>
  );
};
