import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Flex,
  Heading,
  HStack,
  Tag,
  Text,
  Tooltip,
  useColorModeValue,
} from "@chakra-ui/react";

import type { GanttTask, Status, ViewMode } from "@shared/utils/erp";

interface ProfessionalGanttProps {
  tasks: GanttTask[];
  viewMode?: ViewMode;
  centerOnToday?: boolean;
  onProjectClick?: (projectId: number) => void;
  showMilestoneLines?: boolean;
}

export const ProfessionalGantt: React.FC<ProfessionalGanttProps> = ({
  tasks,
  viewMode = "month",
  centerOnToday = false,
  onProjectClick,
  showMilestoneLines = true,
}) => {
  const gridBg = useColorModeValue("gray.50", "gray.800");
  const lineColor = useColorModeValue("gray.200", "gray.700");
  const headerBg = useColorModeValue("white", "gray.900");
  const containerBg = useColorModeValue("white", "gray.900");
  const labelColor = useColorModeValue("gray.600", "gray.300");
  const rowBg = useColorModeValue("white", "gray.900");
  const taskTitleColor = useColorModeValue("gray.800", "white");
  const headerTitleColor = useColorModeValue("gray.700", "gray.100");

  const leftColumnWidth = 300;
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [todayLeftPx, setTodayLeftPx] = useState<number | null>(null);
  const [collapsedActivityIds, setCollapsedActivityIds] = useState<Set<number>>(
    () => new Set(),
  );

  const dateRange = useMemo(() => {
    if (tasks.length === 0) {
      const now = new Date();
      return {
        start: new Date(now.getFullYear(), now.getMonth(), 1),
        end: new Date(now.getFullYear(), now.getMonth() + 3, 0),
      };
    }

    const allDates = tasks.flatMap((task) => [task.start, task.end]);
    const minDate = new Date(
      Math.min(...allDates.map((date) => date.getTime())),
    );
    const maxDate = new Date(
      Math.max(...allDates.map((date) => date.getTime())),
    );

    const paddedStart =
      viewMode === "week"
        ? new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate() - 7)
        : new Date(minDate.getFullYear(), minDate.getMonth(), 1);

    const paddedEnd =
      viewMode === "week"
        ? new Date(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate() + 14)
        : new Date(maxDate.getFullYear(), maxDate.getMonth() + 2, 0);

    return { start: paddedStart, end: paddedEnd };
  }, [tasks, viewMode]);

  const timeColumns = useMemo(() => {
    const columns: Date[] = [];
    const current = new Date(dateRange.start);
    if (viewMode === "week") {
      while (current <= dateRange.end) {
        columns.push(new Date(current));
        current.setDate(current.getDate() + 1);
      }
    } else {
      current.setDate(1);
      while (current <= dateRange.end) {
        columns.push(new Date(current));
        current.setMonth(current.getMonth() + 1);
      }
    }
    return columns;
  }, [dateRange, viewMode]);

  const totalDays =
    (dateRange.end.getTime() - dateRange.start.getTime()) /
    (1000 * 60 * 60 * 24);

  const getBarStyle = (task: GanttTask) => {
    const startOffset =
      (task.start.getTime() - dateRange.start.getTime()) /
      (1000 * 60 * 60 * 24);
    const duration =
      (task.end.getTime() - task.start.getTime()) /
      (1000 * 60 * 60 * 24);
    const left = (startOffset / totalDays) * 100;
    const width = Math.max((duration / totalDays) * 100, 0.5);
    return { left: `${left}%`, width: `${width}%` };
  };

  const milestoneLines = useMemo(() => {
    if (!showMilestoneLines) return [];
    const positions: number[] = [];
    tasks.forEach((task) => {
      if (task.type === "milestone") {
        const pct =
          ((task.start.getTime() - dateRange.start.getTime()) /
            (dateRange.end.getTime() - dateRange.start.getTime())) *
          100;
        if (!Number.isNaN(pct)) positions.push(pct);
      }
      if (task.type === "project" && task.milestoneDates) {
        task.milestoneDates.forEach((mDate) => {
          const pct =
            ((mDate.getTime() - dateRange.start.getTime()) /
              (dateRange.end.getTime() - dateRange.start.getTime())) *
            100;
          if (!Number.isNaN(pct)) positions.push(pct);
        });
      }
    });
    return Array.from(new Set(positions.map((p) => Number(p.toFixed(3)))));
  }, [tasks, dateRange, showMilestoneLines]);

  const yearBoundaryLines = useMemo(() => {
    const positions: Array<{ pct: number; year: number }> = [];
    const rangeMs = dateRange.end.getTime() - dateRange.start.getTime();
    if (rangeMs <= 0) return positions;
    let current = new Date(dateRange.start.getFullYear(), 0, 1);
    if (current <= dateRange.start) {
      current = new Date(current.getFullYear() + 1, 0, 1);
    }
    while (current < dateRange.end) {
      const pct = ((current.getTime() - dateRange.start.getTime()) / rangeMs) * 100;
      if (!Number.isNaN(pct)) {
        positions.push({ pct, year: current.getFullYear() });
      }
      current = new Date(current.getFullYear() + 1, 0, 1);
    }
    return positions;
  }, [dateRange]);

  const getStatusColor = (status: Status) => {
    switch (status) {
      case "on-time":
        return "#16a34a";
      case "at-risk":
        return "#f59e0b";
      case "overdue":
        return "#dc2626";
      case "planned":
      default:
        return "#b8c2d1";
    }
  };

  const getTaskBarColor = (task: GanttTask) => {
    if (task.id.startsWith("project-")) {
      return "#7e22ce"; // morado
    }
    if (task.id.startsWith("activity-")) {
      return "#0f766e"; // azul acuamarina oscuro
    }
    return getStatusColor(task.status);
  };

  const getTodayPosition = () => {
    const today = new Date();
    const offset =
      (today.getTime() - dateRange.start.getTime()) / (1000 * 60 * 60 * 24);
    return (offset / totalDays) * 100;
  };

  useEffect(() => {
    if (!centerOnToday || !scrollRef.current || !contentRef.current || tasks.length === 0)
      return;
    const container = scrollRef.current;
    const content = contentRef.current;
    const todayPos = getTodayPosition();
    const target =
      (todayPos / 100) * content.scrollWidth - container.clientWidth / 2;
    container.scrollTo({ left: Math.max(target, 0), behavior: "smooth" });
  }, [centerOnToday, tasks, viewMode, dateRange]);

  useLayoutEffect(() => {
    if (!contentRef.current) return;
    const timelineWidth = contentRef.current.clientWidth - leftColumnWidth;
    const todayPos = getTodayPosition();
    const px = (todayPos / 100) * timelineWidth;
    if (px < 0 || px > timelineWidth) {
      setTodayLeftPx(null);
    } else {
      setTodayLeftPx(px);
    }
  }, [dateRange, timeColumns, tasks, leftColumnWidth]);

  useEffect(() => {
    const currentActivityIds = new Set(
      tasks
        .filter((task) => task.id.startsWith("activity-"))
        .map((task) => Number(task.id.replace("activity-", "")))
        .filter((id) => Number.isFinite(id)),
    );
    setCollapsedActivityIds((prev) => {
      const next = new Set<number>();
      prev.forEach((id) => {
        if (currentActivityIds.has(id)) next.add(id);
      });
      return next;
    });
  }, [tasks]);

  const visibleTasks = useMemo(
    () =>
      tasks.filter((task) => {
        const isSubactivity = task.id.startsWith("subactivity-");
        if (!isSubactivity || typeof task.activityId !== "number") return true;
        return !collapsedActivityIds.has(task.activityId);
      }),
    [tasks, collapsedActivityIds],
  );

  const formatDate = (date: Date) => {
    if (viewMode === "week") {
      return date.toLocaleDateString("es-ES", {
        day: "2-digit",
        month: "short",
      });
    }
    return date.toLocaleDateString("es-ES", {
      month: "short",
      year: "numeric",
    });
  };

  if (tasks.length === 0) {
    return (
      <Box
        p={12}
        textAlign="center"
        bg={gridBg}
        borderRadius="xl"
        border="2px dashed"
        borderColor={lineColor}
      >
        <Heading size="sm" mb={1}>
          No hay tareas para mostrar
        </Heading>
        <Text color="gray.500" fontSize="sm">
          Crea proyectos con fechas para ver el diagrama de Gantt.
        </Text>
      </Box>
    );
  }

  return (
    <Box
      w="100%"
      maxW="100%"
      borderWidth="1px"
      borderRadius="xl"
      bg={containerBg}
      boxShadow="sm"
      overflow="hidden"
    >
      <Box ref={scrollRef} overflowX="auto" overflowY="auto" maxH="620px" position="relative">
        <Box position="relative" bg={rowBg} minW="1100px" ref={contentRef}>
          <Flex position="sticky" top={0} zIndex={10} bg={headerBg} borderBottomWidth="1px">
            <Box
              w="300px"
              px={4}
              py={3}
              fontWeight="semibold"
              fontSize="sm"
              color={headerTitleColor}
              borderRightWidth="1px"
            >
              Elemento / Proyecto / Fechas
            </Box>

            <Box flex="1" position="relative" h="64px">
              <Flex h="100%">
                {timeColumns.map((date, index) => (
                  <Flex
                    key={index}
                    flex="1"
                    px={2}
                    fontSize="xs"
                    color={labelColor}
                    borderLeftWidth={index > 0 ? "1px" : "0"}
                    borderLeftColor={lineColor}
                    align="center"
                    justify="center"
                    textAlign="center"
                    bg={headerBg}
                  >
                    {formatDate(date)}
                  </Flex>
                ))}
              </Flex>
            </Box>
          </Flex>

          {yearBoundaryLines.length > 0 && (
            <Box
              position="absolute"
              top={-260}
              bottom={0}
              left={`${leftColumnWidth}px`}
              right={0}
              pointerEvents="none"
              zIndex={2}
            >
              {yearBoundaryLines.map(({ pct, year }) => (
                <Box
                  key={`year-line-${year}-${pct}`}
                  position="absolute"
                  top={0}
                  bottom={0}
                  left={`${pct}%`}
                  borderLeft="2px dashed black"
                  opacity={0.7}
                />
              ))}
            </Box>
          )}

          {milestoneLines.length > 0 && (
            <Box
              position="absolute"
              top={-260}
              bottom={0}
              left={`${leftColumnWidth}px`}
              right={0}
              pointerEvents="none"
              zIndex={3}
            >
              {milestoneLines.map((pct, idx) => (
                <Box
                  key={`ms-line-${idx}-${pct}`}
                  position="absolute"
                  top={0}
                  bottom={0}
                  left={`${pct}%`}
                  borderLeft="2px dashed red"
                />
              ))}
            </Box>
          )}

          {visibleTasks.map((task, idx) => {
            const isMilestone = task.type === "milestone";
            const barPosition = getBarStyle(task);
            const isActivity = task.id.startsWith("activity-");
            const activityId = isActivity
              ? Number(task.id.replace("activity-", ""))
              : null;
            const isCollapsed =
              typeof activityId === "number" && collapsedActivityIds.has(activityId);
            const typeLabel = task.id.startsWith("project-")
              ? "Proyecto"
              : task.id.startsWith("activity-")
                ? "Actividad"
                : task.id.startsWith("subactivity-")
                  ? "Subactividad"
                  : isMilestone
                    ? "Hito"
                    : "Tarea";

            const isRowClickable = task.type === "project" || isActivity;
            const handleRowClick = () => {
              if (task.type === "project" && task.projectId && onProjectClick) {
                onProjectClick(task.projectId);
                return;
              }
              if (isActivity && typeof activityId === "number") {
                setCollapsedActivityIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(activityId)) {
                    next.delete(activityId);
                  } else {
                    next.add(activityId);
                  }
                  return next;
                });
              }
            };

            return (
              <Flex
                key={task.id}
                borderBottomWidth="1px"
                borderColor={lineColor}
                _hover={{ bg: gridBg }}
                transition="background-color 0.15s ease"
                bg={idx % 2 === 0 ? rowBg : gridBg}
                cursor={isRowClickable ? "pointer" : "default"}
                onClick={isRowClickable ? handleRowClick : undefined}
              >
                <HStack
                  spacing={3}
                  w="300px"
                  px={4}
                  py={3}
                  borderRightWidth="1px"
                  borderColor={lineColor}
                  align="center"
                  role={isRowClickable ? "button" : undefined}
                  cursor={isRowClickable ? "pointer" : "default"}
                  _hover={
                    isRowClickable
                      ? { bg: gridBg, transition: "background 0.15s ease" }
                      : undefined
                  }
                >
                  <Box flex="1" minW={0}>
                    <Text fontSize="sm" fontWeight="semibold" noOfLines={1} color={taskTitleColor}>
                      {isActivity ? `${isCollapsed ? "▸" : "▾"} ${task.name}` : task.name}
                    </Text>

                    <HStack spacing={2} mt={1} align="center">
                      <Tag size="sm" colorScheme={isMilestone ? "purple" : "gray"}>
                        {typeLabel}
                      </Tag>

                      {task.type === "project" && task.hasMilestones && (
                        <Box
                          w="10px"
                          h="10px"
                          bg="purple.500"
                          transform="rotate(45deg)"
                          borderRadius="2px"
                          boxShadow="sm"
                          border="1px solid rgba(255,255,255,0.7)"
                        />
                      )}

                      {task.project && (
                        <Text fontSize="xs" color="gray.500" noOfLines={1}>
                          {task.project}
                        </Text>
                      )}
                    </HStack>

                    <Text fontSize="xs" color="gray.500">
                      {task.start.toLocaleDateString("es-ES")} OCo{" "}
                      {task.end.toLocaleDateString("es-ES")}
                    </Text>
                  </Box>
                </HStack>

                <Box flex="1" position="relative" h="60px">
                  <Flex
                    position="absolute"
                    inset={0}
                    bgGradient={`linear(to-r, ${lineColor} 1px, transparent 1px)`}
                    bgSize={`${100 / timeColumns.length}% 100%`}
                    opacity={0.6}
                  />

                  <Tooltip
                    label={`${task.name} -A ${typeLabel}${task.project ? ` -A ${task.project}` : ""}\n${task.start.toLocaleDateString("es-ES")} OCo ${task.end.toLocaleDateString("es-ES")}`}
                    hasArrow
                    bg="gray.800"
                    color="white"
                    fontSize="xs"
                    borderRadius="md"
                    p={2}
                    whiteSpace="pre-line"
                    openDelay={150}
                  >
                    {isMilestone ? (
                      <Box
                        position="absolute"
                        top={-260}
                        bottom={0}
                        left={barPosition.left}
                        borderLeft="2px dashed red"
                        transform="translateX(-50%)"
                        pointerEvents="none"
                        zIndex={2}
                      />
                    ) : (
                      <Box
                        position="absolute"
                        top="50%"
                        transform="translateY(-50%)"
                        h="32px"
                        borderRadius="md"
                        bg={getTaskBarColor(task)}
                        cursor="pointer"
                        boxShadow="md"
                        transition="all 0.15s ease"
                        _hover={{
                          boxShadow: "lg",
                          transform: "translateY(-50%) scale(1.02)",
                        }}
                        {...barPosition}
                      >
                        <Box
                          position="absolute"
                          left={0}
                          top={0}
                          bottom={0}
                          w={`${task.progress}%`}
                          bg="rgba(255,255,255,0.35)"
                          borderRadius="md"
                        />

                        <Flex
                          position="absolute"
                          inset={0}
                          align="center"
                          px={2}
                          fontSize="xs"
                          fontWeight="semibold"
                          color="white"
                        >
                          {Math.round(task.progress)}%
                        </Flex>
                      </Box>
                    )}
                  </Tooltip>
                </Box>
              </Flex>
            );
          })}

          {todayLeftPx !== null && (
            <Box
              position="absolute"
              top={0}
              bottom={0}
              left={`${leftColumnWidth}px`}
              right={0}
              pointerEvents="none"
            >
              <Box position="absolute" top={0} bottom={0} left={`${todayLeftPx}px`} w="2px" bg="brand.600">
                <Box
                  position="absolute"
                  top="-24px"
                  left="50%"
                  transform="translateX(-50%)"
                  bg="brand.600"
                  color="white"
                  px={2}
                  py={1}
                  borderRadius="md"
                  fontSize="xs"
                  fontWeight="semibold"
                  whiteSpace="nowrap"
                >
                  HOY
                </Box>
              </Box>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
};

