import React from "react";
import {
  Box,
  Button,
  Collapse,
  Flex,
  FormControl,
  FormLabel,
  Heading,
  HStack,
  Icon,
  Input,
  InputGroup,
  InputLeftElement,
  Select,
  SimpleGrid,
  Stack,
  useColorModeValue,
} from "@chakra-ui/react";
import { ChevronDownIcon, ChevronUpIcon } from "@chakra-ui/icons";

import type { Department } from "@entities/hr";
import type { ErpProject } from "@api/erpReports";

interface InvoicesFiltersCardProps {
  isOpen: boolean;
  onToggle: () => void;
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  projectFilter: string;
  onProjectFilterChange: (value: string) => void;
  departmentFilter: string;
  onDepartmentFilterChange: (value: string) => void;
  dateRange: string;
  onDateRangeChange: (value: string) => void;
  activeProjects: ErpProject[];
  departments: Department[];
  onClearFilters: () => void;
}

export const InvoicesFiltersCard: React.FC<InvoicesFiltersCardProps> = ({
  isOpen,
  onToggle,
  searchTerm,
  onSearchTermChange,
  statusFilter,
  onStatusFilterChange,
  projectFilter,
  onProjectFilterChange,
  departmentFilter,
  onDepartmentFilterChange,
  dateRange,
  onDateRangeChange,
  activeProjects,
  departments,
  onClearFilters,
}) => {
  const cardBg = useColorModeValue("white", "gray.700");
  const borderColor = useColorModeValue("gray.200", "gray.600");

  return (
    <Box
      bg={cardBg}
      borderRadius="xl"
      p={isOpen ? 5 : 3}
      borderWidth="1px"
      borderColor={borderColor}
      boxShadow="sm"
      transition="all 0.3s"
      _hover={{ boxShadow: "md" }}
    >
      <Flex
        align="center"
        justify="space-between"
        cursor="pointer"
        onClick={onToggle}
        userSelect="none"
      >
        <HStack spacing={2}>
          <Box
            w="8"
            h="8"
            bgGradient="linear(to-br, brand.600, brand.700)"
            borderRadius="lg"
            display="flex"
            alignItems="center"
            justifyContent="center"
            transition="transform 0.2s"
            _hover={{ transform: "scale(1.05)" }}
          >
            <Icon viewBox="0 0 24 24" boxSize={4} color="white">
              <path
                fill="currentColor"
                d="M14,12V19.88C14.04,20.18 13.94,20.5 13.71,20.71C13.32,21.1 12.69,21.1 12.3,20.71L10.29,18.7C10.06,18.47 9.96,18.16 10,17.87V12H9.97L4.21,4.62C3.87,4.19 3.95,3.56 4.38,3.22C4.57,3.08 4.78,3 5,3V3H19V3C19.22,3 19.43,3.08 19.62,3.22C20.05,3.56 20.13,4.19 19.79,4.62L14.03,12H14Z"
              />
            </Icon>
          </Box>
          <Heading size="sm" fontWeight="bold">
            Filtros
          </Heading>
        </HStack>
        <Icon
          as={isOpen ? ChevronUpIcon : ChevronDownIcon}
          boxSize={5}
          transition="transform 0.2s"
          color="gray.500"
        />
      </Flex>

      <Collapse in={isOpen} animateOpacity>
        <Stack spacing={4} pt={4}>
          <SimpleGrid columns={{ base: 1, md: 2, xl: 5 }} spacing={3}>
            <FormControl>
              <FormLabel fontSize="sm" fontWeight="semibold" mb={1}>
                Buscar
              </FormLabel>
              <InputGroup>
                <InputLeftElement pointerEvents="none" color="brand.400" h="9">
                  <Icon viewBox="0 0 24 24" boxSize={4}>
                    <path
                      fill="currentColor"
                      d="M9.5,3A6.5,6.5 0 0,1 16,9.5C16,11.11 15.41,12.59 14.44,13.73L14.71,14H15.5L20.5,19L19,20.5L14,15.5V14.71L13.73,14.44C12.59,15.41 11.11,16 9.5,16A6.5,6.5 0 0,1 3,9.5A6.5,6.5 0 0,1 9.5,3M9.5,5C7,5 5,7 5,9.5C5,12 7,14 9.5,14C12,14 14,12 14,9.5C14,7 12,5 9.5,5Z"
                    />
                  </Icon>
                </InputLeftElement>
                <Input
                  size="sm"
                  h="9"
                  pl={10}
                  value={searchTerm}
                  onChange={(e) => onSearchTermChange(e.target.value)}
                  placeholder="ID, proveedor o numero..."
                  bg="white"
                  borderRadius="lg"
                  borderColor={borderColor}
                  _focus={{
                    borderColor: "brand.500",
                    boxShadow: "0 0 0 1px var(--chakra-colors-brand-500)",
                  }}
                />
              </InputGroup>
            </FormControl>

            <FormControl>
              <FormLabel fontSize="sm" fontWeight="semibold" mb={1}>
                Estado
              </FormLabel>
              <Select
                size="sm"
                h="9"
                bg="white"
                borderColor={borderColor}
                borderRadius="lg"
                value={statusFilter}
                onChange={(e) => onStatusFilterChange(e.target.value)}
                _focus={{
                  borderColor: "brand.500",
                  boxShadow: "0 0 0 1px var(--chakra-colors-brand-500)",
                }}
              >
                <option value="all">Todos</option>
                <option value="uploaded">Subida</option>
                <option value="extracting">Extrayendo</option>
                <option value="extracted">Extraida</option>
                <option value="validated">Validada</option>
                <option value="pending">Pendiente</option>
                <option value="paid">Pagada</option>
                <option value="failed">Fallida</option>
              </Select>
            </FormControl>

            <FormControl>
              <FormLabel fontSize="sm" fontWeight="semibold" mb={1}>
                Proyecto
              </FormLabel>
              <Select
                size="sm"
                h="9"
                bg="white"
                borderColor={borderColor}
                borderRadius="lg"
                value={projectFilter}
                onChange={(e) => onProjectFilterChange(e.target.value)}
                _focus={{
                  borderColor: "brand.500",
                  boxShadow: "0 0 0 1px var(--chakra-colors-brand-500)",
                }}
              >
                <option value="all">Todos</option>
                {activeProjects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </Select>
            </FormControl>

            <FormControl>
              <FormLabel fontSize="sm" fontWeight="semibold" mb={1}>
                Departamento
              </FormLabel>
              <Select
                size="sm"
                h="9"
                bg="white"
                borderColor={borderColor}
                borderRadius="lg"
                value={departmentFilter}
                onChange={(e) => onDepartmentFilterChange(e.target.value)}
                _focus={{
                  borderColor: "brand.500",
                  boxShadow: "0 0 0 1px var(--chakra-colors-brand-500)",
                }}
              >
                <option value="all">Todos</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </Select>
            </FormControl>

            <FormControl>
              <FormLabel fontSize="sm" fontWeight="semibold" mb={1}>
                Fecha
              </FormLabel>
              <Select
                size="sm"
                h="9"
                bg="white"
                borderColor={borderColor}
                borderRadius="lg"
                value={dateRange}
                onChange={(e) => onDateRangeChange(e.target.value)}
                _focus={{
                  borderColor: "brand.500",
                  boxShadow: "0 0 0 1px var(--chakra-colors-brand-500)",
                }}
              >
                <option value="all">Todas</option>
                <option value="today">Hoy</option>
                <option value="last7">?ltimos 7 d?as</option>
                <option value="last30">?ltimos 30 d?as</option>
                <option value="thisMonth">Este mes</option>
                <option value="lastMonth">Mes anterior</option>
              </Select>
            </FormControl>
          </SimpleGrid>

          <Flex justify="flex-end">
            <Button
              size="sm"
              h="9"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                onClearFilters();
              }}
              borderRadius="lg"
              borderWidth="2px"
              borderColor="brand.500"
              color="brand.600"
              fontWeight="semibold"
              _hover={{
                bg: "brand.50",
                borderColor: "brand.600",
              }}
            >
              Limpiar filtros
            </Button>
          </Flex>
        </Stack>
      </Collapse>
    </Box>
  );
};


