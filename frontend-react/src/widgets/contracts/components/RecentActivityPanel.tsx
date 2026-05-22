import React from "react";
import { Box, Stack } from "@chakra-ui/react";
import { ActivityItem } from "./ActivityItem";
import { CardContainer } from "./CardContainer";
import { CardHeader } from "./CardHeader";
import { EmptyStateText } from "./EmptyStateText";

interface RecentActivityItem {
  key: string | number;
  status: "approved" | "created" | "pending";
  title: string;
  description: string;
  time: string;
  onClick: () => void;
}

interface RecentActivityPanelProps {
  cardBg: string;
  borderColor: string;
  items: RecentActivityItem[];
  emptyText: string;
  title?: string;
}

export const RecentActivityPanel: React.FC<RecentActivityPanelProps> = ({
  cardBg,
  borderColor,
  items,
  emptyText,
  title = "Últimos Movimientos",
}) => {
  return (
    <CardContainer bg={cardBg} borderColor={borderColor}>
      <CardHeader borderColor={borderColor} title={title} />
      <Stack spacing={0}>
        {items.length === 0 && (
          <Box px={6} py={4}>
            <EmptyStateText text={emptyText} />
          </Box>
        )}
        {items.map((item) => (
          <ActivityItem
            key={item.key}
            status={item.status}
            title={item.title}
            description={item.description}
            time={item.time}
            onClick={item.onClick}
          />
        ))}
      </Stack>
    </CardContainer>
  );
};
