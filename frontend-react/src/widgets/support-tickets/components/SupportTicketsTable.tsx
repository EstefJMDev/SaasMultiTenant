import React from "react";

import {
  Badge,
  Box,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
} from "@chakra-ui/react";

import type {
  Ticket,
  TicketPriority,
  TicketStatus,
} from "@api/tickets";
import type { TenantOption } from "@api/users";

interface StatusOption {
  value: TicketStatus;
  label: string;
}

interface PriorityOption {
  value: TicketPriority;
  label: string;
}

interface SupportTicketsTableProps {
  cardBg: string;
  tableHeadBg: string;
  subtleText: string;
  rowHoverBg: string;
  rowActiveBg: string;
  isSuperAdmin: boolean;
  selectedTicketId: number | null;
  tickets: Ticket[];
  tenants: TenantOption[];
  statusOptions: StatusOption[];
  priorityOptions: PriorityOption[];
  isLoading: boolean;
  isError: boolean;
  tenantHeaderLabel: string;
  subjectHeaderLabel: string;
  statusHeaderLabel: string;
  priorityHeaderLabel: string;
  lastActivityHeaderLabel: string;
  loadingLabel: string;
  loadErrorLabel: string;
  emptyLabel: string;
  onSelectTicket: (ticket: Ticket) => void;
  formatDateTime: (iso?: string | null) => string;
}

export const SupportTicketsTable: React.FC<SupportTicketsTableProps> = ({
  cardBg,
  tableHeadBg,
  subtleText,
  rowHoverBg,
  rowActiveBg,
  isSuperAdmin,
  selectedTicketId,
  tickets,
  tenants,
  statusOptions,
  priorityOptions,
  isLoading,
  isError,
  tenantHeaderLabel,
  subjectHeaderLabel,
  statusHeaderLabel,
  priorityHeaderLabel,
  lastActivityHeaderLabel,
  loadingLabel,
  loadErrorLabel,
  emptyLabel,
  onSelectTicket,
  formatDateTime,
}) => {
  const columnCount = isSuperAdmin ? 5 : 4;

  return (
    <Box borderWidth="1px" borderRadius="md" overflow="hidden" bg={cardBg}>
      <Table size="md">
        <Thead bg={tableHeadBg}>
          <Tr>
            {isSuperAdmin && <Th>{tenantHeaderLabel}</Th>}
            <Th>{subjectHeaderLabel}</Th>
            <Th>{statusHeaderLabel}</Th>
            <Th>{priorityHeaderLabel}</Th>
            <Th>{lastActivityHeaderLabel}</Th>
          </Tr>
        </Thead>
        <Tbody>
          {isLoading && (
            <Tr>
              <Td colSpan={columnCount}>
                <Text fontSize="sm">{loadingLabel}</Text>
              </Td>
            </Tr>
          )}
          {isError && !isLoading && (
            <Tr>
              <Td colSpan={columnCount}>
                <Text fontSize="sm" color="red.400">
                  {loadErrorLabel}
                </Text>
              </Td>
            </Tr>
          )}
          {!isLoading && !isError && tickets.length === 0 && (
            <Tr>
              <Td colSpan={columnCount}>
                <Text fontSize="sm" color={subtleText}>
                  {emptyLabel}
                </Text>
              </Td>
            </Tr>
          )}
          {tickets.map((ticket) => (
            <Tr
              key={ticket.id}
              onClick={() => onSelectTicket(ticket)}
              _hover={{
                bg: rowHoverBg,
                cursor: "pointer",
              }}
              bg={ticket.id === selectedTicketId ? rowActiveBg : undefined}
            >
              {isSuperAdmin && (
                <Td>
                  {tenants.find((t) => t.id === ticket.tenant_id)?.name ??
                    ticket.tenant_id}
                </Td>
              )}
              <Td>
                <Text fontSize="sm" fontWeight="semibold" noOfLines={2}>
                  {ticket.subject}
                </Text>
              </Td>
              <Td>
                <Badge
                  colorScheme={
                    ticket.status === "closed"
                      ? "gray"
                      : ticket.status === "resolved"
                        ? "brand"
                        : ticket.status === "in_progress"
                          ? "blue"
                          : "yellow"
                  }
                >
                  {statusOptions.find((s) => s.value === ticket.status)?.label ??
                    ticket.status}
                </Badge>
              </Td>
              <Td>
                <Badge
                  colorScheme={
                    ticket.priority === "critical"
                      ? "red"
                      : ticket.priority === "high"
                        ? "orange"
                        : ticket.priority === "medium"
                          ? "yellow"
                          : "gray"
                  }
                >
                  {priorityOptions.find((p) => p.value === ticket.priority)
                    ?.label ?? ticket.priority}
                </Badge>
              </Td>
              <Td>{formatDateTime(ticket.last_activity_at)}</Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    </Box>
  );
};
