import React, { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Box,
  Button,
  FormControl,
  FormLabel,
  Heading,
  HStack,
  Input,
  Grid,
  GridItem,
  Select,
  Stack,
  Text,
  Textarea,
  useColorModeValue,
  useToast,
  Switch,
} from "@chakra-ui/react";
import { keyframes } from "@emotion/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import {
  fetchAllTenants,
  fetchUsersByTenant,
  type TenantOption,
  type TenantUserSummary,
} from "@api/users";
import { useCurrentUser } from "@hooks/useCurrentUser";
import { useEffectiveTenantId } from "@hooks/useEffectiveTenantId";
import {
  Ticket,
  TicketPriority,
  TicketStatus,
  TicketMessage,
  addTicketMessage,
  closeTicket,
  createTicket,
  fetchTicketMessages,
  fetchTickets,
  reopenTicket,
  updateTicket,
  assignTicket,
} from "@api/tickets";
import { formatDateTimeDisplay } from "@shared/utils/erp";
import { onMutationError } from "@shared/utils/mutationError";
import { SupportTicketsFiltersCard } from "./components/SupportTicketsFiltersCard";
import { SupportTicketsHeader } from "./components/SupportTicketsHeader";
import { SupportTicketsTable } from "./components/SupportTicketsTable";


// Pantalla de soporte: listado de tickets y conversacion.
export const SupportTicketsPanel: React.FC = () => {
  // Utilidades y estilos base.
  const toast = useToast();
  const router = useRouter();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const cardBg = useColorModeValue("white", "gray.700");
  const tableHeadBg = useColorModeValue("gray.50", "gray.800");
  const subtleText = useColorModeValue("gray.600", "gray.300");
  const rowHoverBg = useColorModeValue("gray.50", "gray.600");
  const rowActiveBg = useColorModeValue("gray.100", "gray.600");
  const fadeUp = keyframes`
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  `;

  const [statusFilter, setStatusFilter] = useState<"" | TicketStatus>("");
  const [priorityFilter, setPriorityFilter] = useState<"" | TicketPriority>("");
  const [mineOnly, setMineOnly] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);

  const [newSubject, setNewSubject] = useState("");
  const [newDescription, setNewDescription] = useState("");

  const [replyBody, setReplyBody] = useState("");
  const [replyInternal, setReplyInternal] = useState(false);
  const [assigneeId, setAssigneeId] = useState<number | "">("");

  useEffect(() => {
    const search = router.state.location.searchStr ?? "";
    const params = new URLSearchParams(search);
    const ticketIdRaw = params.get("ticketId");
    const ticketId = ticketIdRaw ? Number(ticketIdRaw) : NaN;
    if (Number.isFinite(ticketId) && ticketId > 0) {
      setSelectedTicketId(ticketId);
    }
  }, [router.state.location.searchStr]);

  const statusOptions = useMemo<Array<{ value: TicketStatus; label: string }>>(
    () => [
      { value: "open", label: t("support.status.open") },
      { value: "in_progress", label: t("support.status.inProgress") },
      { value: "resolved", label: t("support.status.resolved") },
      { value: "closed", label: t("support.status.closed") },
    ],
    [t]
  );

  const priorityOptions = useMemo<
    Array<{ value: TicketPriority; label: string }>
  >(
    () => [
      { value: "low", label: t("support.priority.low") },
      { value: "medium", label: t("support.priority.medium") },
      { value: "high", label: t("support.priority.high") },
      { value: "critical", label: t("support.priority.critical") },
    ],
    [t]
  );

  // Datos del usuario actual
  const { data: currentUser } = useCurrentUser();
  const isSuperAdmin =
    currentUser?.is_super_admin === true ||
    currentUser?.email === "dios@cortecelestial.god";
  const canManageTickets =
    isSuperAdmin || (currentUser?.permissions?.includes("tickets:manage") ?? false);
  const { tenantId } = useEffectiveTenantId();

  // Carga de tickets segun filtros.
  const ticketsQuery = useQuery<Ticket[]>({
    queryKey: [
      "tickets",
      tenantId ?? "all",
      { statusFilter, priorityFilter, mineOnly },
    ],
    queryFn: () =>
      fetchTickets({
        tenant_id: isSuperAdmin ? tenantId ?? undefined : undefined,
        status: statusFilter || undefined,
        priority: priorityFilter || undefined,
        mine_only: mineOnly || undefined,
        limit: 50,
        offset: 0,
      }),
    enabled: isSuperAdmin ? tenantId !== null : true,
  });

  const selectedTicket = useMemo(
    () => ticketsQuery.data?.find((t) => t.id === selectedTicketId) ?? null,
    [ticketsQuery.data, selectedTicketId],
  );

  // Carga de mensajes para el ticket seleccionado.
  const messagesQuery = useQuery<TicketMessage[]>({
    queryKey: ["ticket-messages", selectedTicketId],
    queryFn: () => fetchTicketMessages(selectedTicketId as number),
    enabled: selectedTicketId !== null,
  });

  const assigneesQuery = useQuery<TenantUserSummary[]>({
    queryKey: ["ticket-assignees", selectedTicket?.tenant_id],
    queryFn: () => fetchUsersByTenant(selectedTicket!.tenant_id),
    enabled: Boolean(selectedTicket?.tenant_id),
  });

  const tenantsQuery = useQuery<TenantOption[]>({
    queryKey: ["all-tenants"],
    queryFn: fetchAllTenants,
    enabled: isSuperAdmin,
  });

  // Mutacion de creacion de ticket.
  const createMutation = useMutation({
    mutationFn: () =>
      createTicket({
        subject: newSubject,
        description: newDescription,
      }),
    onSuccess: (ticket) => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      toast({
        title: t("support.messages.createSuccessTitle"),
        description: t("support.messages.createSuccessDesc"),
        status: "success",
      });
      setNewSubject("");
      setNewDescription("");
      setSelectedTicketId(ticket.id);
    },
    onError: onMutationError(toast, t("support.messages.createErrorTitle"), t("support.messages.createErrorFallback")),
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { priority?: TicketPriority; status?: TicketStatus }) =>
      updateTicket(selectedTicketId as number, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
  });

  // Mutacion de envio de mensajes.
  const replyMutation = useMutation({
    mutationFn: () =>
      addTicketMessage({
        ticketId: selectedTicketId as number,
        body: replyBody,
        is_internal: replyInternal,
      }),
    onSuccess: () => {
      if (selectedTicketId) {
        queryClient.invalidateQueries({
          queryKey: ["ticket-messages", selectedTicketId],
        });
        queryClient.invalidateQueries({ queryKey: ["tickets"] });
      }
      setReplyBody("");
      setReplyInternal(false);
    },
    onError: onMutationError(toast, t("support.messages.replyErrorTitle"), t("support.messages.replyErrorFallback")),
  });

  // Mutacion para cerrar ticket.
  const closeMutation = useMutation({
    mutationFn: () => closeTicket(selectedTicketId as number),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      if (selectedTicketId) {
        queryClient.invalidateQueries({
          queryKey: ["ticket-messages", selectedTicketId],
        });
      }
      toast({
        title: t("support.messages.closeSuccessTitle"),
        status: "success",
      });
    },
    onError: onMutationError(toast, t("support.messages.closeErrorTitle"), t("support.messages.closeErrorFallback")),
  });

  // Mutacion para reabrir ticket.
  const reopenMutation = useMutation({
    mutationFn: () => reopenTicket(selectedTicketId as number),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      toast({
        title: t("support.messages.reopenSuccessTitle"),
        status: "success",
      });
    },
    onError: onMutationError(toast, t("support.messages.reopenErrorTitle"), t("support.messages.reopenErrorFallback")),
  });

  // Mutacion para asignar ticket a un usuario.
  const assignMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTicketId || !assigneeId) return;
      return assignTicket({
        ticketId: selectedTicketId,
        assigneeId: assigneeId as number,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      toast({
        title: t("support.messages.assignSuccessTitle"),
        status: "success",
      });
    },
    onError: onMutationError(toast, t("support.messages.assignErrorTitle"), t("support.messages.assignErrorFallback")),
  });

  // Envia formulario de nuevo ticket.
  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubject.trim() || !newDescription.trim()) {
      toast({
        title: t("support.messages.missingDataTitle"),
        description: t("support.messages.missingDataDesc"),
        status: "warning",
      });
      return;
    }
    createMutation.mutate();
  };

  // Envia un mensaje al ticket.
  const handleSendReply = () => {
    if (!selectedTicketId) return;
    if (!replyBody.trim()) {
      toast({
        title: t("support.messages.emptyMessageTitle"),
        description: t("support.messages.emptyMessageDesc"),
        status: "warning",
      });
      return;
    }
    replyMutation.mutate();
  };

  // Selecciona ticket para ver detalle.
  const handleSelectTicket = (ticket: Ticket) => {
    setSelectedTicketId(ticket.id);
    setAssigneeId("");
  };

  const tickets = ticketsQuery.data ?? [];

  // Render principal de la pagina.
  return (
    <>
      <SupportTicketsHeader
        title={t("support.header.title")}
        subtitle={t("support.header.subtitle")}
        eyebrow={t("support.header.eyebrow")}
        description={t("support.description")}
        animation={`${fadeUp} 0.6s ease-out`}
        subtleTextColor={subtleText}
      />

      <Grid
        templateColumns={{ base: "1fr", xl: "1.4fr 1fr" }}
        gap={8}
        alignItems="flex-start"
      >
        {/* Columna izquierda: filtros + listado */}
        <GridItem>
          {isSuperAdmin && (
            <Box mb={4}>
              <Text fontSize="sm" color={subtleText}>
                {tenantId
                  ? `Tenant activo: ${tenantId}.`
                  : "No hay tenant seleccionado."}{" "}
                Cambia el tenant desde el selector superior.
              </Text>
            </Box>
          )}

          <SupportTicketsFiltersCard
            cardBg={cardBg}
            statusFilter={statusFilter}
            priorityFilter={priorityFilter}
            mineOnly={mineOnly}
            statusOptions={statusOptions}
            priorityOptions={priorityOptions}
            filtersTitle={t("support.filters.title")}
            statusLabel={t("support.filters.status")}
            priorityLabel={t("support.filters.priority")}
            mineOnlyLabel={t("support.filters.mineOnly")}
            allLabel={t("support.filters.all")}
            onStatusChange={setStatusFilter}
            onPriorityChange={setPriorityFilter}
            onMineOnlyChange={setMineOnly}
          />

          <SupportTicketsTable
            cardBg={cardBg}
            tableHeadBg={tableHeadBg}
            subtleText={subtleText}
            rowHoverBg={rowHoverBg}
            rowActiveBg={rowActiveBg}
            isSuperAdmin={isSuperAdmin}
            selectedTicketId={selectedTicketId}
            tickets={tickets}
            tenants={tenantsQuery.data ?? []}
            statusOptions={statusOptions}
            priorityOptions={priorityOptions}
            isLoading={ticketsQuery.isLoading}
            isError={ticketsQuery.isError}
            tenantHeaderLabel={t("support.table.tenant")}
            subjectHeaderLabel={t("support.table.subject")}
            statusHeaderLabel={t("support.table.status")}
            priorityHeaderLabel={t("support.table.priority")}
            lastActivityHeaderLabel={t("support.table.lastActivity")}
            loadingLabel={t("support.table.loading")}
            loadErrorLabel={t("support.table.loadError")}
            emptyLabel={t("support.table.empty")}
            onSelectTicket={handleSelectTicket}
            formatDateTime={formatDateTimeDisplay}
          />
        </GridItem>

        {/* Right column: creation (non super admin) + detail */}
        <GridItem>
        <Stack spacing={6}>
          {!isSuperAdmin && (
            <Box
              p={4}
              borderWidth="1px"
              borderRadius="md"
              bg={cardBg}
              as="form"
              onSubmit={handleCreate}
            >
              <Heading as="h3" size="sm" mb={3}>
                {t("support.create.title")}
              </Heading>
              <Stack spacing={3}>
                <FormControl isRequired>
                  <FormLabel>{t("support.create.subject")}</FormLabel>
                  <Input
                    value={newSubject}
                    onChange={(e) => setNewSubject(e.target.value)}
                    placeholder={t("support.create.subjectPlaceholder")}
                  />
                </FormControl>
                <FormControl isRequired>
                  <FormLabel>{t("support.create.descriptionLabel")}</FormLabel>
                  <Textarea
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    rows={4}
                    placeholder={t("support.create.descriptionPlaceholder")}
                  />
                </FormControl>
                <Button
                  type="submit"
                  colorScheme="brand"
                  alignSelf="flex-start"
                  isLoading={createMutation.isPending}
                >{t("support.create.submit")}</Button>
              </Stack>
            </Box>
          )}

          <Box p={4} borderWidth="1px" borderRadius="md" bg={cardBg}>
            <Heading as="h3" size="sm" mb={3}>
              {t("support.detail.title")}
            </Heading>
            {!selectedTicket && (
              <Text fontSize="sm" color={subtleText}>
                {t("support.detail.selectPrompt")}
              </Text>
            )}
            {selectedTicket && (
              <Stack spacing={4}>
                <Box>
                  <Text fontWeight="bold" mb={1}>
                    {selectedTicket.subject}
                  </Text>
                  <HStack spacing={2} align="center" flexWrap="wrap" mb={2}>
                    <Text as="span" fontSize="sm">
                      {t("support.detail.statusLabel")}
                    </Text>
                    <Badge>
                      {
                        statusOptions.find(
                          (s) => s.value === selectedTicket.status,
                        )?.label
                      }
                    </Badge>
                    <Text as="span" fontSize="sm">
                      {t("support.detail.priorityLabel")}
                    </Text>
                    {canManageTickets ? (
                      <Select
                        size="xs"
                        maxW="140px"
                        display="inline-flex"
                        value={selectedTicket.priority}
                        onChange={(e) =>
                          updateMutation.mutate({
                            priority: e.target.value as TicketPriority,
                          })
                        }
                        isDisabled={updateMutation.isPending}
                      >
                        {priorityOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <Badge>
                        {
                          priorityOptions.find(
                            (p) => p.value === selectedTicket.priority,
                          )?.label
                        }
                      </Badge>
                    )}
                  </HStack>
                  <Text fontSize="sm" color={subtleText}>
                    {t("support.detail.createdBy", {
                      email: selectedTicket.created_by_email,
                    })}{" "}
                    {t("support.detail.assignedTo")}{" "}
                    {selectedTicket.assigned_to_email ??
                      t("support.detail.unassigned")}
                  </Text>
                  <Text fontSize="xs" color={subtleText} mt={1}>
                    {t("support.detail.createdAt", {
                      date: formatDateTimeDisplay(selectedTicket.created_at),
                    })}
                  </Text>
                  <Text fontSize="xs" color={subtleText}>
                    {t("support.detail.firstResponse", {
                      date: formatDateTimeDisplay(selectedTicket.first_response_at),
                    })}
                  </Text>
                  <Text fontSize="xs" color={subtleText}>
                    {t("support.detail.lastActivity", {
                      date: formatDateTimeDisplay(selectedTicket.last_activity_at),
                    })}
                  </Text>
                  <Text fontSize="xs" color={subtleText}>
                    {t("support.detail.resolvedAt", {
                      date: formatDateTimeDisplay(selectedTicket.resolved_at),
                    })}
                  </Text>
                  <Text fontSize="xs" color={subtleText}>
                    {t("support.detail.closedAt", {
                      date: formatDateTimeDisplay(selectedTicket.closed_at),
                    })}
                  </Text>
                </Box>

                {assigneesQuery.data && assigneesQuery.data.length > 0 && (
                  <HStack spacing={3} align="flex-end">
                    <FormControl maxW="260px">
                      <FormLabel fontSize="sm">{t("support.assign.label")}</FormLabel>
                      <Select
                        value={assigneeId}
                        onChange={(e) => {
                          const value = e.target.value;
                          setAssigneeId(value ? Number(value) : "");
                        }}
                      >
                        <option value="">{t("support.assign.placeholder")}</option>
                        {assigneesQuery.data.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.full_name ?? u.email}
                            {!u.is_active ? ` (${t("support.assign.inactive")})` : ""}
                          </option>
                        ))}
                      </Select>
                    </FormControl>
                    <Button
                      size="sm"
                      variant="outline"
                      colorScheme="blue"
                      onClick={() => assignMutation.mutate()}
                      isLoading={assignMutation.isPending}
                      isDisabled={!assigneeId || !selectedTicketId}
                    >{t("support.assign.submit")}</Button>
                  </HStack>
                )}

                <HStack spacing={3}>
                  <Button
                    size="sm"
                    variant="outline"
                    colorScheme="brand"
                    onClick={() => reopenMutation.mutate()}
                    isDisabled={
                      !(
                        selectedTicket.status === "resolved" ||
                        selectedTicket.status === "closed"
                      )
                    }
                    isLoading={reopenMutation.isPending}
                  >{t("support.actions.reopen")}</Button>
                  <Button
                    size="sm"
                    colorScheme="red"
                    onClick={() => closeMutation.mutate()}
                    isDisabled={selectedTicket.status === "closed"}
                    isLoading={closeMutation.isPending}
                  >{t("support.actions.close")}</Button>
                </HStack>

                <Box
                  maxH="260px"
                  overflowY="auto"
                  borderWidth="1px"
                  borderRadius="md"
                  p={3}
                >
                  {messagesQuery.isLoading && (
                    <Text fontSize="sm">{t("support.messages.loadingConversation")}</Text>
                  )}
                  {messagesQuery.isError && !messagesQuery.isLoading && (
                    <Text fontSize="sm" color="red.400">
                      {t("support.messages.loadMessagesError")}
                    </Text>
                  )}
                  {!messagesQuery.isLoading &&
                    !messagesQuery.isError &&
                    (messagesQuery.data ?? []).length === 0 && (
                      <Text fontSize="sm" color={subtleText}>
                        {t("support.messages.emptyMessages")}
                      </Text>
                    )}
                  <Stack spacing={3}>
                    {(messagesQuery.data ?? []).map((msg) => (
                      <Box key={msg.id}>
                        <HStack spacing={2} mb={1}>
                          <Text fontSize="xs" fontWeight="bold">
                            {msg.author_email}
                          </Text>
                          <Text fontSize="xs" color={subtleText}>
                            {formatDateTimeDisplay(msg.created_at)}
                          </Text>
                          {msg.is_internal && (
                            <Badge colorScheme="purple" variant="outline">
                              {t("support.messages.internalNote")}
                            </Badge>
                          )}
                        </HStack>
                        <Text fontSize="sm" whiteSpace="pre-wrap">
                          {msg.body}
                        </Text>
                      </Box>
                    ))}
                  </Stack>
                </Box>

                <Box>
                  <FormLabel fontSize="sm">{t("support.reply.title")}</FormLabel>
                  <Textarea
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    rows={3}
                    placeholder={t("support.reply.placeholder")}
                  />
                  <HStack justify="space-between" mt={2}>
                    <HStack>
                      <Switch
                        size="sm"
                        isChecked={replyInternal}
                        onChange={(e) => setReplyInternal(e.target.checked)}
                      />
                      <Text fontSize="xs" color={subtleText}>
                        {t("support.reply.internalLabel")}
                      </Text>
                    </HStack>
                    <Button
                      size="sm"
                      colorScheme="brand"
                      onClick={handleSendReply}
                      isLoading={replyMutation.isPending}
                      isDisabled={!selectedTicketId}
                    >{t("support.reply.send")}</Button>
                  </HStack>
                </Box>
              </Stack>
            )}
          </Box>
        </Stack>
        </GridItem>
      </Grid>
    </>
  );
};


