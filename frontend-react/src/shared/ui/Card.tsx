import React from "react";
import { Box, BoxProps, useColorModeValue } from "@chakra-ui/react";

export const Card = React.forwardRef<HTMLDivElement, BoxProps>((props, ref) => {
  const bg = useColorModeValue("bg.surface", "gray.800");
  const border = useColorModeValue("border.subtle", "whiteAlpha.200");
  const shadow = useColorModeValue("sm", "lg");

  return (
    <Box
      ref={ref}
      bg={bg}
      borderWidth="1px"
      borderColor={border}
      borderRadius="xl"
      boxShadow={shadow}
      {...props}
    />
  );
});

Card.displayName = "Card";
