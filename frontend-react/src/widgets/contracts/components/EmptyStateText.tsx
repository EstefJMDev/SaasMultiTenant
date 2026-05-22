import React from "react";
import { Text } from "@chakra-ui/react";

interface EmptyStateTextProps {
  text: string;
  fontSize?: string;
  color?: string;
}

export const EmptyStateText: React.FC<EmptyStateTextProps> = ({
  text,
  fontSize = "sm",
  color = "gray.500",
}) => {
  return (
    <Text fontSize={fontSize} color={color}>
      {text}
    </Text>
  );
};
