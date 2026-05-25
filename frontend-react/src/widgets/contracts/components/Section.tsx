import React from "react";
import { Box, HStack, Text } from "@chakra-ui/react";

interface SectionProps {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}

export const Section: React.FC<SectionProps> = ({ icon, title, children }) => {
  return (
    <Box pt={2}>
      <HStack spacing={3} mb={4}>
        <Box color="blue.600">{icon}</Box>
        <Text fontWeight="bold">{title}</Text>
      </HStack>
      {children}
    </Box>
  );
};
