import React from "react";
import { Box, Heading } from "@chakra-ui/react";

interface CardHeaderProps {
  title?: string;
  children?: React.ReactNode;
  borderColor?: string;
  bg?: string;
  px?: number | string;
  py?: number | string;
}

export const CardHeader: React.FC<CardHeaderProps> = ({
  title,
  children,
  borderColor = "gray.200",
  bg,
  px = 6,
  py = 5,
}) => {
  return (
    <Box px={px} py={py} borderBottom="1px solid" borderColor={borderColor} bg={bg}>
      {children ?? <Heading size="md">{title}</Heading>}
    </Box>
  );
};
