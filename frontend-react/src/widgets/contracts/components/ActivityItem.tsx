import React from "react";
import { Box, Flex, Text } from "@chakra-ui/react";
import { AlertCircle, Check, FileText } from "lucide-react";

interface ActivityItemProps {
  status: "approved" | "created" | "pending";
  title: string;
  description: string;
  time: string;
  onClick?: () => void;
}

export const ActivityItem: React.FC<ActivityItemProps> = ({
  status,
  title,
  description,
  time,
  onClick,
}) => {
  const iconMap = {
    approved: <Check size={18} color="#16a34a" />,
    created: <FileText size={18} color="#2563eb" />,
    pending: <AlertCircle size={18} color="#d97706" />,
  };

  return (
    <Flex
      px={6}
      py={4}
      align="center"
      gap={4}
      cursor={onClick ? "pointer" : "default"}
      _hover={{ bg: "gray.50" }}
      onClick={onClick}
    >
      {iconMap[status]}
      <Box flex="1">
        <Text fontWeight="semibold">{title}</Text>
        <Text fontSize="sm" color="gray.500">
          {description}
        </Text>
      </Box>
      <Text fontSize="xs" color="gray.400">
        {time}
      </Text>
    </Flex>
  );
};
