import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  HStack,
  Input,
  Text,
  useColorModeValue,
  useToast,
} from "@chakra-ui/react";

import {
  getActiveTimeSession,
  startTimeSession,
  stopTimeSession,
  TimeSession,
} from "@api/erpTimeTracking";
import { updateErpTask } from "@api/erpManagement";
import { useCurrentUser } from "@hooks/useCurrentUser";
import { useQueryClient } from "@tanstack/react-query";
import { projectKeys } from "@entities/projects";

/**
 * Widget flotante de tracking de tiempo (play/stop) contra el ERP.
 *
 * En esta primera versión:
 * - Se introduce manualmente el ID de la tarea.
 * - Muestra sesión activa (si existe) y contador en segundos.
 */
export const TimeTrackingWidget: React.FC = () => {
  const [activeSession, setActiveSession] = useState<TimeSession | null>(null);
  const [taskIdInput, setTaskIdInput] = useState<string>("");
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data: currentUser } = useCurrentUser();
  const effectiveTenantId = currentUser?.is_super_admin === true
    ? undefined
    : (currentUser?.tenant_id ?? undefined);
  const projectsBaseKey = effectiveTenantId
    ? projectKeys.base(effectiveTenantId)
    : (["projects"] as const);

  const bg = useColorModeValue("white", "gray.800");
  const border = useColorModeValue("gray.200", "gray.700");

  const formattedElapsed = useMemo(() => {
    const total = elapsedSeconds;
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    return [hours, minutes, seconds]
      .map((v) => v.toString().padStart(2, "0"))
      .join(":");
  }, [elapsedSeconds]);

  // Cargar sesión activa al montar.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const session = await getActiveTimeSession(effectiveTenantId);
        if (!cancelled) {
          setActiveSession(session);
        }
      } catch (error: any) {
        // En desarrollo mostramos notificación para entender errores.
        toast({
          title: "Error al cargar sesión de tiempo",
          description:
            error?.response?.data?.detail ??
            "No se pudo cargar el estado de tracking.",
          status: "error",
          duration: 4000,
          isClosable: true,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [toast]);

  // Cronómetro basado en la sesión activa.
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

    return () => {
      window.clearInterval(intervalId);
    };
  }, [activeSession]);

  const handleStart = async () => {
    const taskId = Number(taskIdInput);
    if (!taskId || Number.isNaN(taskId)) {
      toast({
        title: "ID de tarea inválido",
        description: "Introduce un ID numérico de tarea del ERP.",
        status: "warning",
      });
      return;
    }

    try {
      setIsLoading(true);
      const session = await startTimeSession(taskId, effectiveTenantId);
      // Marcar la tarea como "in_progress" al iniciar el tracking.
      await updateErpTask(taskId, { status: "in_progress" }, effectiveTenantId);
      queryClient.invalidateQueries({ queryKey: projectsBaseKey });
      setActiveSession(session);
      toast({
        title: "Tracking iniciado",
        description: `Sesión de tiempo iniciada para la tarea ${taskId}.`,
        status: "success",
      });
    } catch (error: any) {
      toast({
        title: "Error al iniciar tracking",
        description:
          error?.response?.data?.detail ??
          "No se ha podido iniciar la sesión de tiempo (revisa el ERP y credenciales).",
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
      if (session?.task_id) {
        await updateErpTask(
          session.task_id,
          { status: "pending" },
          effectiveTenantId,
        );
        queryClient.invalidateQueries({ queryKey: projectsBaseKey });
      } else if (activeSession?.task_id) {
        await updateErpTask(
          activeSession.task_id,
          { status: "pending" },
          effectiveTenantId,
        );
        queryClient.invalidateQueries({ queryKey: projectsBaseKey });
      }
      toast({
        title: "Tracking detenido",
        description: `Sesión finalizada. Duración: ${formattedElapsed}.`,
        status: "info",
      });
    } catch (error: any) {
      toast({
        title: "Error al detener tracking",
        description:
          error?.response?.data?.detail ??
          "No se ha podido detener la sesión de tiempo activa.",
        status: "error",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Box
      position="fixed"
      bottom={4}
      right={4}
      borderWidth="1px"
      borderRadius="md"
      bg={bg}
      borderColor={border}
      boxShadow="md"
      px={4}
      py={3}
      minW="260px"
      zIndex={1400}
    >
      <Text fontSize="sm" fontWeight="semibold" mb={1}>
        Control de tiempo (ERP)
      </Text>
      {activeSession && activeSession.is_active ? (
        <>
          <Text fontSize="xs" color="gray.500" mb={1}>
            Tarea ID: {activeSession.task_id}
          </Text>
          <Text fontSize="lg" fontFamily="mono" mb={2}>
            {formattedElapsed}
          </Text>
          <Button
            size="sm"
            colorScheme="red"
            onClick={handleStop}
            isLoading={isLoading}
          >
            Stop
          </Button>
        </>
      ) : (
        <>
          <Text fontSize="xs" color="gray.500" mb={1}>
            Introduce el ID de la tarea del ERP para empezar a contar.
          </Text>
          <HStack spacing={2}>
            <Input
              size="sm"
              placeholder="ID tarea"
              value={taskIdInput}
              onChange={(e) => setTaskIdInput(e.target.value)}
            />
            <Button
              size="sm"
              colorScheme="brand"
              onClick={handleStart}
              isLoading={isLoading}
            >
              Play
            </Button>
          </HStack>
        </>
      )}
    </Box>
  );
};

