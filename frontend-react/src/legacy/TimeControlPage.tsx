import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Badge,
  Box,
  Button,
  IconButton,
  Divider,
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
  Select,
  SimpleGrid,
  Stack,
  Text,
  VStack,
  useDisclosure,
  useToast,
  useColorModeValue,
} from "@chakra-ui/react";
import { keyframes } from "@emotion/react";
import { FaPlay, FaStop } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  addDays,
  formatSeconds,
  formatDayLabel,
  startOfWeek,
} from "@shared/utils/erp";
import { getApiErrorDetailFull } from "@shared/utils/api";
import { useTimeControlWeek } from "./hooks/useTimeControlWeek";
import { useTimeControlSessions } from "./hooks/useTimeControlSessions";

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
  TimeSessionBlock,
  updateTimeSession,
} from "@api/erpSessions";
import { updateErpTask } from "@api/erpManagement";
import { AppShell } from "@widgets/app-shell/AppShell";
import { PageHero } from "@widgets/app-shell/PageHero";
import { useCurrentUser } from "@hooks/useCurrentUser";
import { projectKeys } from "@entities/projects";

// Horas visibles en el calendario (0-23).
const HOURS = Array.from({ length: 24 }, (_, idx) => idx);
// Altura de cada bloque de hora en el calendario (px).
const HOUR_HEIGHT = 48;
// Duracion mínima por sesión de tiempo (min). Se usa para defaults en UI, no redondea el backend.
const MIN_SESSION_MINUTES = 1;
// Opciones de granularidad para ajustar/arrastrar sesiones (min).
const MINUTES_STEP_OPTIONS = [5, 15, 30, 60];

// Helpers de formato/parseo para inputs datetime-local y API.
const padTimePart = (value: number): string => String(value).padStart(2, "0");

