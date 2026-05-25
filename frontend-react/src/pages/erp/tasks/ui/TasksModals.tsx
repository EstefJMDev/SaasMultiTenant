import React from "react";
import {
  Badge,
  Box,
  Button,
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerHeader,
  DrawerOverlay,
  FormControl,
  FormLabel,
  Heading,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
} from "@chakra-ui/react";
import type { TFunction } from "i18next";

import type { useErpTasksData } from "../hooks/useErpTasksData";
import type { useErpTasksModals } from "../hooks/useErpTasksModals";
import type { KanbanStatus } from "../utils/tasks.mapper";

// NOTE: keep prop types minimal but stable.
type ErpTasksData = ReturnType<typeof useErpTasksData>;
type ErpTasksModals = ReturnType<typeof useErpTasksModals>;

type KanbanStyles = Record<
  KanbanStatus,
  {
    columnBg: string;
    headerBg: string;
    badgeBg: string;
    accent: string;
  }
>;

interface TasksModalsProps {
  t: TFunction;
  subtleText: string;
  isSuperAdmin: boolean;
  kanbanStyles: KanbanStyles;
  data: ErpTasksData;
  modals: ErpTasksModals;
}

export const TasksModals: React.FC<TasksModalsProps> = ({
  t,
  subtleText,
  isSuperAdmin,
  kanbanStyles,
  data,
  modals,
}) => {
  const {
    projects,
    subactivities,
    users,
    projectMap,
    userMap,
    subactivitiesByProject,
    statusLabels,
    getTaskStatus,
    formatTaskDateTime,
    deleteTaskMutation,
    updateTaskMutation,
    createTaskMutation,
    quickCreateTaskMutation,
    handleCreateTask,
    handleQuickAdd,
  } = data;

  const {
    taskTitle,
    setTaskTitle,
    taskDescription,
    setTaskDescription,
    taskProjectId,
    setTaskProjectId,
    taskSubactivityId,
    setTaskSubactivityId,
    taskAssigneeId,
    setTaskAssigneeId,
    taskStartDate,
    setTaskStartDate,
    taskEndDate,
    setTaskEndDate,
    createModalOpen,
    closeCreateModal,
    quickAddOpen,
    setQuickAddOpen,
    quickAddStatus,
    quickAddTitle,
    setQuickAddTitle,
    quickAddDescription,
    setQuickAddDescription,
    quickAddProjectId,
    setQuickAddProjectId,
    quickAddSubactivityId,
    setQuickAddSubactivityId,
    quickAddAssigneeId,
    setQuickAddAssigneeId,
    quickAddStartDate,
    setQuickAddStartDate,
    quickAddEndDate,
    setQuickAddEndDate,
    editOpen,
    setEditOpen,
    editTaskId,
    editTitle,
    setEditTitle,
    editDescription,
    setEditDescription,
    editProjectId,
    setEditProjectId,
    editSubactivityId,
    setEditSubactivityId,
    editAssigneeId,
    setEditAssigneeId,
    editStartDate,
    setEditStartDate,
    editEndDate,
    setEditEndDate,
    editStatus,
    setEditStatus,
    selectedTask,
    setSelectedTask,
    viewTask,
    setViewTask,
    openEditTask,
  } = modals;

  return (
    <>
      <Modal
        isOpen={Boolean(viewTask)}
        onClose={() => setViewTask(null)}
        size="lg"
      >
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Detalle de la tarea</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {viewTask && (
              <Stack spacing={3}>
                <Heading size="md">{viewTask.title}</Heading>
                <Text fontSize="sm" color={subtleText}>
                  {viewTask.description?.trim()
                    ? viewTask.description
                    : t("erp.tasks.drawer.noDescription")}
                </Text>
                <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                  <Box>
                    <Text fontSize="xs" color={subtleText}>
                      Proyecto
                    </Text>
                    <Text fontWeight="semibold">
                      {viewTask.project_id
                        ? (projectMap.get(viewTask.project_id) ??
                          t("erp.tasks.summary.noProject"))
                        : t("erp.tasks.summary.noProject")}
                    </Text>
                  </Box>
                  <Box>
                    <Text fontSize="xs" color={subtleText}>
                      Subactividad
                    </Text>
                    <Text fontWeight="semibold">
                      {viewTask.subactivity_id
                        ? (subactivities.find(
                            (sub) => sub.id === viewTask.subactivity_id,
                          )?.name ?? viewTask.subactivity_id)
                        : t("erp.tasks.fields.noProject")}
                    </Text>
                  </Box>
                  <Box>
                    <Text fontSize="xs" color={subtleText}>
                      {t("erp.tasks.fields.assignee")}
                    </Text>
                    <Text fontWeight="semibold">
                      {viewTask.assigned_to_id
                        ? (userMap.get(viewTask.assigned_to_id) ??
                          viewTask.assigned_to_id)
                        : t("erp.tasks.drawer.unassigned")}
                    </Text>
                  </Box>
                  <Box>
                    <Text fontSize="xs" color={subtleText}>
                      {t("erp.tasks.fields.status")}
                    </Text>
                    <Badge
                      colorScheme={kanbanStyles[getTaskStatus(viewTask)].accent}
                      variant="subtle"
                      px={2}
                    >
                      {statusLabels[getTaskStatus(viewTask)]}
                    </Badge>
                  </Box>
                  <Box>
                    <Text fontSize="xs" color={subtleText}>
                      {t("erp.tasks.fields.start")}
                    </Text>
                    <Text fontWeight="semibold">
                      {formatTaskDateTime(viewTask.start_date)}
                    </Text>
                  </Box>
                  <Box>
                    <Text fontSize="xs" color={subtleText}>
                      {t("erp.tasks.fields.end")}
                    </Text>
                    <Text fontWeight="semibold">
                      {formatTaskDateTime(viewTask.end_date)}
                    </Text>
                  </Box>
                </SimpleGrid>
              </Stack>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={() => setViewTask(null)}>
              {t("common.close") || "Cerrar"}
            </Button>
            {viewTask && (
              <>
                <Button
                  variant="outline"
                  colorScheme="brand"
                  mr={3}
                  onClick={() => {
                    openEditTask(viewTask);
                    setViewTask(null);
                  }}
                >
                  {t("erp.tasks.actions.edit")}
                </Button>
                <Button
                  colorScheme="red"
                  onClick={() => deleteTaskMutation.mutate(viewTask.id)}
                  isLoading={deleteTaskMutation.isPending}
                >
                  Eliminar
                </Button>
              </>
            )}
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={createModalOpen} onClose={closeCreateModal} size="xl">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{t("erp.tasks.create.title")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Stack spacing={3}>
              <Text fontSize="sm" color={subtleText}>
                {t("erp.tasks.status.pending")}
              </Text>
              <FormControl>
                <FormLabel>{t("erp.tasks.fields.title")}</FormLabel>
                <Input
                  placeholder="Escribe el título"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                />
              </FormControl>
              <FormControl>
                <FormLabel>{t("erp.tasks.fields.description")}</FormLabel>
                <Textarea
                  rows={3}
                  value={taskDescription}
                  onChange={(e) => setTaskDescription(e.target.value)}
                />
              </FormControl>
              <FormControl>
                <FormLabel>{t("erp.tasks.fields.project")}</FormLabel>
                <Select
                  placeholder={t("erp.tasks.fields.noProject")}
                  value={taskProjectId}
                  onChange={(e) => {
                    setTaskProjectId(e.target.value);
                    setTaskSubactivityId("");
                  }}
                >
                  {(projects ?? []).map((project) => (
                    <option key={project.id} value={String(project.id)}>
                      {project.name}
                    </option>
                  ))}
                </Select>
              </FormControl>
              <FormControl>
                <FormLabel>Subactividad</FormLabel>
                <Select
                  placeholder="Sin subactividad"
                  value={taskSubactivityId}
                  onChange={(e) => setTaskSubactivityId(e.target.value)}
                  isDisabled={!taskProjectId}
                >
                  {(
                    subactivitiesByProject.get(Number(taskProjectId)) ?? []
                  ).map((sub) => (
                    <option key={sub.id} value={String(sub.id)}>
                      {sub.name}
                    </option>
                  ))}
                </Select>
              </FormControl>
              <FormControl>
                <FormLabel>{t("erp.tasks.fields.assignee")}</FormLabel>
                <Select
                  placeholder={
                    isSuperAdmin
                      ? t("erp.tasks.fields.selectUser")
                      : t("erp.tasks.fields.tenantUsers")
                  }
                  value={taskAssigneeId}
                  onChange={(e) => setTaskAssigneeId(e.target.value)}
                >
                  {(users ?? []).map((user) => (
                    <option key={user.id} value={String(user.id)}>
                      {user.full_name || user.email}
                    </option>
                  ))}
                </Select>
              </FormControl>
              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                <FormControl>
                  <FormLabel>{t("erp.tasks.fields.start")}</FormLabel>
                  <Input
                    type="datetime-local"
                    value={taskStartDate}
                    onChange={(e) => setTaskStartDate(e.target.value)}
                  />
                </FormControl>
                <FormControl>
                  <FormLabel>{t("erp.tasks.fields.end")}</FormLabel>
                  <Input
                    type="datetime-local"
                    value={taskEndDate}
                    onChange={(e) => setTaskEndDate(e.target.value)}
                  />
                </FormControl>
              </SimpleGrid>
            </Stack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={closeCreateModal}>
              {t("common.cancel")}
            </Button>
            <Button
              colorScheme="brand"
              onClick={handleCreateTask}
              isLoading={createTaskMutation.isPending}
            >
              {t("common.save")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Drawer
        isOpen={Boolean(selectedTask)}
        placement="right"
        onClose={() => setSelectedTask(null)}
        size="md"
      >
        <DrawerOverlay />
        <DrawerContent>
          <DrawerCloseButton />
          <DrawerHeader>{t("erp.tasks.drawer.title")}</DrawerHeader>
          <DrawerBody>
            {selectedTask ? (
              <Stack spacing={4}>
                <Box>
                  <Heading size="md">{selectedTask.title}</Heading>
                  <Text fontSize="sm" color={subtleText}>
                    {selectedTask.project_id
                      ? t("erp.tasks.drawer.projectLabel", {
                          project:
                            projectMap.get(selectedTask.project_id) ??
                            t("erp.tasks.drawer.projectFallback"),
                        })
                      : t("erp.tasks.drawer.noProject")}
                  </Text>
                </Box>
                <Badge
                  alignSelf="flex-start"
                  colorScheme={kanbanStyles[getTaskStatus(selectedTask)].accent}
                  variant="solid"
                >
                  {statusLabels[getTaskStatus(selectedTask)]}
                </Badge>
                <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                  <Box>
                    <Text fontSize="xs" color={subtleText}>
                      {t("erp.tasks.drawer.assigned")}
                    </Text>
                    <Text fontWeight="semibold">
                      {selectedTask.assigned_to_id
                        ? (userMap.get(selectedTask.assigned_to_id) ??
                          selectedTask.assigned_to_id)
                        : t("erp.tasks.drawer.unassigned")}
                    </Text>
                  </Box>
                  <Box>
                    <Text fontSize="xs" color={subtleText}>
                      {t("erp.tasks.fields.status")}
                    </Text>
                    <Text fontWeight="semibold">
                      {statusLabels[getTaskStatus(selectedTask)]}
                    </Text>
                  </Box>
                  <Box>
                    <Text fontSize="xs" color={subtleText}>
                      {t("erp.tasks.fields.start")}
                    </Text>
                    <Text fontWeight="semibold">
                      {formatTaskDateTime(selectedTask.start_date)}
                    </Text>
                  </Box>
                  <Box>
                    <Text fontSize="xs" color={subtleText}>
                      {t("erp.tasks.fields.end")}
                    </Text>
                    <Text fontWeight="semibold">
                      {formatTaskDateTime(selectedTask.end_date)}
                    </Text>
                  </Box>
                </SimpleGrid>
                <Box>
                  <Text fontSize="xs" color={subtleText}>
                    {t("erp.tasks.fields.description")}
                  </Text>
                  <Text>
                    {selectedTask.description?.trim()
                      ? selectedTask.description
                      : t("erp.tasks.drawer.noDescription")}
                  </Text>
                </Box>
              </Stack>
            ) : null}
          </DrawerBody>
        </DrawerContent>
      </Drawer>

      <Modal isOpen={quickAddOpen} onClose={() => setQuickAddOpen(false)} size="lg">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{t("erp.tasks.create.title")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Stack spacing={3}>
              <Text fontSize="sm" color={subtleText}>
                {t("erp.tasks.fields.statusLabel", {
                  status: statusLabels[quickAddStatus],
                })}
              </Text>
              <FormControl>
                <FormLabel>{t("erp.tasks.fields.title")}</FormLabel>
                <Input
                  placeholder={t("erp.tasks.fields.titlePlaceholder")}
                  value={quickAddTitle}
                  onChange={(e) => setQuickAddTitle(e.target.value)}
                />
              </FormControl>
              <FormControl>
                <FormLabel>{t("erp.tasks.fields.description")}</FormLabel>
                <Textarea
                  value={quickAddDescription}
                  onChange={(e) => setQuickAddDescription(e.target.value)}
                  rows={3}
                />
              </FormControl>
              <FormControl>
                <FormLabel>{t("erp.tasks.fields.project")}</FormLabel>
                <Select
                  placeholder={t("erp.tasks.fields.noProject")}
                  value={quickAddProjectId}
                  onChange={(e) => {
                    setQuickAddProjectId(e.target.value);
                    setQuickAddSubactivityId("");
                  }}
                >
                  {(projects ?? []).map((project) => (
                    <option key={project.id} value={String(project.id)}>
                      {project.name}
                    </option>
                  ))}
                </Select>
              </FormControl>
              <FormControl>
                <FormLabel>Subactividad</FormLabel>
                <Select
                  placeholder="Sin subactividad"
                  value={quickAddSubactivityId}
                  onChange={(e) => setQuickAddSubactivityId(e.target.value)}
                  isDisabled={!quickAddProjectId}
                >
                  {(
                    subactivitiesByProject.get(Number(quickAddProjectId)) ?? []
                  ).map((sub) => (
                    <option key={sub.id} value={String(sub.id)}>
                      {sub.name}
                    </option>
                  ))}
                </Select>
              </FormControl>
              <FormControl>
                <FormLabel>{t("erp.tasks.fields.assignee")}</FormLabel>
                <Select
                  placeholder={
                    isSuperAdmin
                      ? t("erp.tasks.fields.selectUser")
                      : t("erp.tasks.fields.tenantUsers")
                  }
                  value={quickAddAssigneeId}
                  onChange={(e) => setQuickAddAssigneeId(e.target.value)}
                >
                  {(users ?? []).map((user) => (
                    <option key={user.id} value={String(user.id)}>
                      {user.full_name || user.email}
                    </option>
                  ))}
                </Select>
              </FormControl>
              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                <FormControl>
                  <FormLabel>{t("erp.tasks.fields.start")}</FormLabel>
                  <Input
                    type="datetime-local"
                    value={quickAddStartDate}
                    onChange={(e) => setQuickAddStartDate(e.target.value)}
                  />
                </FormControl>
                <FormControl>
                  <FormLabel>{t("erp.tasks.fields.end")}</FormLabel>
                  <Input
                    type="datetime-local"
                    value={quickAddEndDate}
                    onChange={(e) => setQuickAddEndDate(e.target.value)}
                  />
                </FormControl>
              </SimpleGrid>
            </Stack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={() => setQuickAddOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              colorScheme="brand"
              onClick={handleQuickAdd}
              isLoading={quickCreateTaskMutation.isPending}
            >
              {t("common.save")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={editOpen} onClose={() => setEditOpen(false)} size="lg">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{t("erp.tasks.actions.edit")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Stack spacing={3}>
              <FormControl>
                <FormLabel>{t("erp.tasks.fields.title")}</FormLabel>
                <Input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                />
              </FormControl>
              <FormControl>
                <FormLabel>{t("erp.tasks.fields.description")}</FormLabel>
                <Textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={3}
                />
              </FormControl>
              <FormControl>
                <FormLabel>{t("erp.tasks.fields.status")}</FormLabel>
                <Select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as KanbanStatus)}
                >
                  {Object.entries(statusLabels).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </Select>
              </FormControl>
              <FormControl>
                <FormLabel>{t("erp.tasks.fields.project")}</FormLabel>
                <Select
                  placeholder={t("erp.tasks.fields.noProject")}
                  value={editProjectId}
                  onChange={(e) => {
                    setEditProjectId(e.target.value);
                    setEditSubactivityId("");
                  }}
                >
                  {(projects ?? []).map((project) => (
                    <option key={project.id} value={String(project.id)}>
                      {project.name}
                    </option>
                  ))}
                </Select>
              </FormControl>
              <FormControl>
                <FormLabel>Subactividad</FormLabel>
                <Select
                  placeholder="Sin subactividad"
                  value={editSubactivityId}
                  onChange={(e) => setEditSubactivityId(e.target.value)}
                  isDisabled={!editProjectId}
                >
                  {(
                    subactivitiesByProject.get(Number(editProjectId)) ?? []
                  ).map((sub) => (
                    <option key={sub.id} value={String(sub.id)}>
                      {sub.name}
                    </option>
                  ))}
                </Select>
              </FormControl>
              <FormControl>
                <FormLabel>{t("erp.tasks.fields.assignee")}</FormLabel>
                <Select
                  placeholder={
                    isSuperAdmin
                      ? t("erp.tasks.fields.selectUser")
                      : t("erp.tasks.fields.tenantUsers")
                  }
                  value={editAssigneeId}
                  onChange={(e) => setEditAssigneeId(e.target.value)}
                >
                  {(users ?? []).map((user) => (
                    <option key={user.id} value={String(user.id)}>
                      {user.full_name || user.email}
                    </option>
                  ))}
                </Select>
              </FormControl>
              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                <FormControl>
                  <FormLabel>{t("erp.tasks.fields.start")}</FormLabel>
                  <Input
                    type="datetime-local"
                    value={editStartDate}
                    onChange={(e) => setEditStartDate(e.target.value)}
                  />
                </FormControl>
                <FormControl>
                  <FormLabel>{t("erp.tasks.fields.end")}</FormLabel>
                  <Input
                    type="datetime-local"
                    value={editEndDate}
                    onChange={(e) => setEditEndDate(e.target.value)}
                  />
                </FormControl>
              </SimpleGrid>
            </Stack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={() => setEditOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              colorScheme="brand"
              onClick={() => updateTaskMutation.mutate()}
              isLoading={updateTaskMutation.isPending}
              isDisabled={!editTaskId || !editTitle.trim()}
            >
              {t("erp.tasks.actions.saveChanges")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
};

