import React from "react";
import { Box } from "@chakra-ui/react";

interface CardContainerProps {
  children: React.ReactNode;
  bg?: string;
  borderColor?: string;
  rounded?: string;
  overflow?: string;
  p?: number | string;
}

export const CardContainer: React.FC<CardContainerProps> = ({
  children,
  bg = "white",
  borderColor = "gray.200",
  rounded = "xl",
  overflow,
  p,
}) => {
  return (
    <Box
      bg={bg}
      border="1px solid"
      borderColor={borderColor}
      rounded={rounded}
      overflow={overflow}
      p={p}
    >
      {children}
    </Box>
  );
};
