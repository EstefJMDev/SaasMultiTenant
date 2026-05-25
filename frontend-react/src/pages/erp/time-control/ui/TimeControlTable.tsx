import React from "react";
import {
  Badge,
  Box,
  Button,
  Divider,
  Heading,
  HStack,
  IconButton,
  SimpleGrid,
  Stack,
  Text,
  VStack,
} from "@chakra-ui/react";
import { FaPlay, FaStop } from "react-icons/fa";
import type { ErpTask, TimeSession } from "@api/erpTimeTracking";
import type { TimeSessionBlock } from "@api/erpSessions";
import type { TimeControlViewMode } from "../hooks/useTimeControlFilters";
import {
  formatDayLabel,
  formatMinutesLabel,
  formatSeconds,
  HOUR_HEIGHT,
  HOURS,
  MIN_SESSION_MINUTES,
} from "../utils/timeControl.format";

interface TimeControlTableProps {
  viewMode: TimeControlViewMode;
  sessionsError: string | null;
  sessions: TimeSessionBlock[];
  isLoadingSessions: boolean;
  weekDays: Date[];
  now: Date;
  i18nLanguage: string;
  panelBg: string;
  cardBg: string;
  subtleText: string;
  mutedText: string;
  accent: string;
  calendarHeaderActiveBg: string;
  calendarHeaderActiveText: string;
  calendarHeaderIdleBg: string;
  calendarHeaderIdleText: string;
  activeSessionBg: string;
  activeSessionBorder: string;
  activeSessionText: string;
  recentTasks: ErpTask[];
  currentUserId: number | null;
  dragTaskId: number | null;
  isDraggingSession: boolean;
  isRunning: boolean;
  isLoading: boolean;
  formattedElapsed: string;
  elapsedSeconds: number;
  activeSession: TimeSession | null;
  taskById: Map<number, ErpTask>;
  calendarRef: React.RefObject<HTMLDivElement>;
  selection: {
    dayIndex: number;
    startMinutes: number;
    endMinutes: number;
  } | null;
  dragState: {
    mode: "select" | "move" | "resize";
    sessionId?: number;
    dayIndex: number;
    startMinutes: number;
    endMinutes: number;
    offsetMinutes?: number;
    originalSession?: TimeSessionBlock;
  } | null;
  pendingDragOriginalRef: React.MutableRefObject<TimeSessionBlock | null>;
  setDragTaskId: (value: number | null) => void;
  setDragState: (value: any) => void;
  setIsDraggingSession: (value: boolean) => void;
  startSelection: (dayIndex: number, minutes: number) => void;
  onTaskDragStart: (event: React.DragEvent<HTMLDivElement>, taskId: number) => void;
  onCalendarDrop: (event: React.DragEvent<HTMLDivElement>) => void;
  getMinutesFromClientY: (clientY: number) => number;
  openEditSession: (session: TimeSessionBlock) => void;
  handleQuickStart: (taskId: number) => void;
  handleQuickDelete: (sessionId: number) => void;
  handleStop: () => void;
  t: (key: string, options?: any) => string;
}