const formatDateInput = (date: Date): string => {
  const year = date.getFullYear();
  const month = padTimePart(date.getMonth() + 1);
  const day = padTimePart(date.getDate());
  const hours = padTimePart(date.getHours());
  const minutes = padTimePart(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const parseDateInput = (value: string): Date => {
  if (!value) return new Date(NaN);
  const [datePart, timePart] = value.split("T");
  if (!datePart || !timePart) return new Date(NaN);
  const [year, month, day] = datePart.split("-").map(Number);
  const [hours, minutes] = timePart.split(":").map(Number);
  return new Date(year, month - 1, day, hours, minutes);
};

const toLocalIsoString = (date: Date): string => {
  const y = date.getFullYear();
  const mo = padTimePart(date.getMonth() + 1);
  const d = padTimePart(date.getDate());
  const h = padTimePart(date.getHours());
  const mi = padTimePart(date.getMinutes());
  const s = padTimePart(date.getSeconds());
  const offsetMinutes = date.getTimezoneOffset();
  const sign = offsetMinutes <= 0 ? "+" : "-";
  const offsetTotal = Math.abs(offsetMinutes);
  const oh = padTimePart(Math.floor(offsetTotal / 60));
  const om = padTimePart(offsetTotal % 60);
  return `${y}-${mo}-${d}T${h}:${mi}:${s}${sign}${oh}:${om}`;
};

// Limita un valor entre min y max.
const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

// Redondea minutos al paso configurado.
const roundToStep = (minutes: number, step: number): number =>
  Math.round(minutes / step) * step;

// Formatea minutos a HH:mm para ayudas visuales de arrastre.
const formatMinutesLabel = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
};



// Pantalla principal de control de tiempo con calendario interactivo.
export const TimeControlPage: React.FC = () => {
  // Utilidades globales (toasts y modal).
  const toast = useToast();
  const queryClient = useQueryClient();
  const { t, i18n } = useTranslation();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const calendarRef = useRef<HTMLDivElement | null>(null);
  const pendingDragOriginalRef = useRef<TimeSessionBlock | null>(null);

  // Estado de tracking actual y tareas disponibles.
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

  // Vista activa del modulo de tiempo.
  const [viewMode, setViewMode] = useState<"calendar" | "list" | "timesheet">(
    "calendar",
  );
  const {
    weekStart,
    setWeekStart,
    weekDays,
    weekRange,
    goToPrevWeek,
    goToNextWeek,
    goToCurrentWeek,
  } = useTimeControlWeek();
  const { sessions, setSessions, sessionsError, isLoadingSessions } =
    useTimeControlSessions({ weekRange });
  const [minutesStep, setMinutesStep] = useState<number>(15);

  // Estado del formulario modal para crear/editar sesiones.
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

  // Tokens de color para UI.
  const cardBg = useColorModeValue("white", "gray.700");
  const panelBg = useColorModeValue("gray.50", "gray.800");
  const subtleText = useColorModeValue("gray.500", "gray.300");
  const mutedText = useColorModeValue("gray.400", "gray.500");
  const accent = useColorModeValue("brand.500", "brand.300");
  const calendarHeaderActiveBg = useColorModeValue("green.600", "green.500");
  const calendarHeaderActiveText = useColorModeValue("white", "white");
  const calendarHeaderIdleBg = useColorModeValue("white", "gray.800");
  const calendarHeaderIdleText = useColorModeValue("green.600", "green.300");
  const activeSessionBg = useColorModeValue("blue.200", "blue.300");
  const activeSessionBorder = useColorModeValue("blue.400", "blue.500");
  const activeSessionText = useColorModeValue("blue.700", "blue.100");
  const fadeUp = keyframes`
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  `;

  const { data: currentUser } = useCurrentUser();
  const effectiveTenantId = currentUser?.is_super_admin === true
    ? undefined
    : (currentUser?.tenant_id ?? undefined);
  const projectsBaseKey = effectiveTenantId
    ? projectKeys.base(effectiveTenantId)
    : (["projects"] as const);
  const canCreateTimeReports =
    currentUser?.is_super_admin === true ||
    (currentUser?.permissions?.includes("can_create_time_reports") ?? false);

  // Flags y derivados del estado actual.
  const isRunning = Boolean(activeSession && activeSession.is_active);
  const currentUserId = currentUser?.id ?? null;
  // Convierte coordenadas Y en minutos dentro del calendario.
  const getMinutesFromClientY = (clientY: number): number => {
    const rect = calendarRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const y = clamp(clientY - rect.top, 0, rect.height);
    const minutes = (y / HOUR_HEIGHT) * 60;
    return clamp(roundToStep(minutes, minutesStep), 0, 24 * 60);
  };

  // Convierte coordenadas X en indice de dia de la semana.
  const getDayIndexFromClientX = (clientX: number): number => {
    const rect = calendarRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const columnWidth = rect.width / 8;
    const x = clamp(clientX - rect.left, 0, rect.width - 1);
    return clamp(Math.floor(x / columnWidth) - 1, 0, 6);
  };

  // Convierte un indice de dia y minutos en una fecha absoluta.
  const minutesToDate = (dayIndex: number, minutes: number): Date => {
    const base = new Date(weekDays[dayIndex]);
    base.setHours(0, 0, 0, 0);
    base.setMinutes(minutes);
    return base;
  };

  // Mapa rapido de tareas por id para renderizado.
  const taskById = useMemo(() => {
    const map = new Map<number, ErpTask>();
    tasks.forEach((task) => map.set(task.id, task));
    return map;
  }, [tasks]);

  // Mapa de subactividades por id para etiquetas.
  const subMap = useMemo(() => {
    const map = new Map<number, ErpSubActivity>();
    subactivities.forEach((sub) => map.set(sub.id, sub));
    return map;
  }, [subactivities]);

  // Total de segundos acumulados en la semana.
  const totalWeekSeconds = useMemo(() => {
    return sessions.reduce((acc, session) => acc + session.duration_seconds, 0);
  }, [sessions]);

  // Formato legible del tiempo activo.
  const formattedElapsed = useMemo(
    () => formatSeconds(elapsedSeconds),
    [elapsedSeconds],
  );
  // Ultimas tareas recientes para acceso rapido.
  const recentTasks = useMemo(() => {
    const scopedTasks = currentUserId
      ? tasks.filter((task) => task.assigned_to_id === currentUserId)
      : tasks;
    const taskById = new Map(scopedTasks.map((task) => [task.id, task]));
    const fromHistory = recentTaskIds
      .map((id) => taskById.get(id))
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

  // Carga la sesion activa al iniciar la pantalla.
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

  // Carga tareas del ERP para selects y tablero.
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
  }, []);

  // Mantiene el contador de tiempo activo sincronizado.
  useEffect(() => {
    if (!activeSession || !activeSession.is_active) {
      setElapsedSeconds(0);
      return;
    }

    const started = new Date(activeSession.started_at).getTime();

    const update = () => {
      const now = Date.now();
      const diffSeconds = Math.max(0, Math.floor((now - started) / 1000));
      setElapsedSeconds(diffSeconds);
    };

    update();
    const intervalId = window.setInterval(update, 1000);
    return () => window.clearInterval(intervalId);
  }, [activeSession]);

  // Actualiza el reloj de "ahora" para la linea temporal.
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(new Date());
    }, 60000);
    return () => window.clearInterval(intervalId);
  }, []);

  // Refresca la tarea seleccionada cuando hay sesion activa.
  useEffect(() => {
    if (activeSession?.task_id) {
      setTaskIdInput(String(activeSession.task_id));
    } else {
      setTaskIdInput("");
    }
  }, [activeSession]);


  // Gestiona el arrastre y resize de sesiones en el calendario.
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
        const endDate = minutesToDate(dragState.dayIndex, dragState.endMinutes);
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
  }, [dragState, selection, onOpen, taskIdInput, toast, weekDays, sessions]);

  // Guarda un historico corto de tareas seleccionadas por el usuario.
  const updateRecentTaskIds = (taskId: number) => {
    setRecentTaskIds((prev) => {
      const next = [taskId, ...prev.filter((id) => id !== taskId)].slice(0, 10);
      return next;
    });
  };

  // Seleccion de tarea desde el desplegable.
  // Sincroniza selector y lista de ultimas tareas.
  const handleTaskSelectionChange = (value: string) => {
    setTaskIdInput(value);
    const id = Number(value);
    if (!Number.isNaN(id) && id > 0) {
      updateRecentTaskIds(id);
    }
  };

  // Inicia tracking manual desde el selector de tarea.
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
        await updateErpTask(
          taskId,
          { status: "in_progress" },
          effectiveTenantId,
        );
      }
      setActiveSession(session);
      setTaskIdInput(taskId ? String(taskId) : "");
      goToCurrentWeek();
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

  // Inicia tracking rapido desde accesos directos.
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
      goToCurrentWeek();
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

  // Detiene la sesion activa de tracking.
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

  // Inicia la seleccion para crear una nueva sesion en el calendario.
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

  // Guarda una sesion nueva o edita una existente.
  const handleSaveSession = async () => {
    const taskId = draftTaskId ? Number(draftTaskId) : null;
    const hasValidTaskId = taskId !== null && Number.isFinite(taskId);
    if (!editingSessionId && !hasValidTaskId) {
      toast({ title: t("timeControl.messages.selectTask"), status: "warning" });
      return;
    }
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
          task_id: taskId as number,
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

  // Limpia estado del modal de sesion.
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

  // Elimina una sesion desde el modal.
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

  // Abre el modal con los datos de una sesion existente.
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

  // Elimina rapidamente una sesion desde la vista calendario.
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
        description: getApiErrorDetailFull(
          error,
          t("timeControl.messages.genericErrorFallback"),
        ),
        status: "error",
      });
    }
  };

  // Arrastre de tareas recientes para crear una sesion en el calendario.
  // Arrastre desde accesos rapidos hacia el calendario.
  const handleTaskDragStart = (
    event: React.DragEvent<HTMLDivElement>,
    taskId: number,
  ) => {
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("text/plain", String(taskId));
    setDragTaskId(taskId);
  };

  // Drop de una tarea sobre el calendario para crear sesion.
  // Crea sesion al soltar una tarea sobre el calendario.
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

  // Render principal de la pagina.
  return (
    <AppShell>
      <Box animation={`${fadeUp} 0.6s ease-out`} mb={8}>
        <PageHero
          eyebrow={t("timeControl.header.eyebrow")}
          title={t("timeControl.header.title")}
        />
      </Box>

      <Box borderWidth="1px" borderRadius="xl" p={4} bg={panelBg} mb={6}>
        <SimpleGrid
          columns={{ base: 1, lg: 3 }}
          spacing={4}
          alignItems="center"
        >
          <Box>
            <Text fontSize="xs" color={subtleText}>
              {t("timeControl.stats.totalWeeklyHours")}
            </Text>
            <Text fontSize="xl" fontWeight="semibold">
              {formatSeconds(totalWeekSeconds)}
            </Text>
          </Box>
          <FormControl>
            {/* Seleccion de la tarea para trabajar. */}
            <FormLabel>{t("timeControl.controls.currentTask")}</FormLabel>
            <Select
              value={taskIdInput}
              onChange={(e) => handleTaskSelectionChange(e.target.value)}
              placeholder={t("timeControl.controls.selectTask")}
              isDisabled={isLoading}
            >
              <option value="">{t("timeControl.labels.noTask")}</option>
              {tasks.map((task) => (
                <option key={task.id} value={String(task.id)}>
                  #{task.id} - {task.title}
                </option>
              ))}
            </Select>
            {tasksError && (
              <Text fontSize="xs" color="red.400" mt={2}>
                {tasksError}
              </Text>
            )}
          </FormControl>
          <HStack
            spacing={4}
            align="center"
            justify="flex-end"
            justifySelf="end"
            w="100%"
            flexWrap="wrap"
          >
            <Box textAlign={{ base: "left", lg: "right" }}>
              <Badge colorScheme={isRunning ? "green" : "gray"}>
                {isRunning
                  ? t("timeControl.status.inProgress")
                  : t("timeControl.status.idle")}
              </Badge>
              {isRunning && (
                <Text fontSize="2xl" fontFamily="mono" mt={1}>
                  {formattedElapsed}
                </Text>
              )}
            </Box>
            <HStack spacing={3}>
              {/* Boton de inicio: icono redondo con el mismo tamano que detener. */}
              <IconButton
                aria-label={t("timeControl.actions.start")}
                icon={<FaPlay />}
                colorScheme="green"
                isRound
                size="lg"
                w="48px"
                h="48px"
                onClick={handleStart}
                isLoading={isLoading && !isRunning}
                isDisabled={isRunning}
              />
              {/* Boton de detener: icono redondo, mismo tamano y conectado al handler. */}
              <IconButton
                aria-label={t("timeControl.actions.stop")}
                icon={<FaStop />}
                colorScheme="red"
                variant="outline"
                isRound
                size="lg"
                w="48px"
                h="48px"
                onClick={handleStop}
                isLoading={isLoading && isRunning}
                isDisabled={!isRunning}
              />
            </HStack>
          </HStack>
        </SimpleGrid>
      </Box>

      <HStack spacing={3} mb={4} align="center">
        <Button
          variant={viewMode === "calendar" ? "solid" : "outline"}
          onClick={() => setViewMode("calendar")}
        >
          {t("timeControl.views.calendar")}
        </Button>
        <Button
          variant={viewMode === "list" ? "solid" : "outline"}
          onClick={() => setViewMode("list")}
        >
          {t("timeControl.views.list")}
        </Button>
        <Button
          variant={viewMode === "timesheet" ? "solid" : "outline"}
          onClick={() => setViewMode("timesheet")}
        >
          {t("timeControl.views.timesheet")}
        </Button>
        {canCreateTimeReports && (
          <Button as={Link} to="/time-report" variant="outline">
            {t("timeControl.actions.timeReport")}
          </Button>
        )}
        <HStack marginLeft="auto" spacing={4} align="center">
          <HStack spacing={2}>
            <Text fontSize="sm" color={subtleText}>
              {t("timeControl.controls.adjustment")}
            </Text>
            <Select
              size="sm"
              value={minutesStep}
              onChange={(e) => setMinutesStep(Number(e.target.value))}
            >
              {MINUTES_STEP_OPTIONS.map((step) => (
                <option key={step} value={step}>
                  {step} min
                </option>
              ))}
            </Select>
          </HStack>
          <HStack spacing={2}>
            <Button
              variant="ghost"
              onClick={goToPrevWeek}
            >
              {t("timeControl.controls.prevWeek")}
            </Button>
            <Button
              variant="ghost"
              onClick={goToCurrentWeek}
            >
              {t("timeControl.controls.today")}
            </Button>
            <Button
              variant="ghost"
              onClick={goToNextWeek}
            >
              {t("timeControl.controls.nextWeek")}
            </Button>
          </HStack>
        </HStack>
      </HStack>

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
                  onDragStart={(event) => handleTaskDragStart(event, task.id)}
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
                      colorScheme="green"
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
          onDrop={handleCalendarDrop}
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
                      isToday
                        ? calendarHeaderActiveText
                        : calendarHeaderIdleText
                    }
                  >
                    {formatDayLabel(day, i18n.language)}
                  </Text>
                </Box>
              );
            })}
          </SimpleGrid>
          <Box position="relative" ref={calendarRef}>
            {HOURS.map((hour) => (
              <SimpleGrid
                key={hour}
                columns={8}
                gap={0}
                minH={`${HOUR_HEIGHT}px`}
              >
                <Box
                  borderRightWidth="1px"
                  borderBottomWidth="1px"
                  p={2}
                  bg={panelBg}
                >
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
            {weekDays.some(
              (day) => day.toDateString() === now.toDateString(),
            ) && (
              <Box
                position="absolute"
                left="0"
                top={`${
                  ((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR_HEIGHT
                }px`}
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
                  {now.toLocaleTimeString(i18n.language, {
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
                  height={`${
                    ((dragState.endMinutes - dragState.startMinutes) / 60) *
                    HOUR_HEIGHT
                  }px`}
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
                top={`${
                  (Math.min(selection.startMinutes, selection.endMinutes) /
                    60) *
                  HOUR_HEIGHT
                }px`}
                width="12.5%"
                height={`${
                  (Math.max(
                    MIN_SESSION_MINUTES,
                    Math.abs(selection.endMinutes - selection.startMinutes),
                  ) /
                    60) *
                  HOUR_HEIGHT
                }px`}
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

              // Para sesiones activas, la altura crece dinámicamente basada en elapsedSeconds
              let height: number;
              if (
                session.is_active &&
                activeSession &&
                activeSession.id === session.id
              ) {
                // Mínimo 8px al iniciar, crece con el tiempo transcurrido
                // 1 minuto = 48px / 60 = 0.8px por segundo (aprox 1px cada 1.25 segundos)
                // 1 hora = 48px
                const minHeightForActive = 8; // 8px mínimo para que sea visible
                const elapsedHeight = (elapsedSeconds / 3600) * HOUR_HEIGHT; // Convierte segundos a horas
                height = Math.max(minHeightForActive, elapsedHeight);
              } else {
                // Para sesiones pasadas, usa la lógica original
                height = Math.max(
                  HOUR_HEIGHT * (MIN_SESSION_MINUTES / 60),
                  ((end.getTime() - start.getTime()) / 3600000) * HOUR_HEIGHT,
                );
              }

              const task = session.task_id
                ? taskById.get(session.task_id)
                : undefined;
              return (
                <Box
                  key={`${session.id}-${session.started_at}`}
                  position="absolute"
                  left={`calc(${(dayIndex + 1) * 12.5}% )`}
                  top={top}
                  width="12.5%"
                  height={`${height}px`}
                  bg={session.is_active ? activeSessionBg : "green.100"}
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
                  <HStack
                    spacing={2}
                    justify="space-between"
                    align="start"
                    mb={1}
                  >
                    <HStack spacing={2} align="start">
                      <Text
                        fontSize="xs"
                        fontWeight="semibold"
                        noOfLines={1}
                        mt={!session.is_active ? 2 : 0}
                      >
                        {task
                          ? task.title
                          : session.task_id
                            ? t("timeControl.labels.taskId", {
                                id: session.task_id,
                              })
                            : t("timeControl.labels.noTask")}
                      </Text>
                      {session.is_active &&
                        activeSession &&
                        activeSession.id === session.id && (
                          <Text
                            fontSize="xs"
                            fontWeight="semibold"
                            color={activeSessionText}
                            mt={!session.is_active ? 2 : 0}
                          >
                            {formattedElapsed}
                          </Text>
                        )}
                    </HStack>
                  </HStack>
                  <Text fontSize="xs" color={subtleText}>
                    {start.toLocaleTimeString(i18n.language, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    -{" "}
                    {end.toLocaleTimeString(i18n.language, {
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
          {isLoadingSessions && (
            <Text>{t("timeControl.sessions.loading")}</Text>
          )}
          {!isLoadingSessions &&
            sessions.map((session) => {
              const task = session.task_id
                ? taskById.get(session.task_id)
                : undefined;
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
                            ? t("timeControl.labels.taskId", {
                                id: session.task_id,
                              })
                            : t("timeControl.labels.noTask")}
                      </Text>
                      <Text fontSize="sm" color={subtleText}>
                        {new Date(session.started_at).toLocaleString(
                          i18n.language,
                        )}
                      </Text>
                      {session.description && (
                        <Text fontSize="xs" color={mutedText} mt={1}>
                          {session.description}
                        </Text>
                      )}
                    </Box>
                    <VStack align="flex-end" spacing={2}>
                      <Badge colorScheme="green">
                        {formatSeconds(session.duration_seconds)}
                      </Badge>
                      <HStack>
                        {/* Acción coherente por fila: si la tarea está activa, muestra stop; si no, play. */}
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
                            colorScheme="green"
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
                new Date(session.started_at).toDateString() ===
                day.toDateString(),
            );
            const totalSeconds = daySessions.reduce(
              (acc, session) => acc + session.duration_seconds,
              0,
            );
            return (
              <Box
                key={day.toISOString()}
                borderWidth="1px"
                borderRadius="xl"
                p={4}
                bg={cardBg}
              >
                <HStack justify="space-between">
                  <Text fontWeight="semibold">
                    {formatDayLabel(day, i18n.language)}
                  </Text>
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
                    const task = session.task_id
                      ? taskById.get(session.task_id)
                      : undefined;
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
                                ? t("timeControl.labels.taskId", {
                                    id: session.task_id,
                                  })
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
                          {/* Acción coherente por fila: si la tarea está activa, muestra stop; si no, play. */}
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
                              colorScheme="green"
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

      <Modal isOpen={isOpen} onClose={handleCloseModal} isCentered size="md">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>
            {editingSessionId
              ? t("timeControl.modal.editTitle")
              : t("timeControl.modal.createTitle")}
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Stack spacing={3}>
              <FormControl>
                <FormLabel>{t("timeControl.fields.task")}</FormLabel>
                <Select
                  value={draftTaskId}
                  onChange={(e) => setDraftTaskId(e.target.value)}
                  placeholder={t("timeControl.controls.selectTask")}
                >
                  <option value="">{t("timeControl.labels.noTask")}</option>
                  {tasks.map((task) => (
                    <option key={task.id} value={String(task.id)}>
                      #{task.id} - {task.title}
                    </option>
                  ))}
                </Select>
              </FormControl>
              <FormControl>
                <FormLabel>{t("timeControl.fields.description")}</FormLabel>
                <Input
                  value={draftDescription}
                  onChange={(e) => setDraftDescription(e.target.value)}
                  placeholder={t("timeControl.fields.optional")}
                />
              </FormControl>
              <FormControl>
                <FormLabel>{t("timeControl.fields.start")}</FormLabel>
                <Input
                  type="datetime-local"
                  value={draftStart}
                  onChange={(e) => setDraftStart(e.target.value)}
                />
              </FormControl>
              <FormControl>
                <FormLabel>{t("timeControl.fields.end")}</FormLabel>
                <Input
                  type="datetime-local"
                  value={draftEnd}
                  onChange={(e) => setDraftEnd(e.target.value)}
                />
              </FormControl>
            </Stack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={() => handleCloseModal()}>
              {t("common.cancel")}
            </Button>
            {editingSessionId && (
              <Button
                colorScheme="red"
                variant="outline"
                mr={3}
                onClick={handleDeleteSession}
              >
                {t("timeControl.actions.delete")}
              </Button>
            )}
            <Button colorScheme="green" onClick={handleSaveSession}>
              {editingSessionId
                ? t("timeControl.actions.update")
                : t("common.save")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </AppShell>
  );
};
