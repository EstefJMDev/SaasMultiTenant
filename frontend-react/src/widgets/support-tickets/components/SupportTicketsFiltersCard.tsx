import React from "react";

import {
  Box,
  FormControl,
  FormLabel,
  Heading,
  HStack,
  Select,
  Switch,
} from "@chakra-ui/react";

import type { TicketPriority, TicketStatus } from "@api/tickets";

interface FilterOption<T extends string> {
  value: T;
  label: string;
}

interface SupportTicketsFiltersCardProps {
  cardBg: string;
  statusFilter: "" | TicketStatus;
  priorityFilter: "" | TicketPriority;
  mineOnly: boolean;
  statusOptions: Array<FilterOption<TicketStatus>>;
  priorityOptions: Array<FilterOption<TicketPriority>>;
  filtersTitle: string;
  statusLabel: string;
  priorityLabel: string;
  mineOnlyLabel: string;
  allLabel: string;
  onStatusChange: (value: "" | TicketStatus) => void;
  onPriorityChange: (value: "" | TicketPriority) => void;
  onMineOnlyChange: (value: boolean) => void;
}

export const SupportTicketsFiltersCard: React.FC<
  SupportTicketsFiltersCardProps
> = ({
  cardBg,
  statusFilter,
  priorityFilter,
  mineOnly,
  statusOptions,
  priorityOptions,
  filtersTitle,
  statusLabel,
  priorityLabel,
  mineOnlyLabel,
  allLabel,
  onStatusChange,
  onPriorityChange,
  onMineOnlyChange,
}) => {
  return (
    <Box mb={4} p={4} borderWidth="1px" borderRadius="md" bg={cardBg}>
      <Heading as="h3" size="sm" mb={3}>
        {filtersTitle}
      </Heading>
      <HStack spacing={4} align="flex-end" flexWrap="wrap">
        <FormControl maxW="200px">
          <FormLabel>{statusLabel}</FormLabel>
          <Select
            value={statusFilter}
            onChange={(e) => onStatusChange(e.target.value as "" | TicketStatus)}
          >
            <option value="">{allLabel}</option>
            {statusOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        </FormControl>
        <FormControl maxW="200px">
          <FormLabel>{priorityLabel}</FormLabel>
          <Select
            value={priorityFilter}
            onChange={(e) =>
              onPriorityChange(e.target.value as "" | TicketPriority)
            }
          >
            <option value="">{allLabel}</option>
            {priorityOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        </FormControl>
        <FormControl maxW="220px">
          <FormLabel>{mineOnlyLabel}</FormLabel>
          <Switch
            isChecked={mineOnly}
            onChange={(e) => onMineOnlyChange(e.target.checked)}
          />
        </FormControl>
      </HStack>
    </Box>
  );
};
