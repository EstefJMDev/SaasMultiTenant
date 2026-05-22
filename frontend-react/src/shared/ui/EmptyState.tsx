import React from "react";
import { Box, Button, HStack, Text, VStack } from "@chakra-ui/react";

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  icon,
  actionLabel,
  onAction,
}) => (
  <VStack spacing={3} py={8} textAlign="center">
    {icon && <Box fontSize="32px">{icon}</Box>}
    <VStack spacing={1}>
      <Text fontWeight="semibold">{title}</Text>
      {description && (
        <Text fontSize="sm" color="text.muted">
          {description}
        </Text>
      )}
    </VStack>
    {actionLabel && onAction && (
      <HStack>
        <Button size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      </HStack>
    )}
  </VStack>
);
