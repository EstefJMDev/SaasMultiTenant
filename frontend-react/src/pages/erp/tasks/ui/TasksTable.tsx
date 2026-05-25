import React from "react";
import {
  Badge,
  Box,
  Button,
  Heading,
  SimpleGrid,
  Stack,
  TabPanel,
  TabPanels,
  Text,
} from "@chakra-ui/react";
import type { TFunction } from "i18next";

import type { useErpTasksData } from "../hooks/useErpTasksData";
import type { useErpTasksModals } from "../hooks/useErpTasksModals";
import type { KanbanStatus } from "../utils/tasks.mapper";
import { TaskRowActions } from "./TaskRowActions";

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

interface TasksTableProps {
  t: TFunction;
  cardBg: string;
  subtleText: string;
  accent: string;
  kanbanStyles: KanbanStyles;
  data: ErpTasksData;
  modals: ErpTasksModals;
}

export const TasksTable: React.FC<TasksTableProps> = ({
  t,
  cardBg,
  subtleText,
  accent,
  kanbanStyles,
  data,
  modals,
}) => {
  const {
    allTasks,
    assignedTasks,
    projectMap,
    deleteTaskMutation,
    statusLabels,
    getTaskStatus,
    tasksByStatus,
    kanbanColumns,
    dragOverStatus,
    handleDragOver,
    handleDrop,
    handleDragStart,
    handleDragEnd,
    draggedTaskId,
    setDragOverStatus,
    formatTaskDateTime,
    subactivities,
    userMap,
  } = data;

  const { setCreateModalOpen, setViewTask, setSelectedTask, openQuickAdd, openEditTask } =
    modals;

  return (
    <TabPanels mt={4}>
      <TabPanel px={0}>
        <Button
          colorScheme="brand"
          size="sm"
          mb={4}
          onClick={() => setCreateModalOpen(true)}
        >
          {t("erp.tasks.actions.create")}
        </Button>
        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
          <Box borderWidth="1px" borderRadius="xl" p={4} bg={cardBg}>
            <Stack direction="row" justify="space-between" align="center" mb={3}>
              <Heading size="sm">{t("erp.tasks.summary.allTasks")}</Heading>
              <Badge borderRadius="full" px={2}>
                {allTasks.length}
              </Badge>
            </Stack>
            {allTasks.length === 0 ? (
              <Text fontSize="sm" color={subtleText}>
                {t("erp.tasks.summary.emptyAll")}
              </Text>
            ) : (
              <Stack spacing={3}>
                {allTasks.slice(0, 10).map((task) => (
                  <Box
                    key={task.id}
                    borderWidth="1px"
                    borderRadius="lg"
                    p={3}
                    cursor="pointer"
                    _hover={{ borderColor: accent, boxShadow: "md" }}
                    onClick={() => setViewTask(task)}
                  >
                    <Stack
                      direction="row"
                      justify="space-between"
                      align="flex-start"
                    >
                      <Box>
                        <Text fontWeight="semibold">{task.title}</Text>
                        <Text fontSize="xs" color={subtleText}>
                          {task.project_id
                            ? t("erp.tasks.summary.projectLabel", {
                                project:
                                  projectMap.get(task.project_id) ??
                                  task.project_id,
                              })
                            : t("erp.tasks.summary.noProject")}
                        </Text>
                      </Box>
                      <TaskRowActions
                        editLabel={t("erp.tasks.actions.edit")}
                        deleteLabel="Eliminar"
                        isDeleting={deleteTaskMutation.isPending}
                        onEdit={(event) => {
                          event.stopPropagation();
                          setViewTask(task);
                        }}
                        onDelete={(event) => {
                          event.stopPropagation();
                          deleteTaskMutation.mutate(task.id);
                        }}
                      />
                    </Stack>
                    <Badge
                      mt={2}
                      colorScheme={kanbanStyles[getTaskStatus(task)].accent}
                    >
                      {statusLabels[getTaskStatus(task)]}
                    </Badge>
                  </Box>
                ))}
              </Stack>
            )}
          </Box>
          <Box borderWidth="1px" borderRadius="xl" p={4} bg={cardBg}>
            <Stack direction="row" justify="space-between" align="center" mb={3}>
              <Heading size="sm">{t("erp.tasks.summary.assigned")}</Heading>
              <Badge borderRadius="full" px={2}>
                {assignedTasks.length}
              </Badge>
            </Stack>
            {assignedTasks.length === 0 ? (
              <Text fontSize="sm" color={subtleText}>
                {t("erp.tasks.summary.emptyAssigned")}
              </Text>
            ) : (
              <Stack spacing={3}>
                {assignedTasks.slice(0, 10).map((task) => (
                  <Box
                    key={task.id}
                    borderWidth="1px"
                    borderRadius="lg"
                    p={3}
                    cursor="pointer"
                    _hover={{ borderColor: accent, boxShadow: "md" }}
                    onClick={() => setViewTask(task)}
                  >
                    <Stack
                      direction="row"
                      justify="space-between"
                      align="flex-start"
                    >
                      <Box>
                        <Text fontWeight="semibold">{task.title}</Text>
                        <Text fontSize="xs" color={subtleText}>
                          {task.project_id
                            ? t("erp.tasks.summary.projectLabel", {
                                project:
                                  projectMap.get(task.project_id) ??
                                  task.project_id,
                              })
                            : t("erp.tasks.summary.noProject")}
                        </Text>
                      </Box>
                      <TaskRowActions
                        editLabel={t("erp.tasks.actions.edit")}
                        deleteLabel="Eliminar"
                        isDeleting={deleteTaskMutation.isPending}
                        onEdit={(event) => {
                          event.stopPropagation();
                          setViewTask(task);
                        }}
                        onDelete={(event) => {
                          event.stopPropagation();
                          deleteTaskMutation.mutate(task.id);
                        }}
                      />
                    </Stack>
                    <Badge
                      mt={2}
                      colorScheme={kanbanStyles[getTaskStatus(task)].accent}
                    >
                      {statusLabels[getTaskStatus(task)]}
                    </Badge>
                  </Box>
                ))}
              </Stack>
            )}
          </Box>
        </SimpleGrid>
      </TabPanel>
      <TabPanel px={0}>
        <Heading size="md" mb={2}>
          {t("erp.tasks.kanban.title")}
        </Heading>
        <Text fontSize="sm" color={subtleText} mb={4}>
          {t("erp.tasks.kanban.subtitle")}
        </Text>
        <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
          {kanbanColumns.map((column) => (
            <Box
              key={column.id}
              borderWidth="1px"
              borderRadius="xl"
              bg={kanbanStyles[column.id].columnBg}
              p={3}
              minH="240px"
              borderColor={
                dragOverStatus === column.id ? accent : "transparent"
              }
              boxShadow={dragOverStatus === column.id ? "sm" : "none"}
              onDragOver={handleDragOver(column.id)}
              onDragLeave={() => setDragOverStatus(null)}
              onDrop={handleDrop(column.id)}
            >
              <Stack direction="row" justify="space-between" align="center" mb={4}>
                <Stack direction="row" spacing={2} align="center">
                  <Box
                    px={3}
                    py={1}
                    borderRadius="full"
                    bg={kanbanStyles[column.id].headerBg}
                    color="white"
                    fontSize="xs"
                    fontWeight="semibold"
                    textTransform="uppercase"
                    letterSpacing="0.04em"
                  >
                    {column.label}
                  </Box>
                  <Badge
                    bg={kanbanStyles[column.id].badgeBg}
                    color="gray.800"
                    borderRadius="full"
                  >
                    {tasksByStatus[column.id].length}
                  </Badge>
                </Stack>
              </Stack>
              <Stack spacing={2} mb={3}>
                {tasksByStatus[column.id].length === 0 ? (
                  <Text fontSize="sm" color={subtleText}>
                    {t("erp.tasks.kanban.empty")}
                  </Text>
                ) : (
                  tasksByStatus[column.id].map((task) => (
                    <Box
                      key={task.id}
                      borderWidth="1px"
                      borderRadius="md"
                      p={2}
                      bg={cardBg}
                      boxShadow="xs"
                      cursor="grab"
                      opacity={draggedTaskId === task.id ? 0.6 : 1}
                      draggable
                      onDragStart={(event) => handleDragStart(event, task.id)}
                      onDragEnd={handleDragEnd}
                      onClick={() => setSelectedTask(task)}
                      _hover={{ borderColor: accent, boxShadow: "md" }}
                    >
                      <Stack spacing={1.5}>
                        <Box>
                          <Heading size="xs">{task.title}</Heading>
                          <Text fontSize="xs" color={subtleText} noOfLines={1}>
                            {task.project_id
                              ? t("erp.tasks.kanban.projectLabel", {
                                  project:
                                    projectMap.get(task.project_id) ??
                                    t("erp.tasks.kanban.projectFallback"),
                                })
                              : t("erp.tasks.kanban.noProject")}
                          </Text>
                          {task.subactivity_id && (
                            <Text fontSize="xs" color={subtleText} noOfLines={1}>
                              Subactividad:{" "}
                              {subactivities.find(
                                (sub) => sub.id === task.subactivity_id,
                              )?.name ?? task.subactivity_id}
                            </Text>
                          )}
                        </Box>
                        <Stack direction="row" spacing={1} align="center" flexWrap="wrap">
                          {task.assigned_to_id && (
                            <Badge variant="subtle" colorScheme="purple" fontSize="0.65rem">
                              {userMap.get(task.assigned_to_id) ??
                                task.assigned_to_id}
                            </Badge>
                          )}
                          {task.start_date && (
                            <Badge variant="subtle" colorScheme="gray" fontSize="0.65rem">
                              {formatTaskDateTime(task.start_date)}
                            </Badge>
                          )}
                        </Stack>
                        {task.description && (
                          <Text fontSize="xs" color={subtleText} noOfLines={2}>
                            {task.description}
                          </Text>
                        )}
                        <TaskRowActions
                          editLabel={t("erp.tasks.actions.edit")}
                          deleteLabel="Eliminar"
                          isDeleting={deleteTaskMutation.isPending}
                          onEdit={(event) => {
                            event.stopPropagation();
                            openEditTask(task);
                          }}
                          onDelete={(event) => {
                            event.stopPropagation();
                            deleteTaskMutation.mutate(task.id);
                          }}
                        />
                      </Stack>
                    </Box>
                  ))
                )}
              </Stack>
              <Button
                variant="ghost"
                size="sm"
                colorScheme={kanbanStyles[column.id].accent}
                onClick={() => openQuickAdd(column.id)}
              >
                {t("erp.tasks.actions.addQuick")}
              </Button>
            </Box>
          ))}
        </SimpleGrid>
      </TabPanel>
    </TabPanels>
  );
};

