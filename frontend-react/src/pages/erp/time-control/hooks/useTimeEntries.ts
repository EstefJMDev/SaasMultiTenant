import { useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@chakra-ui/react";
import { useQueryClient } from "@tanstack/react-query";

import {
  ErpTask,
  fetchErpTasks,
  getActiveTimeSession,
  startTimeSession,
  stopTimeSession,
  TimeSession,
} from "@api/erpTimeTracking";
import { fetchSubActivities, type ErpSubActivity } from "@api/erpStructure";
import {
  createTimeSession,
  deleteTimeSession,
  fetchTimeSessions,
  TimeSessionBlock,
  updateTimeSession,
} from "@api/erpSessions";
import { updateErpTask } from "@api/erpManagement";
import { projectKeys } from "@entities/projects";
import {
  formatApiError,
  formatDateInput,
  formatSeconds,
  HOUR_HEIGHT,
  MIN_SESSION_MINUTES,
} from "../utils/timeControl.format";
import {
  clamp,
  parseDateInput,
  roundToStep,
  startOfWeek,
  toLocalIsoString,
} from "../utils/timeControl.mapper";

interface UseTimeEntriesParams {
  effectiveTenantId?: number;
  currentUserId: number | null;
  weekStart: Date;
  setWeekStart: (value: Date) => void;
  weekDays: Date[];
  weekRange: { start: Date; end: Date };
  minutesStep: number;
  t: (key: string, options?: any) => string;
  onOpen: () => void;
  onClose: () => void;
}

export const useTimeEntries = ({
  effectiveTenantId,
  currentUserId,
  weekStart,
  setWeekStart,
  weekDays,
  weekRange,
  minutesStep,
  t,
  onOpen,
  onClose,
}: UseTimeEntriesParams) => {
  const toast = useToast();
  const queryClient = useQueryClient();
  const calendarRef = useRef<HTMLDivElement | null>(null);
  const pendingDragOriginalRef = useRef<TimeSessionBlock | null>(null);

  const [activeSession, setActiveSession] = useState<TimeSession | null>(null);
  const [taskIdInput, setTaskIdInput] = useState<string>("");
  const [tasks, setTasks] = useState<ErpTask[]>([]);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [subactivities, setSubactivities] = useState<ErpSubActivity[]>([]);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);
  const [now, setNow] = useState<Date>(new Date());
  const [dragTaskId, setDragTaskId] = useState<number | null>(null);
  const [isDraggingSession, setIsDraggingSession] = useState(false);
  const [recentTaskIds, setRecentTaskIds] = useState<number[]>([]);

  const [sessions, setSessions] = useState<TimeSessionBlock[]>([]);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);

  const [draftTaskId, setDraftTaskId] = useState<string>("");
  const [draftStart, setDraftStart] = useState<string>("");
  const [draftEnd, setDraftEnd] = useState<string>("");
  const [draftDescription, setDraftDescription] = useState<string>("");
  const [editingSessionId, setEditingSessionId] = useState<number | null>(null);
  const [pendingEditOriginal, setPendingEditOriginal] =
    useState<TimeSessionBlock | null>(null);
  const [selection, setSelection] = useState<{
    dayIndex: number;
    startMinutes: number;
    endMinutes: number;
  } | null>(null);
  const [dragState, setDragState] = useState<{
    mode: "select" | "move" | "resize";
    sessionId?: number;
    dayIndex: number;
    startMinutes: number;
    endMinutes: number;
    offsetMinutes?: number;
    originalSession?: TimeSessionBlock;
  } | null>(null);

  const projectsBaseKey = effectiveTenantId
    ? projectKeys.base(effectiveTenantId)
    : (["projects"] as const);

  const isRunning = Boolean(activeSession && activeSession.is_active);

  const taskById = useMemo(() => {
    const map = new Map<number, ErpTask>();
    tasks.forEach((task) => map.set(task.id, task));
    return map;
  }, [tasks]);

  const subMap = useMemo(() => {
    const map = new Map<number, ErpSubActivity>();
    subactivities.forEach((sub) => map.set(sub.id, sub));
    return map;
  }, [subactivities]);

  const totalWeekSeconds = useMemo(() => {
    return sessions.reduce((acc, session) => acc + session.duration_seconds, 0);
  }, [sessions]);

  const formattedElapsed = useMemo(
    () => formatSeconds(elapsedSeconds),
    [elapsedSeconds],
  );

  const recentTasks = useMemo(() => {
    const scopedTasks = currentUserId
      ? tasks.filter((task) => task.assigned_to_id === currentUserId)
      : tasks;
    const map = new Map(scopedTasks.map((task) => [task.id, task]));
    const fromHistory = recentTaskIds
      .map((id) => map.get(id))
      .filter((task): task is ErpTask => Boolean(task))
      .slice(0, 3);
    if (fromHistory.length > 0) return fromHistory;
    return [...scopedTasks]
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )
      .slice(0, 3);
  }, [tasks, currentUserId, recentTaskIds]);

  const getMinutesFromClientY = (clientY: number): number => {
    const rect = calendarRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const y = clamp(clientY - rect.top, 0, rect.height);
    const minutes = (y / HOUR_HEIGHT) * 60;
    return clamp(roundToStep(minutes, minutesStep), 0, 24 * 60);
  };

  const getDayIndexFromClientX = (clientX: number): number => {
    const rect = calendarRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const columnWidth = rect.width / 8;
    const x = clamp(clientX - rect.left, 0, rect.width - 1);
    return clamp(Math.floor(x / columnWidth) - 1, 0, 6);
  };

  const minutesToDate = (dayIndex: number, minutes: number): Date => {
    const base = new Date(weekDays[dayIndex]);
    base.setHours(0, 0, 0, 0);
    base.setMinutes(minutes);
    return base;
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const session = await getActiveTimeSession();
      if (!cancelled) {
        setActiveSession(session);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchErpTasks(effectiveTenantId);
        const subs = await fetchSubActivities({}, effectiveTenantId);
        if (!cancelled) {
          setTasks(list);
          setSubactivities(subs);
          setTasksError(null);
        }
      } catch (error: any) {
        if (!cancelled) {
          setTasksError(
            error?.response?.data?.detail ??
              t("timeControl.messages.tasksLoadError"),
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [effectiveTenantId, t]);

  useEffect(() => {
    if (!activeSession || !activeSession.is_active) {
      setElapsedSeconds(0);
      return;
    }

    const started = new Date(activeSession.started_at).getTime();

    const update = () => {
      const nowTs = Date.now();
      const diffSeconds = Math.max(0, Math.floor((nowTs - started) / 1000));
      setElapsedSeconds(diffSeconds);
    };

    update();
    const intervalId = window.setInterval(update, 1000);
    return () => window.clearInterval(intervalId);
  }, [activeSession]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(new Date());
    }, 60000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (activeSession?.task_id) {
      setTaskIdInput(String(activeSession.task_id));
    } else {
      setTaskIdInput("");
    }
  }, [activeSession]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoadingSessions(true);
      try {
        const list = await fetchTimeSessions(
          toLocalIsoString(weekRange.start),
          toLocalIsoString(weekRange.end),
        );
        if (!cancelled) {
          setSessions(list);
          setSessionsError(null);
        }
      } catch (error: any) {
        if (!cancelled) {
          setSessionsError(
            error?.response?.data?.detail ??
              t("timeControl.messages.sessionsLoadError"),
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoadingSessions(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [weekRange.start, weekRange.end, t]);

  useEffect(() => {
    if (!dragState) return;

    const handleMove = (event: MouseEvent) => {
      if (!calendarRef.current) return;
      const minutes = getMinutesFromClientY(event.clientY);
      const dayIndex = getDayIndexFromClientX(event.clientX);

      if (dragState.mode === "select") {
        setSelection({
          dayIndex: dragState.dayIndex,
          startMinutes: dragState.startMinutes,
          endMinutes: minutes,
        });
        return;
      }

      if (dragState.mode === "move") {
        const duration = dragState.endMinutes - dragState.startMinutes;
        const newStart = clamp(
          minutes - (dragState.offsetMinutes ?? 0),
          0,
          24 * 60 - duration,
        );
        setDragState((prev) =>
          prev
            ? {
                ...prev,
                dayIndex,
                startMinutes: newStart,
                endMinutes: newStart + duration,
              }
            : prev,
        );
        return;
      }

      if (dragState.mode === "resize") {
        const newEnd = Math.max(
          minutes,
          dragState.startMinutes + MIN_SESSION_MINUTES,
        );
        setDragState((prev) =>
          prev
            ? {
                ...prev,
                endMinutes: clamp(newEnd, 0, 24 * 60),
              }
            : prev,
        );
      }
    };

    const handleUp = async () => {
      if (dragState.mode === "select" && selection) {
        const start = Math.min(selection.startMinutes, selection.endMinutes);
        const end = Math.max(selection.startMinutes, selection.endMinutes);
        const normalizedEnd =
          end - start < MIN_SESSION_MINUTES ? start + MIN_SESSION_MINUTES : end;
        const startDate = minutesToDate(selection.dayIndex, start);
        const endDate = minutesToDate(selection.dayIndex, normalizedEnd);
        setDraftStart(formatDateInput(startDate));
        setDraftEnd(formatDateInput(endDate));
        setDraftTaskId(taskIdInput || "");
        setDraftDescription("");
        setEditingSessionId(null);
        onOpen();
        setSelection(null);
      }

      if (
        (dragState.mode === "move" || dragState.mode === "resize") &&
        dragState.sessionId
      ) {
        setIsDraggingSession(false);
        const originalSession =
          dragState.originalSession ??
          pendingDragOriginalRef.current ??
          sessions.find((session) => session.id === dragState.sessionId);
        if (!originalSession) {
          pendingDragOriginalRef.current = null;
          setDragState(null);
          return;
        }
        const startDate = minutesToDate(
          dragState.dayIndex,
          dragState.startMinutes,
        );
        const endDate = minutesToDate(
          dragState.dayIndex,
          dragState.endMinutes,
        );
        const updatedSession: TimeSessionBlock = {
          ...originalSession,
          started_at: toLocalIsoString(startDate),
          ended_at: toLocalIsoString(endDate),
          duration_seconds: Math.max(
            0,
            Math.floor((endDate.getTime() - startDate.getTime()) / 1000),
          ),
        };
        setSessions((prev) =>
          prev.map((session) =>
            session.id === dragState.sessionId ? updatedSession : session,
          ),
        );
        setPendingEditOriginal(originalSession);
        pendingDragOriginalRef.current = null;
        openEditSession(updatedSession);
      }

      setIsDraggingSession(false);
      setDragState(null);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp, { once: true });

    return () => {
      window.removeEventListener("mousemove", handleMove);
    };
  }, [
    dragState,
    selection,
    onOpen,
    taskIdInput,
    weekDays,
    sessions,
    minutesStep,
  ]);

  const updateRecentTaskIds = (taskId: number) => {
    setRecentTaskIds((prev) => {
      const next = [taskId, ...prev.filter((id) => id !== taskId)].slice(0, 10);
      return next;
    });
  };

  const handleTaskSelectionChange = (value: string) => {
    setTaskIdInput(value);
    const id = Number(value);
    if (!Number.isNaN(id) && id > 0) {
      updateRecentTaskIds(id);
    }
  };

  const handleStart = async () => {
    const taskId = taskIdInput ? Number(taskIdInput) : null;
    if (taskIdInput && (!taskId || Number.isNaN(taskId))) {
      toast({
        title: t("timeControl.messages.invalidTaskTitle"),
        description: t("timeControl.messages.invalidTaskDesc"),
        status: "warning",
      });
      return;
    }

    try {
      setIsLoading(true);
      const session = await startTimeSession(taskId, effectiveTenantId);
      if (taskId) {
        updateRecentTaskIds(taskId);
        await updateErpTask(taskId, { status: "in_progress" }, effectiveTenantId);
      }
      setActiveSession(session);
      setTaskIdInput(taskId ? String(taskId) : "");
      setWeekStart(startOfWeek(new Date()));
      if (taskId) {
        setTasks((prev) =>
          prev.map((task) =>
            task.id === taskId ? { ...task, status: "in_progress" } : task,
          ),
        );
      }
      toast({
        title: t("timeControl.messages.trackingStartedTitle"),
        description: t("timeControl.messages.trackingStartedDesc", {
          taskId: taskId ?? "-",
        }),
        status: "success",
      });
    } catch (error: any) {
      toast({
        title: t("timeControl.messages.trackingStartErrorTitle"),
        description:
          error?.response?.data?.detail ??
          t("timeControl.messages.trackingStartErrorFallback"),
        status: "error",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickStart = async (taskId: number) => {
    if (isRunning) {
      toast({
        title: t("timeControl.messages.sessionActiveTitle"),
        description: t("timeControl.messages.sessionActiveDesc"),
        status: "warning",
      });
      return;
    }
    try {
      setIsLoading(true);
      const session = await startTimeSession(taskId, effectiveTenantId);
      updateRecentTaskIds(taskId);
      await updateErpTask(taskId, { status: "in_progress" }, effectiveTenantId);
      queryClient.invalidateQueries({ queryKey: projectsBaseKey });
      setActiveSession(session);
      setTaskIdInput(String(taskId));
      setWeekStart(startOfWeek(new Date()));
      setTasks((prev) =>
        prev.map((task) =>
          task.id === taskId ? { ...task, status: "in_progress" } : task,
        ),
      );
      toast({
        title: t("timeControl.messages.trackingStartedTitle"),
        description: t("timeControl.messages.trackingStartedDesc", {
          taskId,
        }),
        status: "success",
      });
    } catch (error: any) {
      toast({
        title: t("timeControl.messages.trackingStartErrorTitle"),
        description:
          error?.response?.data?.detail ??
          t("timeControl.messages.trackingStartErrorFallback"),
        status: "error",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleStop = async () => {
    try {
      setIsLoading(true);
      const session = await stopTimeSession(effectiveTenantId);
      setActiveSession(session?.is_active ? session : null);
      if (session) {
        setSessions((prev) => {
          const exists = prev.some((item) => item.id === session.id);
          if (exists) {
            return prev.map((item) =>
              item.id === session.id ? { ...item, ...session } : item,
            );
          }
          return [session, ...prev];
        });
        if (session.task_id) {
          await updateErpTask(
            session.task_id,
            { status: "pending" },
            effectiveTenantId,
          );
          queryClient.invalidateQueries({ queryKey: projectsBaseKey });
          setTasks((prev) =>
            prev.map((task) =>
              task.id === session.task_id
                ? { ...task, status: "pending" }
                : task,
            ),
          );
        }
      } else if (activeSession?.task_id) {
        await updateErpTask(
          activeSession.task_id,
          { status: "pending" },
          effectiveTenantId,
        );
        queryClient.invalidateQueries({ queryKey: projectsBaseKey });
        setTasks((prev) =>
          prev.map((task) =>
            task.id === activeSession.task_id
              ? { ...task, status: "pending" }
              : task,
          ),
        );
      }
      toast({
        title: t("timeControl.messages.trackingStopTitle"),
        description: t("timeControl.messages.trackingStopDesc", {
          duration: formattedElapsed,
        }),
        status: "info",
      });
    } catch (error: any) {
      toast({
        title: t("timeControl.messages.trackingStopErrorTitle"),
        description:
          error?.response?.data?.detail ??
          t("timeControl.messages.trackingStopErrorFallback"),
        status: "error",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const startSelection = (dayIndex: number, minutes: number) => {
    const normalized = clamp(roundToStep(minutes, minutesStep), 0, 24 * 60);
    setSelection({
      dayIndex,
      startMinutes: normalized,
      endMinutes: normalized,
    });
    setDragState({
      mode: "select",
      dayIndex,
      startMinutes: normalized,
      endMinutes: normalized,
    });
  };

  const handleSaveSession = async () => {
    const taskId = draftTaskId ? Number(draftTaskId) : null;
    const hasValidTaskId = taskId !== null && Number.isFinite(taskId);
    if (!draftStart || !draftEnd) {
      toast({
        title: t("timeControl.messages.selectRange"),
        status: "warning",
      });
      return;
    }
    try {
      const basePayload = {
        description: draftDescription || null,
        started_at: toLocalIsoString(parseDateInput(draftStart)),
        ended_at: toLocalIsoString(parseDateInput(draftEnd)),
      };

      if (editingSessionId) {
        const updated = await updateTimeSession(editingSessionId, {
          ...basePayload,
          task_id: hasValidTaskId ? taskId : null,
        });
        setSessions((prev) =>
          prev.map((session) =>
            session.id === editingSessionId ? updated : session,
          ),
        );
        setPendingEditOriginal(null);
        toast({
          title: t("timeControl.messages.sessionUpdated"),
          status: "success",
        });
      } else {
        const created = await createTimeSession({
          ...basePayload,
          task_id: hasValidTaskId ? taskId : null,
        });
        setSessions((prev) => [created, ...prev]);
        toast({
          title: t("timeControl.messages.sessionCreated"),
          status: "success",
        });
      }

      handleCloseModal(false);
    } catch (error: any) {
      toast({
        title: editingSessionId
          ? t("timeControl.messages.sessionUpdateErrorTitle")
          : t("timeControl.messages.sessionCreateErrorTitle"),
        description:
          error?.response?.data?.detail ??
          t("timeControl.messages.genericErrorFallback"),
        status: "error",
      });
    }
  };

  const handleCloseModal = (revertChanges = true) => {
    if (revertChanges && pendingEditOriginal) {
      setSessions((prev) =>
        prev.map((session) =>
          session.id === pendingEditOriginal.id ? pendingEditOriginal : session,
        ),
      );
      setPendingEditOriginal(null);
    }
    setEditingSessionId(null);
    setDraftDescription("");
    onClose();
  };

  const handleDeleteSession = async () => {
    if (!editingSessionId) return;
    try {
      await deleteTimeSession(editingSessionId);
      setSessions((prev) =>
        prev.filter((session) => session.id !== editingSessionId),
      );
      toast({
        title: t("timeControl.messages.sessionDeleted"),
        status: "success",
      });
      handleCloseModal(false);
    } catch (error: any) {
      toast({
        title: t("timeControl.messages.sessionDeleteErrorTitle"),
        description:
          error?.response?.data?.detail ??
          t("timeControl.messages.genericErrorFallback"),
        status: "error",
      });
    }
  };

  const openEditSession = (session: TimeSessionBlock) => {
    const start = new Date(session.started_at);
    const end = session.ended_at
      ? new Date(session.ended_at)
      : new Date(start.getTime() + MIN_SESSION_MINUTES * 60000);
    setEditingSessionId(session.id);
    setDraftTaskId(session.task_id ? String(session.task_id) : "");
    setDraftStart(formatDateInput(start));
    setDraftEnd(formatDateInput(end));
    setDraftDescription(session.description ?? "");
    setSelection(null);
    onOpen();
  };

  const handleQuickDelete = async (sessionId: number) => {
    if (!Number.isFinite(sessionId)) {
      toast({
        title: t("timeControl.messages.sessionDeleteErrorTitle"),
        description: t("timeControl.messages.genericErrorFallback"),
        status: "error",
      });
      return;
    }
    try {
      await deleteTimeSession(sessionId);
      setSessions((prev) => prev.filter((session) => session.id !== sessionId));
      toast({
        title: t("timeControl.messages.sessionDeleted"),
        status: "success",
      });
    } catch (error: any) {
      toast({
        title: t("timeControl.messages.sessionDeleteErrorTitle"),
        description: formatApiError(
          error,
          t("timeControl.messages.genericErrorFallback"),
        ),
        status: "error",
      });
    }
  };

  const handleTaskDragStart = (
    event: React.DragEvent<HTMLDivElement>,
    taskId: number,
  ) => {
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("text/plain", String(taskId));
    setDragTaskId(taskId);
  };

  const handleCalendarDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const rawId = event.dataTransfer.getData("text/plain");
    const taskId = Number(rawId);
    if (!taskId) return;

    const minutes = getMinutesFromClientY(event.clientY);
    const dayIndex = getDayIndexFromClientX(event.clientX);
    const startDate = minutesToDate(dayIndex, minutes);
    const endDate = minutesToDate(dayIndex, minutes + MIN_SESSION_MINUTES);

    try {
      const created = await createTimeSession({
        task_id: taskId,
        description: null,
        started_at: toLocalIsoString(startDate),
        ended_at: toLocalIsoString(endDate),
      });
      setSessions((prev) => [created, ...prev]);
      toast({
        title: t("timeControl.messages.sessionCreated"),
        status: "success",
      });
    } catch (error: any) {
      toast({
        title: t("timeControl.messages.sessionCreateErrorTitle"),
        description:
          error?.response?.data?.detail ??
          t("timeControl.messages.genericErrorFallback"),
        status: "error",
      });
    } finally {
      setDragTaskId(null);
    }
  };

  return {
    calendarRef,
    pendingDragOriginalRef,
    activeSession,
    taskIdInput,
    tasks,
    tasksError,
    subactivities,
    elapsedSeconds,
    isLoading,
    now,
    dragTaskId,
    setDragTaskId,
    isDraggingSession,
    setIsDraggingSession,
    recentTaskIds,
    sessions,
    sessionsError,
    isLoadingSessions,
    draftTaskId,
    setDraftTaskId,
    draftStart,
    setDraftStart,
    draftEnd,
    setDraftEnd,
    draftDescription,
    setDraftDescription,
    editingSessionId,
    selection,
    dragState,
    setDragState,
    totalWeekSeconds,
    formattedElapsed,
    recentTasks,
    taskById,
    subMap,
    isRunning,
    handleTaskSelectionChange,
    handleStart,
    handleQuickStart,
    handleStop,
    startSelection,
    handleSaveSession,
    handleCloseModal,
    handleDeleteSession,
    openEditSession,
    handleQuickDelete,
    handleTaskDragStart,
    handleCalendarDrop,
    getMinutesFromClientY,
  };
};
