import React from "react";
import { Box, HStack, Spinner, Stack, Text } from "@chakra-ui/react";
import { Check, Clock, X } from "lucide-react";

export interface TimelineEventItem {
  status: "completed" | "current" | "pending" | "warning";
  title: string;
  meta?: string;
  comment?: string;
  indent?: boolean;
}

interface TimelineProps {
  events: TimelineEventItem[];
  isLoading?: boolean;
}

export const Timeline: React.FC<TimelineProps> = ({ events, isLoading = false }) => {
  if (isLoading) {
    return (
      <HStack spacing={3} color="gray.500">
        <Spinner size="sm" />
        <Text fontSize="sm">Cargando historial...</Text>
      </HStack>
    );
  }

  return (
    <Box>
      <Stack spacing={5}>
        {events.map((event, index) => (
          <HStack
            key={`${event.title}-${event.meta ?? ""}-${event.comment ?? ""}`}
            align="start"
            spacing={4}
            position="relative"
            pl={event.indent ? 24 : 0}
          >
            {index < events.length - 1 && (
              <Box
                position="absolute"
                left={event.indent ? "111px" : "15px"}
                top="32px"
                bottom="-20px"
                width="2px"
                bg="gray.200"
              />
            )}
            {event.indent && (
              <Box
                position="absolute"
                left="15px"
                top="-20px"
                bottom="50%"
                width="2px"
                bg="gray.200"
              />
            )}
            {event.indent && (
              <Box
                position="absolute"
                left="15px"
                top="32px"
                width="80px"
                height="2px"
                bg="gray.200"
              />
            )}
            <Box
              w="32px"
              h="32px"
              rounded="full"
              border="2px solid"
              borderColor={
                event.status === "completed"
                  ? "brand.500"
                  : event.status === "current"
                    ? "blue.500"
                    : event.status === "warning"
                      ? "red.500"
                      : "yellow.500"
              }
              bg={
                event.status === "completed"
                  ? "brand.50"
                  : event.status === "current"
                    ? "blue.50"
                    : event.status === "warning"
                      ? "red.50"
                      : "yellow.50"
              }
              display="flex"
              alignItems="center"
              justifyContent="center"
              position="relative"
              zIndex={1}
            >
              {event.status === "completed" ? (
                <Check size={14} color="#16a34a" />
              ) : event.status === "current" ? (
                <Clock size={14} color="#2563eb" />
              ) : event.status === "warning" ? (
                <X size={14} color="#dc2626" />
              ) : (
                <Clock size={14} color="#d97706" />
              )}
            </Box>
            <Box flex="1" pb={2}>
              <Text fontWeight="semibold" fontSize="sm">
                {event.title}
              </Text>
              {event.meta && (
                <Text fontSize="sm" color="gray.500">
                  {event.meta}
                </Text>
              )}
              {event.comment && (
                <Text fontSize="sm" color="gray.500" fontStyle="italic">
                  {event.comment}
                </Text>
              )}
            </Box>
          </HStack>
        ))}
      </Stack>
    </Box>
  );
};
