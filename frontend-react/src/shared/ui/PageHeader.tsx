import React from "react";
import { Box, HStack, Text } from "@chakra-ui/react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  actions,
}) => {
  return (
    <HStack align="start" justify="space-between" spacing={6} w="100%">
      <Box>
        <Text fontSize="2xl" fontWeight="semibold">
          {title}
        </Text>
        {subtitle && (
          <Text fontSize="sm" color="text.muted" mt={1}>
            {subtitle}
          </Text>
        )}
      </Box>
      {actions && <Box>{actions}</Box>}
    </HStack>
  );
};
