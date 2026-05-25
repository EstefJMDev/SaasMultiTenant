import React from "react";

import { Box, Text } from "@chakra-ui/react";

import { ProjectHero } from "@widgets/projects";

interface SupportTicketsHeaderProps {
  title: string;
  subtitle: string;
  eyebrow: string;
  description: string;
  animation: string;
  subtleTextColor: string;
}

export const SupportTicketsHeader: React.FC<SupportTicketsHeaderProps> = ({
  title,
  subtitle,
  eyebrow,
  description,
  animation,
  subtleTextColor,
}) => {
  return (
    <>
      <Box mb={8}>
        <ProjectHero
          items={[]}
          title={title}
          subtitle={subtitle}
          eyebrow={eyebrow}
          animation={animation}
        />
      </Box>
      <Text mb={6} color={subtleTextColor}>
        {description}
      </Text>
    </>
  );
};
