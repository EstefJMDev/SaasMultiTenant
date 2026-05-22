import React from "react";
import {
  Box,
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
  Stack,
  Switch,
  Text,
  useColorModeValue,
} from "@chakra-ui/react";
import { ChevronDownIcon, ChevronUpIcon } from "@chakra-ui/icons";

interface ContractsFiltersCardProps {
  isOpen: boolean;
  onToggle: () => void;
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  pendingOnly: boolean;
  onPendingOnlyChange: (value: boolean) => void;
  isSuperAdmin: boolean;
  selectedTenantId: string;
}

export const ContractsFiltersCard: React.FC<ContractsFiltersCardProps> = ({
  isOpen,
  onToggle,
  searchTerm,
  onSearchTermChange,
  statusFilter,
  onStatusFilterChange,
  pendingOnly,
  onPendingOnlyChange,
  isSuperAdmin,
  selectedTenantId,
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
          >
            <Icon viewBox="0 0 24 24" boxSize={4} color="white">
              <path
                fill="currentColor"
                d="M3,5H21V7H3V5M6,10H18V12H6V10M10,15H14V17H10V15Z"
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
          color="gray.500"
        />
      </Flex>

      <Collapse in={isOpen} animateOpacity>
        <Stack spacing={3} pt={4}>
          {isSuperAdmin && (
            <FormControl>
              <FormLabel fontSize="sm" fontWeight="semibold" mb={1}>
                Tenant
              </FormLabel>
              <Text fontSize="sm" color="gray.500">
                {selectedTenantId
                  ? `Tenant activo: ${selectedTenantId}.`
                  : "No hay tenant seleccionado."}{" "}
                Cambia el tenant desde el selector superior.
              </Text>
            </FormControl>
          )}

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
                placeholder="ID, proveedor o titulo"
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
              <option value="DRAFT">Borrador</option>
              <option value="PENDING_SUPPLIER">Pendiente Proveedor</option>
              <option value="PENDING_JEFE_OBRA">Pendiente Jefe de Obra</option>
              <option value="PENDING_GERENCIA">Pendiente Gerencia</option>
              <option value="PENDING_ADMIN">Pendiente Administraci?n</option>
              <option value="PENDING_COMPRAS">Pendiente Compras</option>
              <option value="PENDING_JURIDICO">Pendiente Jur?dico</option>
              <option value="IN_SIGNATURE">En firma</option>
              <option value="SIGNED">Firmado</option>
              <option value="REJECTED">Rechazado</option>
            </Select>
          </FormControl>

          <HStack justify="space-between" align="center">
            <Text fontSize="sm" fontWeight="semibold">
              Solo pendientes
            </Text>
            <Switch
              isChecked={pendingOnly}
              colorScheme="brand"
              onChange={(e) => onPendingOnlyChange(e.target.checked)}
            />
          </HStack>
        </Stack>
      </Collapse>
    </Box>
  );
};


