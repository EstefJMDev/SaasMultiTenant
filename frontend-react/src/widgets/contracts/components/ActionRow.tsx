import React from "react";
import { Flex } from "@chakra-ui/react";

interface ActionRowProps {
  children: React.ReactNode;
  borderColor?: string;
  bg?: string;
}

export const ActionRow: React.FC<ActionRowProps> = ({
  children,
  borderColor = "gray.200",
  bg,
}) => {
  return (
    <Flex
      px={6}
      py={4}
      borderTop="1px solid"
      borderColor={borderColor}
      justify="space-between"
      bg={bg}
    >
      {children}
    </Flex>
  );
};
