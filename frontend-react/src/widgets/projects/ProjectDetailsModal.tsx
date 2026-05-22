
import React from "react";
import { useTranslation } from "react-i18next";

import {
  Badge,
  Box,
  Button,
  Divider,
  Flex,
  FormControl,
  FormLabel,
  Heading,
  HStack,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  SimpleGrid,
  Select,
  Stack,
  Switch,
  Text,
  Textarea,
} from "@chakra-ui/react";

import type { Department } from "@entities/hr";
import type { ErpProject as ErpProjectApi } from "@api/erpReports";
import type { ErpActivity, ErpMilestone, ErpSubActivity } from "@api/erpStructure";
import type { ErpTask as ErpTaskApi } from "@api/erpTimeTracking";

interface ProjectDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedProject: ErpProjectApi | null;
  subtleText: string;
  selectedProjectActivities: ErpActivity[];
  selectedProjectSubactivities: ErpSubActivity[];
  selectedProjectMilestones: ErpMilestone[];
  selectedProjectTasks: ErpTaskApi[];
  editName: string;
  setEditName: (value: string) => void;
  editActive: boolean;
  setEditActive: (value: boolean) => void;
  editDescription: string;
  setEditDescription: (value: string) => void;
  editProjectType: "regional" | "nacional" | "internacional";
  setEditProjectType: (value: "regional" | "nacional" | "internacional") => void;
  departments: Department[];
  editDepartmentId: number | "";
  setEditDepartmentId: (value: number | "") => void;
  editStart: string;
  setEditStart: (value: string) => void;
  editEnd: string;
  setEditEnd: (value: string) => void;
  editLoanPercent: string;
  setEditLoanPercent: (value: string) => void;
  editSubsidyPercent: string;
  setEditSubsidyPercent: (value: string) => void;
  activityEdits: Record<number, { name: string; start: string; end: string; description: string }>;
  setActivityEdits: React.Dispatch<React.SetStateAction<Record<number, { name: string; start: string; end: string; description: string }>>>;
  subactivityEdits: Record<number, { name: string; start: string; end: string; description: string; weight: number }>;
  setSubactivityEdits: React.Dispatch<React.SetStateAction<Record<number, { name: string; start: string; end: string; description: string; weight: number }>>>;
  milestoneEdits: Record<number, { title: string; due: string; description: string }>;
  setMilestoneEdits: React.Dispatch<React.SetStateAction<Record<number, { title: string; due: string; description: string }>>>;
  newActivityDrafts: Array<{ id: string; name: string; start: string; end: string; description: string }>;
  setNewActivityDrafts: React.Dispatch<React.SetStateAction<Array<{ id: string; name: string; start: string; end: string; description: string }>>>;
  newSubactivityDrafts: Record<number, Array<{ id: string; name: string; start: string; end: string; description: string; weight: number }>>;
  setNewSubactivityDrafts: React.Dispatch<React.SetStateAction<Record<number, Array<{ id: string; name: string; start: string; end: string; description: string; weight: number }>>>>;
  newMilestoneDrafts: Array<{ id: string; title: string; due: string; description: string }>;
  setNewMilestoneDrafts: React.Dispatch<React.SetStateAction<Array<{ id: string; title: string; due: string; description: string }>>>;
  newTaskDrafts: Array<{ id: string; title: string; description: string; start: string; end: string }>;
  setNewTaskDrafts: React.Dispatch<React.SetStateAction<Array<{ id: string; title: string; description: string; start: string; end: string }>>>;
  onAddActivityDraft: () => void;
  onAddSubactivityDraft: (activityId: number) => void;
  onAddMilestoneDraft: () => void;
  onAddTaskDraft: () => void;
  onUpdateActivity: (activityId: number) => void;
  onCreateActivity: (draftId: string) => void;
  onUpdateSubactivity: (subactivityId: number) => void;
  onCreateSubactivity: (activityId: number, draftId: string) => void;
  onUpdateMilestone: (milestoneId: number) => void;
  onCreateMilestone: (draftId: string) => void;
  onCreateTask: (draftId: string) => void;
  updateActivityPending: boolean;
  createActivityPending: boolean;
  updateSubActivityPending: boolean;
  createSubActivityPending: boolean;
  updateMilestonePending: boolean;
  createMilestonePending: boolean;
  createTaskPending: boolean;
  onDeleteProject: () => void;
  deleteProjectPending: boolean;
  onUpdateProject: () => void;
  updateProjectPending: boolean;
}

