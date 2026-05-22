import React from "react";

import {
  Button,
  Flex,
  FormControl,
  FormLabel,
  HStack,
  Input,
  Select,
} from "@chakra-ui/react";

import type { Department } from "@entities/hr";

interface SummaryToolbarProps {
  summarySearch: string;
  onSummarySearchChange: (value: string) => void;
  departmentFilter: "all" | number;
  onDepartmentFilterChange: (value: "all" | number) => void;
  hrDepartments: Department[];
  summaryYear: number;
  yearOptions: number[];
  onSummaryYearChange: (value: number) => void;
  onRefreshAllocations: () => void;
  summaryEditMode: boolean;
  onToggleSummaryEdit: () => void;
}

export const SummaryToolbar: React.FC<SummaryToolbarProps> = ({
  summarySearch,
  onSummarySearchChange,
  departmentFilter,
  onDepartmentFilterChange,
  hrDepartments,
  summaryYear,
  yearOptions,
  onSummaryYearChange,
  onRefreshAllocations,
  summaryEditMode,
  onToggleSummaryEdit,
}) => {
  return (
    <Flex justify="space-between" align="flex-end" flexWrap="wrap" gap={1.5}>
      <HStack spacing={1.5} flexWrap="wrap" align="flex-end">
        <FormControl maxW="165px">
          <FormLabel fontSize="xs" mb={1} fontWeight="semibold" color="gray.700">
            Buscar empleado
          </FormLabel>
          <Input
            size="sm"
            placeholder="Nombre o apellidos"
            value={summarySearch}
            onChange={(e) => onSummarySearchChange(e.target.value)}
            h="32px"
            px={2.5}
            borderRadius="md"
            focusBorderColor="teal.500"
          />
        </FormControl>

        <FormControl maxW="128px">
          <FormLabel fontSize="xs" mb={1} fontWeight="semibold" color="gray.700">
            Departamento
          </FormLabel>
          <Select
            size="sm"
            value={departmentFilter}
            onChange={(e) => {
              const value = e.target.value;
              onDepartmentFilterChange(value === "all" ? "all" : Number(value));
            }}
            h="32px"
            borderRadius="md"
            focusBorderColor="teal.500"
          >
            <option value="all">Todos</option>
            {hrDepartments.map((dept) => (
              <option key={dept.id} value={dept.id}>
                {dept.name}
              </option>
            ))}
          </Select>
        </FormControl>

        <FormControl maxW="84px">
          <FormLabel fontSize="sm" mb={1} fontWeight="semibold" color="gray.700">
            Año
          </FormLabel>
          <Select
            size="sm"
            value={summaryYear}
            onChange={(e) => {
              const parsed = Number(e.target.value);
              onSummaryYearChange(
                Number.isFinite(parsed) ? parsed : new Date().getFullYear(),
              );
            }}
            h="32px"
            borderRadius="md"
            focusBorderColor="teal.500"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </FormControl>
      </HStack>

      <HStack spacing={1.5} align="flex-end">
        <Button
          size="sm"
          colorScheme="brand"
          h="32px"
          px={3}
          borderRadius="lg"
          fontWeight="bold"
          boxShadow="xs"
          _hover={{ transform: "translateY(-1px)", boxShadow: "lg" }}
          transition="all 0.2s"
          onClick={onRefreshAllocations}
        >
          Refrescar
        </Button>

        <Button
          size="sm"
          colorScheme={summaryEditMode ? "orange" : "teal"}
          variant={summaryEditMode ? "solid" : "outline"}
          onClick={onToggleSummaryEdit}
          h="32px"
          px={3}
          borderRadius="lg"
          fontWeight="bold"
          boxShadow="xs"
          _hover={{ transform: "translateY(-1px)", boxShadow: "lg" }}
          transition="all 0.2s"
        >
          {summaryEditMode ? "Guardar" : "Editar"}
        </Button>
      </HStack>
    </Flex>
  );
};
