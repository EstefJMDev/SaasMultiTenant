import React from "react";
import {
  Badge,
  Box,
  Button,
  HStack,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  Spinner,
  Text,
  VStack,
  useColorModeValue,
} from "@chakra-ui/react";
import { useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
} from "@api/notifications";
import { useCurrentUser } from "@hooks/useCurrentUser";
import { setContractDeepLink } from "../contracts/contractDeepLink";

const BellIcon: React.FC<{ size?: number }> = ({ size = 20 }) => (
  <Box
    as="span"
    display="inline-flex"
    alignItems="center"
    justifyContent="center"
  >
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M12 22a2 2 0 0 0 2-2H10a2 2 0 0 0 2 2Zm6-6V11a6 6 0 1 0-12 0v5L4 18v1h16v-1l-2-2Z"
        fill="currentColor"
      />
    </svg>
  </Box>
);

export const NotificationsBell: React.FC = () => {
  const queryClient = useQueryClient();
  const router = useRouter();
  const badgeBg = useColorModeValue("red.500", "red.300");
  const { data: currentUser } = useCurrentUser();

  const isUnauthorizedError = (error: unknown): boolean =>
    Boolean(
      error &&
        typeof error === "object" &&
        "response" in error &&
        (error as { response?: { status?: number } }).response?.status === 401,
    );

  const {
    data,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["notifications", { onlyUnread: false }],
    queryFn: () => fetchNotifications(false, 10),
    enabled: Boolean(currentUser),
    retry: false,
    refetchInterval: (query) => {
      if (!currentUser) return false;
      if (isUnauthorizedError(query.state.error)) return false;
      return 30000;
    },
  });

  const unreadCount = data?.unread_total ?? 0;

  const markReadMutation = useMutation({
    mutationFn: (id: number) => markNotificationRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const resolveNotificationTarget = (notification: NotificationItem): string => {
    const meta = notification.meta ?? null;

    // Preferimos meta estructurado (nuevo flujo) sobre reference textual (legado).
    if (meta && typeof meta === "object") {
      if (meta.entity === "comparative" && meta.contract_id) {
        // Eventos de flujo de aprobación → página de aprobaciones del comparativo.
        // Incluye aprobaciones manuales, automáticas y rechazos: en todos
        // los casos el usuario quiere ver el panel de aprobaciones.
        if (
          meta.event === "COMPARATIVE_PENDING_APPROVAL" ||
          meta.event === "COMPARATIVE_APPROVED" ||
          meta.event === "COMPARATIVE_AUTO_APPROVED" ||
          meta.event === "COMPARATIVE_REJECTED"
        ) {
          return `/comparatives/${meta.contract_id}/aprobaciones`;
        }
        // Resto de eventos: vista solo-lectura del comparativo.
        return `/comparatives/${meta.contract_id}/info`;
      }
      if (meta.entity === "contract" && meta.contract_id) {
        const parts = [`contractId=${meta.contract_id}`];
        parts.push(`view=${meta.view || "contrato-form"}`);
        parts.push("mode=ver");
        if (meta.doc) parts.push(`doc=${meta.doc}`);
        return `/contracts?${parts.join("&")}`;
      }
      if (meta.entity === "ticket" && meta.ticket_id) {
        return `/support?ticketId=${meta.ticket_id}`;
      }
      if (meta.entity === "task" && meta.task_id) {
        return `/tasks?taskId=${meta.task_id}`;
      }
      if (meta.entity === "project" && meta.project_id) {
        const docQs = meta.document_id ? `?documentId=${meta.document_id}` : "";
        return `/works/${meta.project_id}/documents${docQs}`;
      }
    }

    // Fallback: parseo del campo reference legado.
    const ref = (notification.reference || "").trim();
    const viewMatch = ref.match(/(?:^|[?&,\s])view=([a-z0-9_-]+)/i);
    const view = viewMatch?.[1];

    const ticketMatch = ref.match(/(?:^|[?&,\s])ticket_id=(\d+)/i);
    if (ticketMatch?.[1]) {
      return `/support?ticketId=${ticketMatch[1]}`;
    }

    const docMatch = ref.match(/(?:^|[?&,\s])doc=([A-Z_]+)/);
    const doc = docMatch?.[1];

    const contractMatch = ref.match(/(?:^|[?&,\s])contract_id=(\d+)/i);
    if (contractMatch?.[1]) {
      const id = contractMatch[1];
      if (view === "comparativo-review") {
        return `/comparatives/${id}/info`;
      }
      const parts = [`contractId=${id}`];
      parts.push(`view=${view || "contrato-form"}`);
      parts.push("mode=ver");
      if (doc) parts.push(`doc=${doc}`);
      return `/contracts?${parts.join("&")}`;
    }

    const comparativeMatch = ref.match(/(?:^|[?&,\s])comparative_id=(\d+)/i);
    if (comparativeMatch?.[1]) {
      return `/comparatives/${comparativeMatch[1]}/info`;
    }

    const projectMatch = ref.match(/(?:^|[?&,\s])project_id=(\d+)/i);
    const documentMatch = ref.match(/(?:^|[?&,\s])document_id=(\d+)/i);
    if (projectMatch?.[1]) {
      const docQs = documentMatch?.[1] ? `?documentId=${documentMatch[1]}` : "";
      return `/works/${projectMatch[1]}/documents${docQs}`;
    }

    const taskMatch = ref.match(/(?:^|[?&,\s])task_id=(\d+)/i);
    if (taskMatch?.[1]) {
      return `/tasks?taskId=${taskMatch[1]}`;
    }

    if (notification.type.startsWith("ticket_")) {
      return "/support";
    }

    return "/dashboard";
  };

  const handleNotificationClick = async (notification: NotificationItem) => {
    try {
      await markReadMutation.mutateAsync(notification.id);
    } finally {
      const target = resolveNotificationTarget(notification);
      // Caso especial: contratos no tienen ruta /contracts/$id, el contrato
      // "abierto" es estado interno de ContractsModule. Pasamos el deep link
      // via store global (CustomEvent) y navegamos al listado.
      const meta = notification.meta ?? null;
      if (
        meta &&
        typeof meta === "object" &&
        meta.entity === "contract" &&
        meta.contract_id
      ) {
        setContractDeepLink({
          contractId: meta.contract_id,
          view: meta.view || "contrato-form",
          mode: (meta.mode as "ver" | "editar") || "ver",
          doc: meta.doc,
        });
        void router.navigate({ to: "/contracts" });
        return;
      }
      // Usamos history.push porque target puede contener segmentos dinámicos
      // (p.ej. /comparatives/219/aprobaciones) y router.navigate({to: pathname})
      // requiere matchear la ruta tipada con params. history.push respeta el
      // path literal y deja que el router resuelva contra su tabla.
      router.history.push(target);
    }
  };

  return (
    <Menu>
      <MenuButton
        as={Button}
        variant="ghost"
        size="sm"
        px={2}
        borderRadius="full"
        aria-label="Abrir notificaciones"
      >
        <Box position="relative">
          <BellIcon />
          {unreadCount > 0 && (
            <Badge
              position="absolute"
              top="-8px"
              right="-12px"
              borderRadius="full"
              px={1.5}
              minW="18px"
              height="18px"
              display="flex"
              alignItems="center"
              justifyContent="center"
              fontSize="0.7rem"
              fontWeight="bold"
              lineHeight="1"
              bg={badgeBg}
              color="white"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </Badge>
          )}
        </Box>
      </MenuButton>
      <MenuList minW="420px" maxW="480px">
        <HStack justify="space-between" px={4} py={3}>
          <HStack spacing={2}>
            <Text fontSize="md" fontWeight="semibold">
              Notificaciones
            </Text>
            {unreadCount > 0 && (
              <Badge colorScheme="red" borderRadius="full" px={2}>
                {unreadCount}
              </Badge>
            )}
          </HStack>
          {unreadCount > 0 && (
            <Text
              as="button"
              fontSize="xs"
              color="brand.400"
              fontWeight="medium"
              onClick={(e) => {
                e.stopPropagation();
                markAllReadMutation.mutate();
              }}
              isDisabled={markAllReadMutation.isPending}
              opacity={markAllReadMutation.isPending ? 0.5 : 1}
              cursor={markAllReadMutation.isPending ? "not-allowed" : "pointer"}
              _hover={{ textDecoration: "underline" }}
            >
              {markAllReadMutation.isPending
                ? "Marcando…"
                : "Marcar todas como leídas"}
            </Text>
          )}
        </HStack>
        <Box borderTopWidth="1px" />
        {isLoading && (
          <HStack px={4} py={3}>
            <Spinner size="sm" />
            <Text fontSize="sm">Cargando notificaciones…</Text>
          </HStack>
        )}
        {isError && !isLoading && (
          <Box px={4} py={3}>
            <Text fontSize="sm" color="red.400">
              No se han podido cargar las notificaciones.
            </Text>
          </Box>
        )}
        {!isLoading && !isError && (data?.items.length ?? 0) === 0 && (
          <Box px={4} py={3}>
            <Text fontSize="sm" color="gray.500">
              No tienes notificaciones por ahora.
            </Text>
          </Box>
        )}
        {!isLoading && !isError && (data?.items.length ?? 0) > 0 && (
          <VStack align="stretch" spacing={1} maxH="520px" overflowY="auto">
            {data!.items.map((n) => (
              <MenuItem
                key={n.id}
                onClick={() => {
                  void handleNotificationClick(n);
                }}
                whiteSpace="normal"
                py={2}
              >
                <VStack align="stretch" spacing={0}>
                  <HStack justify="space-between">
                    <Text
                      fontSize="sm"
                      fontWeight={n.is_read ? "normal" : "semibold"}
                    >
                      {n.title}
                    </Text>
                    {!n.is_read && (
                      <Badge colorScheme="brand" variant="subtle">
                        Nuevo
                      </Badge>
                    )}
                  </HStack>
                  {n.body && (
                    <Text fontSize="xs" color="gray.500" whiteSpace="pre-line">
                      {n.body}
                    </Text>
                  )}
                </VStack>
              </MenuItem>
            ))}
          </VStack>
        )}
      </MenuList>
    </Menu>
  );
};