export const ProjectDetailsModal: React.FC<ProjectDetailsModalProps> = ({
  isOpen,
  onClose,
  selectedProject,
  subtleText,
  selectedProjectActivities,
  selectedProjectSubactivities,
  selectedProjectMilestones,
  selectedProjectTasks,
  editName,
  setEditName,
  editActive,
  setEditActive,
  editDescription,
  setEditDescription,
  editProjectType,
  setEditProjectType,
  departments,
  editDepartmentId,
  setEditDepartmentId,
  editStart,
  setEditStart,
  editEnd,
  setEditEnd,
  editLoanPercent,
  setEditLoanPercent,
  editSubsidyPercent,
  setEditSubsidyPercent,
  activityEdits,
  setActivityEdits,
  subactivityEdits,
  setSubactivityEdits,
  milestoneEdits,
  setMilestoneEdits,
  newActivityDrafts,
  setNewActivityDrafts,
  newSubactivityDrafts,
  setNewSubactivityDrafts,
  newMilestoneDrafts,
  setNewMilestoneDrafts,
  newTaskDrafts,
  setNewTaskDrafts,
  onAddActivityDraft,
  onAddSubactivityDraft,
  onAddMilestoneDraft,
  onAddTaskDraft,
  onUpdateActivity,
  onCreateActivity,
  onUpdateSubactivity,
  onCreateSubactivity,
  onUpdateMilestone,
  onCreateMilestone,
  onCreateTask,
  updateActivityPending,
  createActivityPending,
  updateSubActivityPending,
  createSubActivityPending,
  updateMilestonePending,
  createMilestonePending,
  createTaskPending,
  onDeleteProject,
  deleteProjectPending,
  onUpdateProject,
  updateProjectPending,
}) => {
  const { i18n } = useTranslation();
  const formatDate = (value?: string | null) => {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString(i18n.language, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  };

  return (
    <Modal
    isOpen={isOpen}
    onClose={onClose}
    size="6xl"
    scrollBehavior="inside"
    isCentered
  >
    <ModalOverlay />
    <ModalContent>
      <ModalHeader borderBottomWidth="1px">
        {selectedProject ? `Proyecto: ${selectedProject.name}` : "Proyecto"}
      </ModalHeader>
      <ModalCloseButton />
      <ModalBody>
        {selectedProject ? (
          <Stack spacing={4}>
            <Stack spacing={1} fontSize="sm" color={subtleText}>
              <Text>ID: {selectedProject.id}</Text>
              {selectedProject.created_at && (
                <Text>Creado: {selectedProject.created_at}</Text>
              )}
            </Stack>

            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
              <Box borderWidth="1px" borderRadius="md" p={3}>
                <Text fontSize="xs" color={subtleText}>
                  Tipo de proyecto
                </Text>
                <Text fontWeight="semibold">
                  {selectedProject.project_type ?? "Sin tipo"}
                </Text>
              </Box>
              <Box borderWidth="1px" borderRadius="md" p={3}>
                <Text fontSize="xs" color={subtleText}>
                  Departamento
                </Text>
                <Text fontWeight="semibold">
                  {departments.find((d) => d.id === selectedProject.department_id)?.name ??
                    "Sin departamento"}
                </Text>
              </Box>
              <Box borderWidth="1px" borderRadius="md" p={3}>
                <Text fontSize="xs" color={subtleText}>
                  Inicio
                </Text>
                <Text fontWeight="semibold">
                  {formatDate(selectedProject.start_date) || "Sin inicio"}
                </Text>
              </Box>

              <Box borderWidth="1px" borderRadius="md" p={3}>
                <Text fontSize="xs" color={subtleText}>
                  Fin
                </Text>
                <Text fontWeight="semibold">
                  {formatDate(selectedProject.end_date) || "Sin fin"}
                </Text>
              </Box>

              <Box borderWidth="1px" borderRadius="md" p={3}>
                <Text fontSize="xs" color={subtleText}>
                  Actividades
                </Text>
                <Text fontWeight="semibold">
                  {selectedProjectActivities.length}
                </Text>
              </Box>

              <Box borderWidth="1px" borderRadius="md" p={3}>
                <Text fontSize="xs" color={subtleText}>
                  Hitos
                </Text>
                <Text fontWeight="semibold">
                  {selectedProjectMilestones.length}
                </Text>
              </Box>
            </SimpleGrid>

            <Divider />

            <Heading size="sm">Editar datos</Heading>

            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
              <FormControl isRequired>
                <FormLabel>Nombre</FormLabel>
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
              </FormControl>

              <FormControl>
                <FormLabel>Activo</FormLabel>
                <Switch
                  isChecked={editActive}
                  onChange={(e) => setEditActive(e.target.checked)}
                  colorScheme="brand"
                />
              </FormControl>

              <FormControl gridColumn={{ base: "auto", md: "1 / -1" }}>
                <FormLabel>Descripción</FormLabel>
                <Textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={3}
                />
              </FormControl>

              <FormControl>
                <FormLabel>Tipo de proyecto</FormLabel>
                <Select
                  value={editProjectType}
                  onChange={(e) =>
                    setEditProjectType(
                      e.target.value as "regional" | "nacional" | "internacional",
                    )
                  }
                >
                  <option value="regional">Regional</option>
                  <option value="nacional">Nacional</option>
                  <option value="internacional">Internacional</option>
                </Select>
              </FormControl>

              <FormControl>
                <FormLabel>Departamento</FormLabel>
                <Select
                  placeholder="Selecciona departamento"
                  value={editDepartmentId === "" ? "" : String(editDepartmentId)}
                  onChange={(e) =>
                    setEditDepartmentId(
                      e.target.value ? Number(e.target.value) : "",
                    )
                  }
                >
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name}
                    </option>
                  ))}
                </Select>
              </FormControl>

              <FormControl>
                <FormLabel>Inicio</FormLabel>
                <Input type="date" value={editStart} onChange={(e) => setEditStart(e.target.value)} />
              </FormControl>

              <FormControl>
                <FormLabel>Fin</FormLabel>
                <Input type="date" value={editEnd} onChange={(e) => setEditEnd(e.target.value)} />
              </FormControl>

              <FormControl>
                <FormLabel>% préstamo</FormLabel>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={editLoanPercent}
                  onChange={(e) => setEditLoanPercent(e.target.value)}
                />
              </FormControl>

              <FormControl>
                <FormLabel>% subvención no reembolsable</FormLabel>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={editSubsidyPercent}
                  onChange={(e) => setEditSubsidyPercent(e.target.value)}
                />
              </FormControl>
            </SimpleGrid>

            <Divider />

            <Flex justify="space-between" align="center">
              <Heading size="sm">Actividades</Heading>
              <Button
                size="sm"
                variant="outline"
                colorScheme="brand"
                onClick={onAddActivityDraft}
              >
                Añadir actividad
              </Button>
            </Flex>

            <Stack spacing={3}>
              {selectedProjectActivities.length === 0 && newActivityDrafts.length === 0 ? (
                <Text fontSize="sm" color={subtleText}>
                  Sin actividades vinculadas.
                </Text>
              ) : (
                <>
                {selectedProjectActivities.map((act) => {
                  const form = activityEdits[act.id] || {
                    name: "",
                    start: "",
                    end: "",
                    description: "",
                  };
                  const activitySubactivities = selectedProjectSubactivities.filter(
                    (sub) => sub.activity_id === act.id,
                  );
                  const activitySubactivityDrafts = newSubactivityDrafts[act.id] ?? [];

                  return (
                    <Box key={act.id} borderWidth="1px" borderRadius="md" p={2}>
                      <SimpleGrid columns={{ base: 1, md: 4 }} spacing={2} mb={1.5}>
                        <FormControl>
                          <FormLabel fontSize="xs">Nombre</FormLabel>
                          <Input
                            size="sm"
                            value={form.name}
                            onChange={(e) =>
                              setActivityEdits((prev) => ({
                                ...prev,
                                [act.id]: { ...form, name: e.target.value },
                              }))
                            }
                          />
                        </FormControl>

                        <FormControl>
                          <FormLabel fontSize="xs">Peso %</FormLabel>
                          <Input
                            size="sm"
                            value={form.description}
                            onChange={(e) =>
                              setActivityEdits((prev) => ({
                                ...prev,
                                [act.id]: {
                                  ...form,
                                  description: e.target.value,
                                },
                              }))
                            }
                          />
                        </FormControl>

                        <FormControl>
                          <FormLabel fontSize="xs">Inicio</FormLabel>
                          <Input
                            size="sm"
                            type="date"
                            value={form.start}
                            onChange={(e) =>
                              setActivityEdits((prev) => ({
                                ...prev,
                                [act.id]: { ...form, start: e.target.value },
                              }))
                            }
                          />
                        </FormControl>

                        <FormControl>
                          <FormLabel fontSize="xs">Fin</FormLabel>
                          <Input
                            size="sm"
                            type="date"
                            value={form.end}
                            onChange={(e) =>
                              setActivityEdits((prev) => ({
                                ...prev,
                                [act.id]: { ...form, end: e.target.value },
                              }))
                            }
                          />
                        </FormControl>
                      </SimpleGrid>

                      <HStack justify="space-between">
                        <Text fontSize="xs" color={subtleText}>
                          Subactividades:{" "}
                          {activitySubactivities.length + activitySubactivityDrafts.length}
                        </Text>
                        <HStack>
                          <Button
                            size="xs"
                            colorScheme="brand"
                            onClick={() => onUpdateActivity(act.id)}
                            isLoading={updateActivityPending}
                          >
                            Guardar actividad
                          </Button>
                        </HStack>
                      </HStack>

                      <Stack spacing={1.5} mt={1.5}>
                        {activitySubactivities.length === 0 &&
                        activitySubactivityDrafts.length === 0 ? (
                          <Text fontSize="xs" color={subtleText}>
                            Sin subactividades.
                          </Text>
                        ) : (
                          <>
                            {activitySubactivities.map((sub) => {
                              const subForm = subactivityEdits[sub.id] || {
                                name: "",
                                start: "",
                                end: "",
                                description: "",
                                weight: 0,
                              };

                              return (
                                <Box
                                  key={sub.id}
                                  borderWidth="1px"
                                  borderRadius="md"
                                  p={2}
                                  bg="gray.50"
                                >
                                  <SimpleGrid columns={{ base: 1, md: 4 }} spacing={2} mb={1.5}>
                                    <FormControl>
                                      <FormLabel fontSize="xs">Nombre</FormLabel>
                                      <Input
                                        size="sm"
                                        value={subForm.name}
                                        onChange={(e) =>
                                          setSubactivityEdits((prev) => ({
                                            ...prev,
                                            [sub.id]: { ...subForm, name: e.target.value },
                                          }))
                                        }
                                      />
                                    </FormControl>

                                    <FormControl>
                                      <FormLabel fontSize="xs">Peso %</FormLabel>
                                      <Input
                                        size="sm"
                                        type="number"
                                        value={subForm.weight}
                                        onChange={(e) =>
                                          setSubactivityEdits((prev) => ({
                                            ...prev,
                                            [sub.id]: {
                                              ...subForm,
                                              weight: Number(e.target.value),
                                            },
                                          }))
                                        }
                                      />
                                    </FormControl>

                                    <FormControl>
                                      <FormLabel fontSize="xs">Inicio</FormLabel>
                                      <Input
                                        size="sm"
                                        type="date"
                                        value={subForm.start}
                                        onChange={(e) =>
                                          setSubactivityEdits((prev) => ({
                                            ...prev,
                                            [sub.id]: { ...subForm, start: e.target.value },
                                          }))
                                        }
                                      />
                                    </FormControl>

                                    <FormControl>
                                      <FormLabel fontSize="xs">Fin</FormLabel>
                                      <Input
                                        size="sm"
                                        type="date"
                                        value={subForm.end}
                                        onChange={(e) =>
                                          setSubactivityEdits((prev) => ({
                                            ...prev,
                                            [sub.id]: { ...subForm, end: e.target.value },
                                          }))
                                        }
                                      />
                                    </FormControl>
                                  </SimpleGrid>

                                  <Flex justify="flex-end" mt={1}>
                                    <Button
                                      size="xs"
                                      colorScheme="brand"
                                      onClick={() => onUpdateSubactivity(sub.id)}
                                      isLoading={updateSubActivityPending}
                                    >
                                      Guardar subactividad
                                    </Button>
                                  </Flex>
                                </Box>
                              );
                            })}

                            {activitySubactivityDrafts.map((draft) => (
                              <Box key={draft.id} borderWidth="1px" borderRadius="md" p={2} bg="gray.50">
                                <SimpleGrid columns={{ base: 1, md: 4 }} spacing={2} mb={1.5}>
                                  <FormControl>
                                    <FormLabel fontSize="xs">Nombre</FormLabel>
                                    <Input
                                      size="sm"
                                      value={draft.name}
                                      onChange={(e) =>
                                        setNewSubactivityDrafts((prev) => ({
                                          ...prev,
                                          [act.id]: (prev[act.id] ?? []).map((item) =>
                                            item.id === draft.id ? { ...item, name: e.target.value } : item,
                                          ),
                                        }))
                                      }
                                    />
                                  </FormControl>
                                  <FormControl>
                                    <FormLabel fontSize="xs">Peso %</FormLabel>
                                    <Input
                                      size="sm"
                                      type="number"
                                      value={draft.weight}
                                      onChange={(e) =>
                                        setNewSubactivityDrafts((prev) => ({
                                          ...prev,
                                          [act.id]: (prev[act.id] ?? []).map((item) =>
                                            item.id === draft.id
                                              ? { ...item, weight: Number(e.target.value) }
                                              : item,
                                          ),
                                        }))
                                      }
                                    />
                                  </FormControl>
                                  <FormControl>
                                    <FormLabel fontSize="xs">Inicio</FormLabel>
                                    <Input
                                      size="sm"
                                      type="date"
                                      value={draft.start}
                                      onChange={(e) =>
                                        setNewSubactivityDrafts((prev) => ({
                                          ...prev,
                                          [act.id]: (prev[act.id] ?? []).map((item) =>
                                            item.id === draft.id ? { ...item, start: e.target.value } : item,
                                          ),
                                        }))
                                      }
                                    />
                                  </FormControl>
                                  <FormControl>
                                    <FormLabel fontSize="xs">Fin</FormLabel>
                                    <Input
                                      size="sm"
                                      type="date"
                                      value={draft.end}
                                      onChange={(e) =>
                                        setNewSubactivityDrafts((prev) => ({
                                          ...prev,
                                          [act.id]: (prev[act.id] ?? []).map((item) =>
                                            item.id === draft.id ? { ...item, end: e.target.value } : item,
                                          ),
                                        }))
                                      }
                                    />
                                  </FormControl>
                                </SimpleGrid>
                                <Flex justify="flex-end" gap={2} mt={1}>
                                  <Button
                                    size="xs"
                                    variant="ghost"
                                    colorScheme="red"
                                    onClick={() =>
                                      setNewSubactivityDrafts((prev) => ({
                                        ...prev,
                                        [act.id]: (prev[act.id] ?? []).filter(
                                          (item) => item.id !== draft.id,
                                        ),
                                      }))
                                    }
                                  >
                                    Cancelar
                                  </Button>
                                  <Button
                                    size="xs"
                                    colorScheme="brand"
                                    onClick={() => onCreateSubactivity(act.id, draft.id)}
                                    isLoading={createSubActivityPending}
                                  >
                                    Crear subactividad
                                  </Button>
                                </Flex>
                              </Box>
                            ))}
                          </>
                        )}
                        <Flex justify="flex-end">
                          <Button
                            size="xs"
                            variant="outline"
                            colorScheme="brand"
                            onClick={() => onAddSubactivityDraft(act.id)}
                          >
                            Añadir subactividad
                          </Button>
                        </Flex>
                      </Stack>
                    </Box>
                  );
                })}
                {newActivityDrafts.map((draft) => (
                  <Box key={draft.id} borderWidth="1px" borderRadius="md" p={2} bg="gray.50">
                    <SimpleGrid columns={{ base: 1, md: 4 }} spacing={2} mb={1.5}>
                      <FormControl>
                        <FormLabel fontSize="xs">Nombre</FormLabel>
                        <Input
                          size="sm"
                          value={draft.name}
                          onChange={(e) =>
                            setNewActivityDrafts((prev) =>
                              prev.map((item) =>
                                item.id === draft.id ? { ...item, name: e.target.value } : item,
                              ),
                            )
                          }
                        />
                      </FormControl>
                      <FormControl>
                        <FormLabel fontSize="xs">Peso %</FormLabel>
                        <Input
                          size="sm"
                          value={draft.description}
                          onChange={(e) =>
                            setNewActivityDrafts((prev) =>
                              prev.map((item) =>
                                item.id === draft.id
                                  ? { ...item, description: e.target.value }
                                  : item,
                              ),
                            )
                          }
                        />
                      </FormControl>
                      <FormControl>
                        <FormLabel fontSize="xs">Inicio</FormLabel>
                        <Input
                          size="sm"
                          type="date"
                          value={draft.start}
                          onChange={(e) =>
                            setNewActivityDrafts((prev) =>
                              prev.map((item) =>
                                item.id === draft.id ? { ...item, start: e.target.value } : item,
                              ),
                            )
                          }
                        />
                      </FormControl>
                      <FormControl>
                        <FormLabel fontSize="xs">Fin</FormLabel>
                        <Input
                          size="sm"
                          type="date"
                          value={draft.end}
                          onChange={(e) =>
                            setNewActivityDrafts((prev) =>
                              prev.map((item) =>
                                item.id === draft.id ? { ...item, end: e.target.value } : item,
                              ),
                            )
                          }
                        />
                      </FormControl>
                    </SimpleGrid>
                    <Flex justify="flex-end" gap={2}>
                      <Button
                        size="xs"
                        variant="ghost"
                        colorScheme="red"
                        onClick={() =>
                          setNewActivityDrafts((prev) =>
                            prev.filter((item) => item.id !== draft.id),
                          )
                        }
                      >
                        Cancelar
                      </Button>
                      <Button
                        size="xs"
                        colorScheme="brand"
                        onClick={() => onCreateActivity(draft.id)}
                        isLoading={createActivityPending}
                      >
                        Crear actividad
                      </Button>
                    </Flex>
                  </Box>
                ))}
                <Flex justify="flex-end">
                  <Button
                    size="sm"
                    variant="outline"
                    colorScheme="brand"
                    onClick={onAddActivityDraft}
                  >
                    Añadir actividad
                  </Button>
                </Flex>
                </>
              )}
            </Stack>

            <Flex justify="space-between" align="center">
              <Heading size="sm">Hitos</Heading>
              <Button size="sm" variant="outline" colorScheme="brand" onClick={onAddMilestoneDraft}>
                Añadir hito
              </Button>
            </Flex>

            <Stack spacing={3}>
              {selectedProjectMilestones.length === 0 && newMilestoneDrafts.length === 0 ? (
                <Text fontSize="sm" color={subtleText}>
                  Sin hitos.
                </Text>
              ) : (
                <>
                {selectedProjectMilestones.map((milestone) => {
                  const form = milestoneEdits[milestone.id] || {
                    title: "",
                    due: "",
                    description: "",
                  };

                  return (
                    <Box key={milestone.id} borderWidth="1px" borderRadius="md" p={3}>
                      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={2} mb={2}>
                        <FormControl>
                          <FormLabel fontSize="xs">Título</FormLabel>
                          <Input
                            value={form.title}
                            onChange={(e) =>
                              setMilestoneEdits((prev) => ({
                                ...prev,
                                [milestone.id]: {
                                  ...form,
                                  title: e.target.value,
                                },
                              }))
                            }
                          />
                        </FormControl>

                        <FormControl>
                          <FormLabel fontSize="xs">Descripción</FormLabel>
                          <Input
                            value={form.description}
                            onChange={(e) =>
                              setMilestoneEdits((prev) => ({
                                ...prev,
                                [milestone.id]: {
                                  ...form,
                                  description: e.target.value,
                                },
                              }))
                            }
                          />
                        </FormControl>

                        <FormControl>
                          <FormLabel fontSize="xs">Fecha</FormLabel>
                          <Input
                            type="date"
                            value={form.due}
                            onChange={(e) =>
                              setMilestoneEdits((prev) => ({
                                ...prev,
                                [milestone.id]: { ...form, due: e.target.value },
                              }))
                            }
                          />
                        </FormControl>
                      </SimpleGrid>

                      <Flex justify="flex-end">
                        <Button
                          size="sm"
                          colorScheme="brand"
                          onClick={() => onUpdateMilestone(milestone.id)}
                          isLoading={updateMilestonePending}
                        >
                          Guardar hito
                        </Button>
                      </Flex>
                    </Box>
                  );
                })}
                {newMilestoneDrafts.map((draft) => (
                  <Box key={draft.id} borderWidth="1px" borderRadius="md" p={3} bg="gray.50">
                    <SimpleGrid columns={{ base: 1, md: 2 }} spacing={2} mb={2}>
                      <FormControl>
                        <FormLabel fontSize="xs">Título</FormLabel>
                        <Input
                          value={draft.title}
                          onChange={(e) =>
                            setNewMilestoneDrafts((prev) =>
                              prev.map((item) =>
                                item.id === draft.id ? { ...item, title: e.target.value } : item,
                              ),
                            )
                          }
                        />
                      </FormControl>
                      <FormControl>
                        <FormLabel fontSize="xs">Descripción</FormLabel>
                        <Input
                          value={draft.description}
                          onChange={(e) =>
                            setNewMilestoneDrafts((prev) =>
                              prev.map((item) =>
                                item.id === draft.id
                                  ? { ...item, description: e.target.value }
                                  : item,
                              ),
                            )
                          }
                        />
                      </FormControl>
                      <FormControl>
                        <FormLabel fontSize="xs">Fecha</FormLabel>
                        <Input
                          type="date"
                          value={draft.due}
                          onChange={(e) =>
                            setNewMilestoneDrafts((prev) =>
                              prev.map((item) =>
                                item.id === draft.id ? { ...item, due: e.target.value } : item,
                              ),
                            )
                          }
                        />
                      </FormControl>
                    </SimpleGrid>
                    <Flex justify="flex-end" gap={2}>
                      <Button
                        size="sm"
                        variant="ghost"
                        colorScheme="red"
                        onClick={() =>
                          setNewMilestoneDrafts((prev) =>
                            prev.filter((item) => item.id !== draft.id),
                          )
                        }
                      >
                        Cancelar
                      </Button>
                      <Button
                        size="sm"
                        colorScheme="brand"
                        onClick={() => onCreateMilestone(draft.id)}
                        isLoading={createMilestonePending}
                      >
                        Crear hito
                      </Button>
                    </Flex>
                  </Box>
                ))}
                </>
              )}
            </Stack>

            <Flex justify="space-between" align="center">
              <Heading size="sm">Tareas</Heading>
              <Button
                size="sm"
                variant="outline"
                colorScheme="brand"
                onClick={onAddTaskDraft}
              >
                Añadir tarea
              </Button>
            </Flex>

            <Stack spacing={3}>
              {selectedProjectTasks.length === 0 && newTaskDrafts.length === 0 ? (
                <Text fontSize="sm" color={subtleText}>
                  Sin tareas.
                </Text>
              ) : (
                <>
                  {selectedProjectTasks.map((task) => (
                    <Box key={task.id} borderWidth="1px" borderRadius="md" p={3}>
                      <Flex justify="space-between" align="center" mb={1}>
                        <Text fontWeight="semibold">{task.title}</Text>
                        <Badge colorScheme={task.is_completed ? "brand" : "yellow"}>
                          {task.status || (task.is_completed ? "completed" : "pendiente")}
                        </Badge>
                      </Flex>

                      <Text fontSize="xs" color={subtleText}>
                        {formatDate(task.start_date) || "Sin inicio"} -{" "}
                        {formatDate(task.end_date) || "Sin fin"}
                      </Text>

                      {task.description && (
                        <Text mt={1} fontSize="xs" color={subtleText}>
                          {task.description}
                        </Text>
                      )}
                    </Box>
                  ))}

                  {newTaskDrafts.map((draft) => (
                    <Box key={draft.id} borderWidth="1px" borderRadius="md" p={3} bg="gray.50">
                      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={2} mb={2}>
                        <FormControl>
                          <FormLabel fontSize="xs">Título</FormLabel>
                          <Input
                            value={draft.title}
                            onChange={(e) =>
                              setNewTaskDrafts((prev) =>
                                prev.map((item) =>
                                  item.id === draft.id
                                    ? { ...item, title: e.target.value }
                                    : item,
                                ),
                              )
                            }
                          />
                        </FormControl>
                        <FormControl>
                          <FormLabel fontSize="xs">Descripción</FormLabel>
                          <Input
                            value={draft.description}
                            onChange={(e) =>
                              setNewTaskDrafts((prev) =>
                                prev.map((item) =>
                                  item.id === draft.id
                                    ? { ...item, description: e.target.value }
                                    : item,
                                ),
                              )
                            }
                          />
                        </FormControl>
                        <FormControl>
                          <FormLabel fontSize="xs">Inicio</FormLabel>
                          <Input
                            type="date"
                            value={draft.start}
                            onChange={(e) =>
                              setNewTaskDrafts((prev) =>
                                prev.map((item) =>
                                  item.id === draft.id
                                    ? { ...item, start: e.target.value }
                                    : item,
                                ),
                              )
                            }
                          />
                        </FormControl>
                        <FormControl>
                          <FormLabel fontSize="xs">Fin</FormLabel>
                          <Input
                            type="date"
                            value={draft.end}
                            onChange={(e) =>
                              setNewTaskDrafts((prev) =>
                                prev.map((item) =>
                                  item.id === draft.id
                                    ? { ...item, end: e.target.value }
                                    : item,
                                ),
                              )
                            }
                          />
                        </FormControl>
                      </SimpleGrid>

                      <Flex justify="flex-end" gap={2}>
                        <Button
                          size="sm"
                          variant="ghost"
                          colorScheme="red"
                          onClick={() =>
                            setNewTaskDrafts((prev) =>
                              prev.filter((item) => item.id !== draft.id),
                            )
                          }
                        >
                          Cancelar
                        </Button>
                        <Button
                          size="sm"
                          colorScheme="brand"
                          onClick={() => onCreateTask(draft.id)}
                          isLoading={createTaskPending}
                        >
                          Crear tarea
                        </Button>
                      </Flex>
                    </Box>
                  ))}
                </>
              )}
            </Stack>
          </Stack>
        ) : (
          <Text fontSize="sm" color={subtleText}>
            Selecciona un proyecto para ver los detalles.
          </Text>
        )}
      </ModalBody>

      <ModalFooter borderTopWidth="1px">
        <Button variant="ghost" mr={3} onClick={onClose}>
          Cerrar
        </Button>

        <Button
          variant="outline"
          colorScheme="red"
          mr={3}
          onClick={onDeleteProject}
          isLoading={deleteProjectPending}
          isDisabled={!selectedProject}
        >
          Eliminar proyecto
        </Button>

        <Button
          colorScheme="brand"
          onClick={onUpdateProject}
          isLoading={updateProjectPending}
          isDisabled={!selectedProject}
        >
          Guardar cambios
        </Button>
      </ModalFooter>
    </ModalContent>
  </Modal>
  );
};

