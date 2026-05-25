import React from "react";
import { Box, Flex, Icon, SimpleGrid, Text, useColorModeValue } from "@chakra-ui/react";

interface ContractsHeroProps {
  totalCount: number;
  pendingCount: number;
  signedCount: number;
}

interface StatCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
}

const StatCard: React.FC<StatCardProps> = ({ label, value, icon }) => {
  const bg = useColorModeValue("white", "gray.800");
  const border = useColorModeValue("gray.200", "gray.700");

  return (
    <Flex
      bg={bg}
      border="1px solid"
      borderColor={border}
      rounded="xl"
      align="center"
      gap={3}
      px={6}
      py={4}
    >
      <Flex
        align="center"
        justify="center"
        bg="green.50"
        color="green.500"
        rounded="lg"
        w={10}
        h={10}
        flexShrink={0}
      >
        {icon}
      </Flex>
      <Box>
        <Text fontSize="2xl" fontWeight="bold" lineHeight={1.1}>
          {value}
        </Text>
        <Text fontSize="xs" color="gray.500" fontWeight={500} mt={0.5}>
          {label}
        </Text>
      </Box>
    </Flex>
  );
};

export const ContractsHero: React.FC<ContractsHeroProps> = ({
  totalCount,
  pendingCount,
  signedCount,
}) => (
  <SimpleGrid columns={{ base: 1, sm: 3 }} spacing={4}>
    <StatCard
      label="Total expedientes"
      value={totalCount}
      icon={
        <Icon viewBox="0 0 24 24" boxSize={5}>
          <path
            fill="currentColor"
            d="M15,7H20.5L15,1.5V7M8,0H16L22,6V18A2,2 0 0,1 20,20H8C6.89,20 6,19.1 6,18V2A2,2 0 0,1 8,0M4,4V22H20V24H4A2,2 0 0,1 2,22V4H4Z"
          />
        </Icon>
      }
    />
    <StatCard
      label="Pendientes"
      value={pendingCount}
      icon={
        <Icon viewBox="0 0 24 24" boxSize={5}>
          <path
            fill="currentColor"
            d="M12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22C6.47,22 2,17.5 2,12A10,10 0 0,1 12,2M12.5,7V12.25L17,14.92L16.25,16.15L11,13V7H12.5Z"
          />
        </Icon>
      }
    />
    <StatCard
      label="Firmados"
      value={signedCount}
      icon={
        <Icon viewBox="0 0 24 24" boxSize={5}>
          <path
            fill="currentColor"
            d="M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2M11,16.5L18,9.5L16.59,8.09L11,13.67L7.91,10.59L6.5,12L11,16.5Z"
          />
        </Icon>
      }
    />
  </SimpleGrid>
);
