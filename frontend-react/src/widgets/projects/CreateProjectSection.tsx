import React from "react";
import {
  Box,
  Button,
  Flex,
  FormControl,
  FormLabel,
  Input,
  Select,
  SimpleGrid,
  Stack,
  Text,
} from "@chakra-ui/react";
import type {
  ProjectActivityForm,
  ProjectMilestoneForm,
} from "@shared/utils/erp";
import type { Department } from "@entities/hr";

const Icon = ({ d, size = 14 }: { d: string | string[]; size?: number }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    width={size}
    height={size}
  >
    {Array.isArray(d)
      ? d.map((path, index) => <path key={index} d={path} />)
      : <path d={d} />}
  </svg>
);

const icons = {
  plus: ["M12 5v14M5 12h14"],
  trash: ["M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"],
  folder: [
    "M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z",
  ],
  flag: [
    "M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7",
  ],
  info: [
    "M12 8h.01M12 12v4M12 22a10 10 0 100-20 10 10 0 000 20z",
  ],
  save: [
    "M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z",
    "M17 21v-8H7v8",
    "M7 3v5h8",
  ],
  tenant: [
    "M3 21h18M3 7l9-4 9 4M4 7v14M20 7v14M8 21v-4h8v4M8 11h8M8 15h8",
  ],
  chevron: ["M9 18l6-6-6-6"],
};

const SectionCard = ({
  title,
  icon,
  action,
  children,
  isEmpty,
  emptyText,
}: {
  title: string;
  icon: string | string[];
  action?: React.ReactNode;
  children?: React.ReactNode;
  isEmpty?: boolean;
  emptyText?: string;
}) => (
  <Box
    borderRadius="12px"
    border="1px solid"
    borderColor="gray.100"
    overflow="hidden"
    bg="white"
    boxShadow="0 1px 4px rgba(0,0,0,0.05)"
  >
    <Flex
      px={5}
      py={3}
      align="center"
      justify="space-between"
      borderBottom="1px solid"
      borderColor="gray.100"
      bg="gray.50"
    >
      <Flex align="center" gap={2}>
        <Box
          w="22px"
          h="22px"
          borderRadius="6px"
          bg="brand.50"
          color="brand.700"
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          <Icon d={icon} size={12} />
        </Box>
        <Text fontSize="13px" fontWeight={600} color="gray.800" letterSpacing="-0.01em">
          {title}
        </Text>
      </Flex>
      {action}
    </Flex>

    <Box px={5} py={4}>
      {isEmpty ? (
        <Flex
          align="center"
          gap={2}
          py={4}
          px={3}
          bg="gray.50"
          borderRadius="8px"
          border="1px dashed"
          borderColor="gray.200"
        >
          <Box color="gray.300">
            <Icon d={icons.info} size={14} />
          </Box>
          <Text fontSize="12.5px" color="gray.400">
            {emptyText}
          </Text>
        </Flex>
      ) : (
        children
      )}
    </Box>
  </Box>
);

const ActionBtn = ({
  onClick,
  icon,
  children,
  variant = "ghost",
  colorScheme = "brand",
  size = "sm",
}: {
  onClick: () => void;
  icon?: string | string[];
  children: React.ReactNode;
  variant?: string;
  colorScheme?: string;
  size?: string;
}) => (
  <Button
    size={size}
    variant={variant}
    colorScheme={colorScheme}
    onClick={onClick}
    leftIcon={icon ? <Icon d={icon} size={12} /> : undefined}
    fontSize="12px"
    fontWeight={600}
    h="30px"
    px={3}
    borderRadius="7px"
  >
    {children}
  </Button>
);

const StyledInput = (props: React.ComponentProps<typeof Input>) => (
  <Input
    {...props}
    fontSize="13px"
    h="36px"
    borderRadius="8px"
    borderColor="gray.200"
    _hover={{ borderColor: "brand.300" }}
    _focus={{ borderColor: "brand.500", boxShadow: "0 0 0 3px rgba(0,102,43,0.08)" }}
    bg="white"
  />
);

const StyledSelect = (props: React.ComponentProps<typeof Select>) => (
  <Select
    {...props}
    fontSize="13px"
    h="36px"
    borderRadius="8px"
    borderColor="gray.200"
    _hover={{ borderColor: "brand.300" }}
    _focus={{ borderColor: "brand.500", boxShadow: "0 0 0 3px rgba(0,102,43,0.08)" }}
    bg="white"
  />
);