export const TimeControlTable: React.FC<TimeControlTableProps> = ({
  viewMode,
  sessionsError,
  sessions,
  isLoadingSessions,
  weekDays,
  now,
  i18nLanguage,
  panelBg,
  cardBg,
  subtleText,
  mutedText,
  accent,
  calendarHeaderActiveBg,
  calendarHeaderActiveText,
  calendarHeaderIdleBg,
  calendarHeaderIdleText,
  activeSessionBg,
  activeSessionBorder,
  activeSessionText,
  recentTasks,
  currentUserId,
  dragTaskId,
  isDraggingSession,
  isRunning,
  isLoading,
  formattedElapsed,
  elapsedSeconds,
  activeSession,
  taskById,
  calendarRef,
  selection,
  dragState,
  pendingDragOriginalRef,
  setDragTaskId,
  setDragState,
  setIsDraggingSession,
  startSelection,
  onTaskDragStart,
  onCalendarDrop,
  getMinutesFromClientY,
  openEditSession,
  handleQuickStart,
  handleQuickDelete,
  handleStop,
  t,
}) => (
  <>
    {sessionsError && (
      <Text color="red.400" mb={4}>
        {sessionsError}
      </Text>
    )}

    {viewMode === "calendar" && (
      <Box borderWidth="1px" borderRadius="xl" p={4} bg={panelBg} mb={4}>
        <HStack justify="space-between" align="center" mb={3}>
          <Heading size="sm">{t("timeControl.recent.title")}</Heading>
          <Text fontSize="xs" color={subtleText}>
            {currentUserId
              ? t("timeControl.recent.assigned")
              : t("timeControl.recent.recent")}
          </Text>
        </HStack>
        {recentTasks.length === 0 ? (
          <Text fontSize="sm" color={mutedText}>
            {t("timeControl.recent.empty")}
          </Text>
        ) : (
          <SimpleGrid columns={{ base: 1, md: 3 }} spacing={3}>
            {recentTasks.map((task) => (
              <Box
                key={task.id}
                borderWidth="1px"
                borderRadius="lg"
                p={3}
                bg={cardBg}
                minW={0}
                draggable
                cursor="grab"
                opacity={dragTaskId === task.id ? 0.6 : 1}
                onDragStart={(event) => onTaskDragStart(event, task.id)}
                onDragEnd={() => setDragTaskId(null)}
              >
                <Stack spacing={2}>
                  <Box>
                    <Text fontSize="sm" fontWeight="semibold" noOfLines={1}>
                      {task.title}
                    </Text>
                    <Text fontSize="xs" color={subtleText}>
                      #{task.id}
                    </Text>
                  </Box>
                  <Button
                    size="xs"
                    colorScheme="brand"
                    alignSelf="flex-start"
                    onClick={() => handleQuickStart(task.id)}
                    isDisabled={isRunning}
                  >
                    {t("timeControl.actions.play")}
                  </Button>
                </Stack>
              </Box>
            ))}
          </SimpleGrid>
        )}
      </Box>
    )}

    {viewMode === "calendar" && (
      <Box
        borderWidth="1px"
        borderRadius="xl"
        bg={cardBg}
        overflow="hidden"
        onDragOver={(event) => event.preventDefault()}
        onDrop={onCalendarDrop}
      >
        <SimpleGrid columns={8} gap={0} borderBottomWidth="1px">
          <Box p={3} borderRightWidth="1px">
            <Text fontSize="xs" color={subtleText}>
              {t("timeControl.calendar.hour")}
            </Text>
          </Box>
          {weekDays.map((day) => {
            const isToday = day.toDateString() === now.toDateString();
            return (
              <Box
                key={day.toISOString()}
                p={3}
                borderRightWidth="1px"
                bg={isToday ? calendarHeaderActiveBg : calendarHeaderIdleBg}
              >
                <Text
                  fontSize="xs"
                  fontWeight="semibold"
                  textTransform="uppercase"
                  letterSpacing="0.08em"
                  color={
                    isToday ? calendarHeaderActiveText : calendarHeaderIdleText
                  }
                >
                  {formatDayLabel(day, i18nLanguage)}
                </Text>
              </Box>
            );
          })}
        </SimpleGrid>
        <Box position="relative" ref={calendarRef}>
          {HOURS.map((hour) => (
            <SimpleGrid key={hour} columns={8} gap={0} minH={`${HOUR_HEIGHT}px`}>
              <Box borderRightWidth="1px" borderBottomWidth="1px" p={2} bg={panelBg}>
                <Text fontSize="xs" color={subtleText}>
                  {hour.toString().padStart(2, "0")}:00
                </Text>
              </Box>
              {weekDays.map((_, idx) => (
                <Box
                  key={`${idx}-${hour}`}
                  borderRightWidth="1px"
                  borderBottomWidth="1px"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    const minutes = getMinutesFromClientY(event.clientY);
                    startSelection(idx, minutes);
                  }}
                  _hover={{ bg: panelBg, cursor: "crosshair" }}
                />
              ))}
            </SimpleGrid>
          ))}
          {weekDays.some((day) => day.toDateString() === now.toDateString()) && (
            <Box
              position="absolute"
              left="0"
              top={`${((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR_HEIGHT}px`}
              width="100%"
              height="2px"
              bg="red.500"
              zIndex={2}
            >
              <Box
                position="absolute"
                left="calc(12.5% + 8px)"
                top="50%"
                transform="translateY(-50%)"
                bg="red.500"
                color="white"
                px={3}
                py={1}
                borderRadius="full"
                fontSize="xs"
                fontWeight="semibold"
                lineHeight="1"
              >
                {now.toLocaleTimeString(i18nLanguage, {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </Box>
            </Box>
          )}
          {dragState &&
            (dragState.mode === "move" || dragState.mode === "resize") &&
            dragState.sessionId && (
              <Box
                position="absolute"
                left={`calc(${(dragState.dayIndex + 1) * 12.5}% )`}
                top={`${(dragState.startMinutes / 60) * HOUR_HEIGHT}px`}
                width="12.5%"
                height={`${((dragState.endMinutes - dragState.startMinutes) / 60) * HOUR_HEIGHT}px`}
                border="2px dashed"
                borderColor={accent}
                bg="rgba(0,102,43,0.08)"
                borderRadius="md"
                pointerEvents="none"
                zIndex={3}
              >
                <Box
                  position="absolute"
                  top="-18px"
                  left="4px"
                  bg={accent}
                  color="white"
                  px={2}
                  py={0.5}
                  borderRadius="full"
                  fontSize="xs"
                  boxShadow="sm"
                >
                  {formatMinutesLabel(dragState.startMinutes)} -{" "}
                  {formatMinutesLabel(dragState.endMinutes)}
                </Box>
              </Box>
            )}
          {selection && (
            <Box
              position="absolute"
              left={`calc(${(selection.dayIndex + 1) * 12.5}% )`}
              top={`${(Math.min(selection.startMinutes, selection.endMinutes) / 60) * HOUR_HEIGHT}px`}
              width="12.5%"
              height={`${(Math.max(
                MIN_SESSION_MINUTES,
                Math.abs(selection.endMinutes - selection.startMinutes),
              ) / 60) * HOUR_HEIGHT}px`}
              bg="rgba(0,102,43,0.08)"
              border="1px dashed"
              borderColor={accent}
              borderRadius="md"
            />
          )}
          {sessions.map((session) => {
            const start = new Date(session.started_at);
            const end = session.ended_at
              ? new Date(session.ended_at)
              : new Date(start.getTime() + MIN_SESSION_MINUTES * 60000);
            const dayIndex = weekDays.findIndex(
              (day) => day.toDateString() === start.toDateString(),
            );
            if (dayIndex < 0) return null;
            const startMinutes = start.getHours() * 60 + start.getMinutes();
            const endMinutes = end.getHours() * 60 + end.getMinutes();
            const top = (startMinutes / 60) * HOUR_HEIGHT;

            let height: number;
            if (session.is_active && activeSession && activeSession.id === session.id) {
              const minHeightForActive = 8;
              const elapsedHeight = (elapsedSeconds / 3600) * HOUR_HEIGHT;
              height = Math.max(minHeightForActive, elapsedHeight);
            } else {
              height = Math.max(
                HOUR_HEIGHT * (MIN_SESSION_MINUTES / 60),
                ((end.getTime() - start.getTime()) / 3600000) * HOUR_HEIGHT,
              );
            }

            const task = session.task_id ? taskById.get(session.task_id) : undefined;
            return (
              <Box
                key={`${session.id}-${session.started_at}`}
                position="absolute"
                left={`calc(${(dayIndex + 1) * 12.5}% )`}
                top={top}
                width="12.5%"
                height={`${height}px`}
                bg={session.is_active ? activeSessionBg : "brand.100"}
                border="1px solid"
                borderColor={session.is_active ? activeSessionBorder : "transparent"}
                borderRadius="md"
                p={2}
                overflow="visible"
                cursor={
                  session.is_active
                    ? "default"
                    : isDraggingSession
                      ? "grabbing"
                      : "grab"
                }
                userSelect="none"
                transition="all 0.5s ease-in-out"
                onClick={(event) => {
                  event.stopPropagation();
                  if (isDraggingSession) return;
                  openEditSession(session);
                }}
                onMouseDown={(event) => {
                  if (session.is_active) return;
                  event.preventDefault();
                  event.stopPropagation();
                  pendingDragOriginalRef.current = session;
                  const minutes = getMinutesFromClientY(event.clientY);
                  const offset = minutes - startMinutes;
                  setIsDraggingSession(true);
                  setDragState({
                    mode: "move",
                    sessionId: session.id,
                    dayIndex,
                    startMinutes,
                    endMinutes,
                    offsetMinutes: offset,
                    originalSession: session,
                  });
                }}
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  openEditSession(session);
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  handleQuickDelete(session.id);
                }}
              >
                {!session.is_active && (
                  <Box
                    position="absolute"
                    top="2px"
                    left="2px"
                    right="28px"
                    height="16px"
                    borderRadius="full"
                    bg="rgba(0, 102, 43, 0.35)"
                    cursor="grab"
                    display="flex"
                    alignItems="center"
                    paddingLeft="6px"
                    fontSize="10px"
                    color="white"
                    textTransform="uppercase"
                    letterSpacing="0.06em"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      pendingDragOriginalRef.current = session;
                      const minutes = getMinutesFromClientY(event.clientY);
                      const offset = minutes - startMinutes;
                      setIsDraggingSession(true);
                      setDragState({
                        mode: "move",
                        sessionId: session.id,
                        dayIndex,
                        startMinutes,
                        endMinutes,
                        offsetMinutes: offset,
                        originalSession: session,
                      });
                    }}
                  >
                    {t("timeControl.actions.move")}
                  </Box>
                )}
                <HStack spacing={2} justify="space-between" align="start" mb={1}>
                  <HStack spacing={2} align="start">
                    <Text fontSize="xs" fontWeight="semibold" noOfLines={1} mt={!session.is_active ? 2 : 0}>
                      {task
                        ? task.title
                        : session.task_id
                          ? t("timeControl.labels.taskId", { id: session.task_id })
                          : t("timeControl.labels.noTask")}
                    </Text>
                    {session.is_active && activeSession && activeSession.id === session.id && (
                      <Text fontSize="xs" fontWeight="semibold" color={activeSessionText} mt={!session.is_active ? 2 : 0}>
                        {formattedElapsed}
                      </Text>
                    )}
                  </HStack>
                </HStack>
                <Text fontSize="xs" color={subtleText}>
                  {start.toLocaleTimeString(i18nLanguage, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  -{" "}
                  {end.toLocaleTimeString(i18nLanguage, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Text>
                {session.description && (
                  <Text fontSize="xs" color={mutedText} noOfLines={1}>
                    {session.description}
                  </Text>
                )}
                {!session.is_active && (
                  <Box
                    position="absolute"
                    bottom="2px"
                    right="2px"
                    w="12px"
                    h="12px"
                    borderRadius="full"
                    bg={accent}
                    cursor="ns-resize"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      pendingDragOriginalRef.current = session;
                      setIsDraggingSession(true);
                      setDragState({
                        mode: "resize",
                        sessionId: session.id,
                        dayIndex,
                        startMinutes,
                        endMinutes,
                      });
                    }}
                  />
                )}
              </Box>
            );
          })}
        </Box>
      </Box>
    )}

    {viewMode === "list" && (
      <Stack spacing={3}>
        {isLoadingSessions && <Text>{t("timeControl.sessions.loading")}</Text>}
        {!isLoadingSessions &&
          sessions.map((session) => {
            const task = session.task_id ? taskById.get(session.task_id) : undefined;
            return (
              <Box
                key={`${session.id}-${session.started_at}`}
                borderWidth="1px"
                borderRadius="xl"
                p={4}
                bg={cardBg}
                onClick={() => openEditSession(session)}
                cursor="pointer"
              >
                <HStack justify="space-between" align="flex-start">
                  <Box>
                    <Text fontWeight="semibold">
                      {task
                        ? task.title
                        : session.task_id
                          ? t("timeControl.labels.taskId", { id: session.task_id })
                          : t("timeControl.labels.noTask")}
                    </Text>
                    <Text fontSize="sm" color={subtleText}>
                      {new Date(session.started_at).toLocaleString(i18nLanguage)}
                    </Text>
                    {session.description && (
                      <Text fontSize="xs" color={mutedText} mt={1}>
                        {session.description}
                      </Text>
                    )}
                  </Box>
                  <VStack align="flex-end" spacing={2}>
                    <Badge colorScheme="brand">
                      {formatSeconds(session.duration_seconds)}
                    </Badge>
                    <HStack>
                      {isRunning && activeSession?.id === session.id ? (
                        <IconButton
                          aria-label={t("timeControl.actions.stop")}
                          icon={<FaStop />}
                          size="sm"
                          colorScheme="red"
                          variant="outline"
                          isRound
                          onClick={(event) => {
                            event.stopPropagation();
                            handleStop();
                          }}
                          isLoading={isLoading && isRunning}
                          isDisabled={!isRunning}
                        />
                      ) : (
                        <IconButton
                          aria-label={t("timeControl.actions.start")}
                          icon={<FaPlay />}
                          size="sm"
                          colorScheme="brand"
                          isRound
                          onClick={(event) => {
                            event.stopPropagation();
                            if (!session.task_id) return;
                            handleQuickStart(session.task_id);
                          }}
                          isDisabled={isRunning || !session.task_id}
                        />
                      )}
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={(event) => {
                          event.stopPropagation();
                          openEditSession(session);
                        }}
                      >
                        {t("timeControl.actions.edit")}
                      </Button>
                      <Button
                        size="xs"
                        colorScheme="red"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleQuickDelete(session.id);
                        }}
                      >
                        {t("timeControl.actions.delete")}
                      </Button>
                    </HStack>
                  </VStack>
                </HStack>
              </Box>
            );
          })}
      </Stack>
    )}

    {viewMode === "timesheet" && (
      <Stack spacing={4}>
        {weekDays.map((day) => {
          const daySessions = sessions.filter(
            (session) =>
              new Date(session.started_at).toDateString() === day.toDateString(),
          );
          const totalSeconds = daySessions.reduce(
            (acc, session) => acc + session.duration_seconds,
            0,
          );
          return (
            <Box key={day.toISOString()} borderWidth="1px" borderRadius="xl" p={4} bg={cardBg}>
              <HStack justify="space-between">
                <Text fontWeight="semibold">{formatDayLabel(day, i18nLanguage)}</Text>
                <Badge>{formatSeconds(totalSeconds)}</Badge>
              </HStack>
              <Divider my={3} />
              <Stack spacing={2}>
                {daySessions.length === 0 && (
                  <Text fontSize="sm" color={mutedText}>
                    {t("timeControl.sessions.empty")}
                  </Text>
                )}
                {daySessions.map((session) => {
                  const task = session.task_id ? taskById.get(session.task_id) : undefined;
                  return (
                    <HStack
                      key={`${session.id}-${session.started_at}`}
                      justify="space-between"
                      align="flex-start"
                      onClick={() => openEditSession(session)}
                      cursor="pointer"
                    >
                      <Box>
                        <Text fontSize="sm">
                          {task
                            ? task.title
                            : session.task_id
                              ? t("timeControl.labels.taskId", { id: session.task_id })
                              : t("timeControl.labels.noTask")}
                        </Text>
                        {session.description && (
                          <Text fontSize="xs" color={mutedText}>
                            {session.description}
                          </Text>
                        )}
                      </Box>
                      <HStack spacing={3}>
                        <Text fontSize="sm" color={subtleText}>
                          {formatSeconds(session.duration_seconds)}
                        </Text>
                        {isRunning && activeSession?.id === session.id ? (
                          <IconButton
                            aria-label={t("timeControl.actions.stop")}
                            icon={<FaStop />}
                            size="sm"
                            colorScheme="red"
                            variant="outline"
                            isRound
                            onClick={(event) => {
                              event.stopPropagation();
                              handleStop();
                            }}
                            isLoading={isLoading && isRunning}
                            isDisabled={!isRunning}
                          />
                        ) : (
                          <IconButton
                            aria-label={t("timeControl.actions.start")}
                            icon={<FaPlay />}
                            size="sm"
                            colorScheme="brand"
                            isRound
                            onClick={(event) => {
                              event.stopPropagation();
                              if (!session.task_id) return;
                              handleQuickStart(session.task_id);
                            }}
                            isDisabled={isRunning || !session.task_id}
                          />
                        )}
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={(event) => {
                            event.stopPropagation();
                            openEditSession(session);
                          }}
                        >
                          {t("timeControl.actions.edit")}
                        </Button>
                        <Button
                          size="xs"
                          colorScheme="red"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleQuickDelete(session.id);
                          }}
                        >
                          {t("timeControl.actions.delete")}
                        </Button>
                      </HStack>
                    </HStack>
                  );
                })}
              </Stack>
            </Box>
          );
        })}
      </Stack>
    )}
  </>
);

