import React from "react";
import { Alert, AlertIcon, Box, Button, HStack, Text } from "@chakra-ui/react";

interface ErrorBannerProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
}

export const ErrorBanner: React.FC<ErrorBannerProps> = ({
  title = "Ha ocurrido un error",
  description,
  onRetry,
}) => (
  <Alert status="error" borderRadius="lg">
    <AlertIcon />
    <Box flex="1">
      <Text fontWeight="semibold">{title}</Text>
      {description && (
        <Text fontSize="sm" color="text.muted">
          {description}
        </Text>
      )}
    </Box>
    {onRetry && (
      <HStack>
        <Button size="sm" variant="outline" onClick={onRetry}>
          Reintentar
        </Button>
      </HStack>
    )}
  </Alert>
);