const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <FormLabel
    fontSize="11.5px"
    fontWeight={600}
    color="gray.600"
    letterSpacing="0.01em"
    mb={1}
  >
    {children}
  </FormLabel>
);

const parseWeightInput = (raw: string): number => {
  const cleaned = raw.replace(",", ".").trim();
  if (!cleaned) return Number.NaN;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

interface CreateProjectSectionProps {
  isSuperAdmin: boolean;
  selectedTenantId: string;
  projectName: string;
  onProjectNameChange: (value: string) => void;
  projectDescription: string;
  onProjectDescriptionChange: (value: string) => void;
  projectType: "regional" | "nacional" | "internacional";
  onProjectTypeChange: (value: "regional" | "nacional" | "internacional") => void;
  projectStart: string;
  onProjectStartChange: (value: string) => void;
  projectEnd: string;
  onProjectEndChange: (value: string) => void;
  projectLoanPercent: string;
  onProjectLoanPercentChange: (value: string) => void;
  projectSubsidyPercent: string;
  onProjectSubsidyPercentChange: (value: string) => void;
  departments: Department[];
  projectDepartmentId: number | "";
  onProjectDepartmentChange: (value: number | "") => void;
  projectActivities: ProjectActivityForm[];
  setProjectActivities: React.Dispatch<React.SetStateAction<ProjectActivityForm[]>>;
  onAddActivity: () => void;
  onAddSubactivity: (activityId: string) => void;
  projectMilestones: ProjectMilestoneForm[];
  setProjectMilestones: React.Dispatch<React.SetStateAction<ProjectMilestoneForm[]>>;
  onAddMilestone: () => void;
  onSaveProject: () => void;
  isSaving: boolean;
  subtleText: string;
  cardBg: string;
}

export const CreateProjectSection: React.FC<CreateProjectSectionProps> = ({
  isSuperAdmin,
  selectedTenantId,
  projectName,
  onProjectNameChange,
  projectDescription,
  onProjectDescriptionChange,
  projectType,
  onProjectTypeChange,
  projectStart,
  onProjectStartChange,
  projectEnd,
  onProjectEndChange,
  projectLoanPercent,
  onProjectLoanPercentChange,
  projectSubsidyPercent,
  onProjectSubsidyPercentChange,
  departments,
  projectDepartmentId,
  onProjectDepartmentChange,
  projectActivities,
  setProjectActivities,
  onAddActivity,
  onAddSubactivity,
  projectMilestones,
  setProjectMilestones,
  onAddMilestone,
  onSaveProject,
  isSaving,
}) => (
  <Stack spacing={5} maxW="900px">
    <SectionCard title="Información del proyecto" icon={icons.folder}>
      <Stack spacing={4}>
        {isSuperAdmin && (
          <Flex
            align="center"
            gap={3}
            p={3}
            borderRadius="8px"
            bg="blue.50"
            border="1px solid"
            borderColor="blue.100"
          >
            <Box color="blue.500">
              <Icon d={icons.tenant} size={14} />
            </Box>
            <Text fontSize="12px" color="blue.700">
              <Text as="span" fontWeight={600}>
                Tenant activo:
              </Text>{" "}
              {selectedTenantId || "Ninguno seleccionado"} - cambia desde el selector superior.
            </Text>
          </Flex>
        )}

        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
          <FormControl isRequired>
            <FieldLabel>Nombre del proyecto</FieldLabel>
            <StyledInput
              value={projectName}
              onChange={(event) => onProjectNameChange(event.target.value)}
              placeholder="Ej: Torre Norte II"
            />
          </FormControl>

          <FormControl>
            <FieldLabel>Descripción</FieldLabel>
            <StyledInput
              value={projectDescription}
              onChange={(event) => onProjectDescriptionChange(event.target.value)}
              placeholder="Breve descripción del proyecto"
            />
          </FormControl>
        </SimpleGrid>

        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
          <FormControl>
            <FieldLabel>Tipo de proyecto</FieldLabel>
            <StyledSelect
              value={projectType}
              onChange={(event) =>
                onProjectTypeChange(
                  event.target.value as "regional" | "nacional" | "internacional",
                )
              }
            >
              <option value="regional">Regional</option>
              <option value="nacional">Nacional</option>
              <option value="internacional">Internacional</option>
            </StyledSelect>
          </FormControl>

          <FormControl>
            <FieldLabel>Departamento</FieldLabel>
            <StyledSelect
              placeholder="Selecciona departamento"
              value={projectDepartmentId === "" ? "" : String(projectDepartmentId)}
              onChange={(event) =>
                onProjectDepartmentChange(
                  event.target.value ? Number(event.target.value) : "",
                )
              }
            >
              {departments.map((dept) => (
                <option key={dept.id} value={dept.id}>
                  {dept.name}
                </option>
              ))}
            </StyledSelect>
          </FormControl>
        </SimpleGrid>

        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
          <FormControl>
            <FieldLabel>Fecha de inicio</FieldLabel>
            <StyledInput
              type="date"
              value={projectStart}
              onChange={(event) => onProjectStartChange(event.target.value)}
            />
          </FormControl>

          <FormControl>
            <FieldLabel>Fecha de fin</FieldLabel>
            <StyledInput
              type="date"
              value={projectEnd}
              onChange={(event) => onProjectEndChange(event.target.value)}
            />
          </FormControl>
        </SimpleGrid>

        <Box p={4} borderRadius="8px" bg="gray.50" border="1px solid" borderColor="gray.100">
          <Text
            fontSize="11px"
            fontWeight={700}
            letterSpacing="0.07em"
            textTransform="uppercase"
            color="gray.500"
            mb={3}
          >
            Financiación
          </Text>
          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
            <FormControl>
              <FieldLabel>% Préstamo</FieldLabel>
              <StyledInput
                type="text"
                inputMode="decimal"
                value={projectLoanPercent}
                onChange={(event) => onProjectLoanPercentChange(event.target.value)}
                placeholder="0"
              />
            </FormControl>

            <FormControl>
              <FieldLabel>% Subvención no reembolsable</FieldLabel>
              <StyledInput
                type="text"
                inputMode="decimal"
                value={projectSubsidyPercent}
                onChange={(event) => onProjectSubsidyPercentChange(event.target.value)}
                placeholder="0"
              />
            </FormControl>
          </SimpleGrid>
        </Box>
      </Stack>
    </SectionCard>

    <SectionCard
      title="Actividades"
      icon={icons.chevron}
      isEmpty={projectActivities.length === 0}
      emptyText="Añade actividades con peso y fechas para estructurar el proyecto."
      action={
        <ActionBtn onClick={onAddActivity} icon={icons.plus}>
          Añadir actividad
        </ActionBtn>
      }
    >
      <Stack spacing={3}>
        {projectActivities.map((activity, idx) => (
          <Box
            key={activity.id}
            borderRadius="10px"
            border="1px solid"
            borderColor="gray.100"
            overflow="hidden"
          >
            <Flex
              px={4}
              py={2.5}
              align="center"
              justify="space-between"
              bg="brand.50"
              borderBottom="1px solid"
              borderColor="brand.100"
            >
              <Flex align="center" gap={2}>
                <Box
                  w="18px"
                  h="18px"
                  borderRadius="full"
                  bg="brand.100"
                  color="brand.700"
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                  fontSize="10px"
                  fontWeight={700}
                >
                  {idx + 1}
                </Box>
                <Text fontSize="12.5px" fontWeight={600} color="brand.800">
                  {activity.name || `Actividad ${idx + 1}`}
                </Text>
              </Flex>
              <ActionBtn
                onClick={() =>
                  setProjectActivities((prev) =>
                    prev.filter((item) => item.id !== activity.id),
                  )
                }
                icon={icons.trash}
                colorScheme="red"
                variant="ghost"
                size="xs"
              >
                Eliminar
              </ActionBtn>
            </Flex>

            <Box px={4} py={3} bg="white">
              <SimpleGrid columns={{ base: 1, md: 4 }} spacing={3} mb={3}>
                <FormControl gridColumn={{ md: "span 2" }}>
                  <FieldLabel>Nombre</FieldLabel>
                  <StyledInput
                    value={activity.name}
                    placeholder="Nombre de la actividad"
                    onChange={(event) =>
                      setProjectActivities((prev) =>
                        prev.map((item) =>
                          item.id === activity.id
                            ? { ...item, name: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                </FormControl>

                <FormControl>
                  <FieldLabel>Peso %</FieldLabel>
                  <StyledInput
                    type="number"
                    value={Number.isFinite(activity.weight) ? activity.weight : ""}
                    placeholder="0"
                    onChange={(event) =>
                      setProjectActivities((prev) =>
                        prev.map((item) =>
                          item.id === activity.id
                            ? { ...item, weight: parseWeightInput(event.target.value) }
                            : item,
                        ),
                      )
                    }
                  />
                </FormControl>

                <Box />

                <FormControl>
                  <FieldLabel>Inicio</FieldLabel>
                  <StyledInput
                    type="date"
                    value={activity.start}
                    onChange={(event) =>
                      setProjectActivities((prev) =>
                        prev.map((item) =>
                          item.id === activity.id
                            ? { ...item, start: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                </FormControl>

                <FormControl>
                  <FieldLabel>Fin</FieldLabel>
                  <StyledInput
                    type="date"
                    value={activity.end}
                    onChange={(event) =>
                      setProjectActivities((prev) =>
                        prev.map((item) =>
                          item.id === activity.id
                            ? { ...item, end: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                </FormControl>
              </SimpleGrid>

              <Box mt={1} pt={3} borderTop="1px dashed" borderColor="gray.100">
                <Flex align="center" justify="space-between" mb={2}>
                  <Text
                    fontSize="11px"
                    fontWeight={600}
                    color="gray.500"
                    textTransform="uppercase"
                    letterSpacing="0.06em"
                  >
                    Subactividades
                  </Text>
                  <ActionBtn
                    onClick={() => onAddSubactivity(activity.id)}
                    icon={icons.plus}
                    size="xs"
                    variant="outline"
                  >
                    Añadir
                  </ActionBtn>
                </Flex>

                {activity.subactivities.length === 0 ? (
                  <Text fontSize="11.5px" color="gray.400" fontStyle="italic">
                    Sin subactividades.
                  </Text>
                ) : (
                  <Stack spacing={2}>
                    {activity.subactivities.map((sub, subIndex) => (
                      <Flex
                        key={sub.id}
                        align="flex-end"
                        gap={3}
                        p={3}
                        bg="gray.50"
                        borderRadius="8px"
                        border="1px solid"
                        borderColor="gray.100"
                        flexWrap="wrap"
                      >
                        <Box
                          w="16px"
                          h="16px"
                          borderRadius="full"
                          bg="gray.200"
                          flexShrink={0}
                          alignSelf="center"
                          display="flex"
                          alignItems="center"
                          justifyContent="center"
                          fontSize="9px"
                          fontWeight={700}
                          color="gray.600"
                        >
                          {subIndex + 1}
                        </Box>

                        <FormControl flex="2" minW="120px">
                          <FieldLabel>Subactividad</FieldLabel>
                          <StyledInput
                            value={sub.name}
                            placeholder="Nombre"
                            onChange={(event) =>
                              setProjectActivities((prev) =>
                                prev.map((item) =>
                                  item.id === activity.id
                                    ? {
                                        ...item,
                                        subactivities: item.subactivities.map((s) =>
                                          s.id === sub.id
                                            ? { ...s, name: event.target.value }
                                            : s,
                                        ),
                                      }
                                    : item,
                                ),
                              )
                            }
                          />
                        </FormControl>

                        <FormControl flex="1" minW="80px">
                          <FieldLabel>Peso %</FieldLabel>
                          <StyledInput
                            type="number"
                            value={Number.isFinite(sub.weight) ? sub.weight : ""}
                            placeholder="0"
                            onChange={(event) =>
                              setProjectActivities((prev) =>
                                prev.map((item) =>
                                  item.id === activity.id
                                    ? {
                                        ...item,
                                        subactivities: item.subactivities.map((s) =>
                                          s.id === sub.id
                                            ? { ...s, weight: parseWeightInput(event.target.value) }
                                            : s,
                                        ),
                                      }
                                    : item,
                                ),
                              )
                            }
                          />
                        </FormControl>

                        <FormControl flex="1" minW="120px">
                          <FieldLabel>Inicio</FieldLabel>
                          <StyledInput
                            type="date"
                            value={sub.start}
                            onChange={(event) =>
                              setProjectActivities((prev) =>
                                prev.map((item) =>
                                  item.id === activity.id
                                    ? {
                                        ...item,
                                        subactivities: item.subactivities.map((s) =>
                                          s.id === sub.id
                                            ? { ...s, start: event.target.value }
                                            : s,
                                        ),
                                      }
                                    : item,
                                ),
                              )
                            }
                          />
                        </FormControl>

                        <FormControl flex="1" minW="120px">
                          <FieldLabel>Fin</FieldLabel>
                          <StyledInput
                            type="date"
                            value={sub.end}
                            onChange={(event) =>
                              setProjectActivities((prev) =>
                                prev.map((item) =>
                                  item.id === activity.id
                                    ? {
                                        ...item,
                                        subactivities: item.subactivities.map((s) =>
                                          s.id === sub.id
                                            ? { ...s, end: event.target.value }
                                            : s,
                                        ),
                                      }
                                    : item,
                                ),
                              )
                            }
                          />
                        </FormControl>

                        <Button
                          size="xs"
                          variant="ghost"
                          colorScheme="red"
                          onClick={() =>
                            setProjectActivities((prev) =>
                              prev.map((item) =>
                                item.id === activity.id
                                  ? {
                                      ...item,
                                      subactivities: item.subactivities.filter(
                                        (s) => s.id !== sub.id,
                                      ),
                                    }
                                  : item,
                              ),
                            )
                          }
                          h="36px"
                          px={2}
                          borderRadius="7px"
                          alignSelf="flex-end"
                        >
                          <Icon d={icons.trash} size={13} />
                        </Button>
                      </Flex>
                    ))}
                  </Stack>
                )}
              </Box>
            </Box>
          </Box>
        ))}
      </Stack>
    </SectionCard>

    <SectionCard
      title="Hitos"
      icon={icons.flag}
      isEmpty={projectMilestones.length === 0}
      emptyText="Añade hitos para marcar puntos clave del proyecto."
      action={
        <ActionBtn onClick={onAddMilestone} icon={icons.plus}>
          Añadir hito
        </ActionBtn>
      }
    >
      <Stack spacing={2}>
        {projectMilestones.map((milestone, idx) => (
          <Flex
            key={milestone.id}
            align="flex-end"
            gap={3}
            p={3}
            bg="gray.50"
            borderRadius="8px"
            border="1px solid"
            borderColor="gray.100"
            flexWrap="wrap"
          >
            <Box
              w="20px"
              h="20px"
              borderRadius="full"
              bg="brand.100"
              flexShrink={0}
              alignSelf="center"
              display="flex"
              alignItems="center"
              justifyContent="center"
              fontSize="10px"
              fontWeight={700}
              color="brand.700"
            >
              {idx + 1}
            </Box>

            <FormControl flex="2" minW="160px">
              <FieldLabel>Nombre del hito</FieldLabel>
              <StyledInput
                value={milestone.name}
                placeholder="Ej: Entrega de fase 1"
                onChange={(event) =>
                  setProjectMilestones((prev) =>
                    prev.map((item) =>
                      item.id === milestone.id
                        ? { ...item, name: event.target.value }
                        : item,
                    ),
                  )
                }
              />
            </FormControl>

            <FormControl flex="1" minW="140px">
              <FieldLabel>Inicio</FieldLabel>
              <StyledInput
                type="date"
                value={milestone.start}
                onChange={(event) =>
                  setProjectMilestones((prev) =>
                    prev.map((item) =>
                      item.id === milestone.id
                        ? { ...item, start: event.target.value }
                        : item,
                    ),
                  )
                }
              />
            </FormControl>

            <FormControl flex="1" minW="140px">
              <FieldLabel>Fin</FieldLabel>
              <StyledInput
                type="date"
                value={milestone.end}
                onChange={(event) =>
                  setProjectMilestones((prev) =>
                    prev.map((item) =>
                      item.id === milestone.id
                        ? { ...item, end: event.target.value }
                        : item,
                    ),
                  )
                }
              />
            </FormControl>

            <Button
              size="xs"
              variant="ghost"
              colorScheme="red"
              h="36px"
              px={2}
              borderRadius="7px"
              alignSelf="flex-end"
              onClick={() =>
                setProjectMilestones((prev) =>
                  prev.filter((item) => item.id !== milestone.id),
                )
              }
            >
              <Icon d={icons.trash} size={13} />
            </Button>
          </Flex>
        ))}
      </Stack>
    </SectionCard>

    <Flex justify="flex-end" pt={1}>
      <Button
        onClick={onSaveProject}
        isLoading={isSaving}
        loadingText="Guardando..."
        leftIcon={<Icon d={icons.save} size={14} />}
        size="md"
        h="40px"
        px={6}
        borderRadius="9px"
        fontSize="13px"
        fontWeight={700}
        bg="brand.600"
        color="white"
        _hover={{
          bg: "brand.700",
          transform: "translateY(-1px)",
          boxShadow: "0 6px 20px rgba(0,102,43,0.3)",
        }}
        _active={{ transform: "none", bg: "brand.800" }}
        transition="all 0.18s ease"
        boxShadow="0 3px 12px rgba(0,102,43,0.22)"
      >
        Guardar proyecto
      </Button>
    </Flex>
  </Stack>
);

