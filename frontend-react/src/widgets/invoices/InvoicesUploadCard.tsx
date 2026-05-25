import React from "react";
import {
  Box,
  Button,
  Flex,
  FormControl,
  FormLabel,
  Heading,
  HStack,
  Icon,
  Input,
  Select,
  Text,
  useColorModeValue,
  VStack,
  Grid,
  GridItem,
} from "@chakra-ui/react";

import type { ErpProject, ProjectBudgetMilestone } from "@api/erpReports";
interface InvoicesUploadCardProps {
  isSuperAdmin: boolean;
  tenantReady: boolean;
  selectedTenantId: string;
  file: File | null;
  onFileChange: (file: File | null) => void;
  uploadProjectId: string;
  onUploadProjectChange: (value: string) => void;
  activeProjects: ErpProject[];
  subsidizable: string;
  onSubsidizableChange: (value: string) => void;
  expenseType: string;
  onExpenseTypeChange: (value: string) => void;
  subsidizableDestinations: string[];
  nonSubsidizableDestinations: string[];
  budgetMilestoneId: string;
  onBudgetMilestoneChange: (value: string) => void;
  budgetMilestones: ProjectBudgetMilestone[];
  onUpload: () => void;
  isUploading: boolean;
}

export const InvoicesUploadCard: React.FC<InvoicesUploadCardProps> = ({
  isSuperAdmin,
  tenantReady,
  selectedTenantId,
  file,
  onFileChange,
  uploadProjectId,
  onUploadProjectChange,
  activeProjects,
  subsidizable,
  onSubsidizableChange,
  expenseType,
  onExpenseTypeChange,
  subsidizableDestinations,
  nonSubsidizableDestinations,
  budgetMilestoneId,
  onBudgetMilestoneChange,
  budgetMilestones,
  onUpload,
  isUploading,
}) => {
  const cardBg = useColorModeValue("white", "gray.700");
  const borderColor = useColorModeValue("gray.200", "gray.600");
  const selectedBg = useColorModeValue("brand.50", "brand.900");
  const selectedBorder = useColorModeValue("brand.500", "brand.400");
  const optionBg = useColorModeValue("white", "gray.800");
  const subtleText = useColorModeValue("gray.600", "gray.300");

  const destinationOptions =
    subsidizable === "subsidizable"
      ? subsidizableDestinations
      : nonSubsidizableDestinations;

  return (
    <Box
      w="full"
      maxW={{ base: "full", lg: "900px" }}
      bg={cardBg}
      borderRadius="xl"
      p={{ base: 4, md: 5 }}
      borderWidth="1px"
      borderColor={borderColor}
      boxShadow="sm"
      transition="all 0.3s"
      _hover={{ boxShadow: "md" }}
    >
      <HStack spacing={2} mb={4}>
        <Box
          w="8"
          h="8"
          bgGradient="linear(to-br, brand.500, brand.600)"
          borderRadius="lg"
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          <Icon viewBox="0 0 24 24" boxSize={4} color="white">
            <path
              fill="currentColor"
              d="M9,16V10H5L12,3L19,10H15V16H9M5,20V18H19V20H5Z"
            />
          </Icon>
        </Box>
        <Heading size="sm" fontWeight="bold">
          Subir factura
        </Heading>
      </HStack>

      <Grid
        templateColumns={{ base: "1fr", md: "repeat(2, 1fr)" }}
        gap={4}
        mb={4}
      >
        {isSuperAdmin && (
          <GridItem>
            <FormControl>
              <FormLabel fontSize="sm" fontWeight="semibold" mb={2}>
                Tenant
              </FormLabel>
              <Text fontSize="sm" color={subtleText}>
                {selectedTenantId
                  ? `Tenant activo: ${selectedTenantId}.`
                  : "No hay tenant seleccionado."}{" "}
                Cambia el tenant desde el selector superior.
              </Text>
            </FormControl>
          </GridItem>
        )}

        <GridItem colSpan={{ base: 1, md: isSuperAdmin ? 1 : 2 }}>
          <FormControl>
            <FormLabel fontSize="sm" fontWeight="semibold" mb={2}>
              Proyecto
            </FormLabel>
            <Select
              size="md"
              h="10"
              bg="white"
              borderColor={borderColor}
              borderRadius="lg"
              value={uploadProjectId}
              onChange={(e) => onUploadProjectChange(e.target.value)}
              placeholder={
                activeProjects.length > 0
                  ? "Selecciona proyecto activo"
                  : "No hay proyectos activos"
              }
              isDisabled={
                activeProjects.length === 0 || (!tenantReady && !isSuperAdmin)
              }
              _focus={{
                borderColor: "brand.500",
                boxShadow: "0 0 0 1px var(--chakra-colors-brand-500)",
              }}
            >
              {activeProjects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </Select>
          </FormControl>
        </GridItem>

        <GridItem colSpan={{ base: 1, md: 2 }}>
          <FormControl>
            <FormLabel fontSize="sm" fontWeight="semibold" mb={2}>
              Archivo PDF / Imagen
            </FormLabel>
            <Box
              as="label"
              htmlFor="invoice-upload"
              borderWidth="2px"
              borderStyle="dashed"
              borderColor="brand.300"
              borderRadius="lg"
              p={4}
              textAlign="center"
              cursor="pointer"
              transition="all 0.3s"
              minH="150px"
              display="flex"
              alignItems="center"
              justifyContent="center"
              _hover={{
                borderColor: "brand.500",
                bg: "brand.50",
                transform: "scale(1.01)",
              }}
              bg={file ? "brand.50" : "white"}
            >
              <VStack spacing={1}>
                <Box
                  w="10"
                  h="10"
                  bgGradient="linear(to-br, brand.100, brand.200)"
                  borderRadius="lg"
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                >
                  <Icon viewBox="0 0 24 24" boxSize={5} color="brand.600">
                    <path
                      fill="currentColor"
                      d="M9,16V10H5L12,3L19,10H15V16H9M5,20V18H19V20H5Z"
                    />
                  </Icon>
                </Box>
                <Text fontSize="sm" fontWeight="semibold" color="gray.700">
                  {file ? file.name : "Arrastra tu archivo aquí o haz clic"}
                </Text>
                <Text fontSize="xs" color="gray.500">
                  PDF, PNG, JPG (máx. 10MB)
                </Text>
              </VStack>
              <Input
                id="invoice-upload"
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.tiff,.bmp"
                onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
                display="none"
              />
            </Box>
          </FormControl>
        </GridItem>
      </Grid>

      <Grid templateColumns={{ base: "1fr", md: "repeat(2, 1fr)" }} gap={4} mb={4}>
        <GridItem colSpan={2}>
          <FormControl isRequired>
            <FormLabel fontSize="sm" fontWeight="semibold" mb={1}>
              Tipo de gasto
            </FormLabel>
            <Text fontSize="xs" color={subtleText} mb={3}>
              Clasifica si este gasto es elegible para subvencion
            </Text>
            <HStack spacing={3}>
              <Box
                flex="1"
                p={3}
                borderRadius="lg"
                borderWidth="1px"
                borderColor={
                  subsidizable === "subsidizable" ? selectedBorder : borderColor
                }
                bg={subsidizable === "subsidizable" ? selectedBg : optionBg}
                cursor="pointer"
                transition="all 0.2s"
                onClick={() => onSubsidizableChange("subsidizable")}
              >
                <Flex align="center" gap={2}>
                  <Box
                    w="5"
                    h="5"
                    borderRadius="full"
                    borderWidth="2px"
                    borderColor={selectedBorder}
                    bg={subsidizable === "subsidizable" ? selectedBorder : "transparent"}
                  />
                  <Icon viewBox="0 0 24 24" boxSize={4} color="brand.600">
                    <path
                      fill="currentColor"
                      d="M9,16.17L4.83,12L3.42,13.41L9,19L21,7L19.59,5.59L9,16.17Z"
                    />
                  </Icon>
                  <Text fontWeight="semibold">Subvencionable</Text>
                </Flex>
              </Box>
              <Box
                flex="1"
                p={3}
                borderRadius="lg"
                borderWidth="1px"
                borderColor={
                  subsidizable === "non_subsidizable"
                    ? selectedBorder
                    : borderColor
                }
                bg={subsidizable === "non_subsidizable" ? selectedBg : optionBg}
                cursor="pointer"
                transition="all 0.2s"
                onClick={() => onSubsidizableChange("non_subsidizable")}
              >
                <Flex align="center" gap={2}>
                  <Box
                    w="5"
                    h="5"
                    borderRadius="full"
                    borderWidth="2px"
                    borderColor={selectedBorder}
                    bg={
                      subsidizable === "non_subsidizable"
                        ? selectedBorder
                        : "transparent"
                    }
                  />
                  <Icon viewBox="0 0 24 24" boxSize={4} color="red.500">
                    <path
                      fill="currentColor"
                      d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z"
                    />
                  </Icon>
                  <Text fontWeight="semibold">No subvencionable</Text>
                </Flex>
              </Box>
            </HStack>
          </FormControl>
        </GridItem>

        <GridItem>
          <FormControl isRequired>
            <FormLabel fontSize="sm" fontWeight="semibold" mb={1}>
              Destino del gasto
            </FormLabel>
            <Text fontSize="xs" color={subtleText} mb={2}>
              Especifica la categoria segun el tipo de gasto
            </Text>
            <Select
              size="md"
              h="10"
              bg="white"
              borderColor={borderColor}
              borderRadius="lg"
              value={expenseType}
              onChange={(e) => onExpenseTypeChange(e.target.value)}
              placeholder="Selecciona destino"
              isDisabled={!subsidizable}
              _focus={{
                borderColor: "brand.500",
                boxShadow: "0 0 0 1px var(--chakra-colors-brand-500)",
              }}
            >
              {destinationOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          </FormControl>
        </GridItem>

        <GridItem>
          <FormControl>
            <FormLabel fontSize="sm" fontWeight="semibold" mb={1}>
              Hito asociado (opcional)
            </FormLabel>
            <Text fontSize="xs" color={subtleText} mb={2}>
              Vincula esta factura a un hito especifico del proyecto
            </Text>
            <Select
              size="md"
              h="10"
              bg="white"
              borderColor={borderColor}
              borderRadius="lg"
              value={budgetMilestoneId}
              onChange={(e) => onBudgetMilestoneChange(e.target.value)}
              placeholder="Sin hito asociado"
              isDisabled={!uploadProjectId}
              _focus={{
                borderColor: "brand.500",
                boxShadow: "0 0 0 1px var(--chakra-colors-brand-500)",
              }}
            >
              {budgetMilestones.map((milestone) => (
                <option key={milestone.id} value={milestone.id}>
                  {milestone.name}
                </option>
              ))}
            </Select>
          </FormControl>
        </GridItem>
      </Grid>

      <Button
        bgGradient="linear(to-r, brand.500, brand.600)"
        color="white"
        size="md"
        width="full"
        borderRadius="lg"
        _hover={{ bgGradient: "linear(to-r, brand.600, brand.700)" }}
        onClick={onUpload}
        isLoading={isUploading}
        isDisabled={
          !file ||
          !tenantReady ||
          !uploadProjectId ||
          !subsidizable ||
          !expenseType
        }
        fontWeight="bold"
        h="10"
      >
        Subir y procesar
      </Button>
    </Box>
  );
};


