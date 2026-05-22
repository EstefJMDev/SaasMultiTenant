import React from "react";
import {
  Box,
  Heading,
  HStack,
  Icon,
  SimpleGrid,
  Stack,
  Text,
  VStack,
} from "@chakra-ui/react";

import { formatCurrency } from "@shared/utils/erp/formatters";

interface InvoicesHeroProps {
  totalCount: number;
  totalAmount: number;
  pendingCount: number;
  paidCount: number;
}

export const InvoicesHero: React.FC<InvoicesHeroProps> = ({
  totalCount,
  totalAmount,
  pendingCount,
  paidCount,
}) => (
  <Box
    borderRadius="3xl"
    p={{ base: 6, md: 8 }}
    bgGradient="linear(120deg, var(--chakra-colors-brand-700) 0%, var(--chakra-colors-brand-500) 55%, var(--chakra-colors-brand-300) 110%)"
    color="white"
    boxShadow="2xl"
    position="relative"
    overflow="hidden"
  >
    <Box
      position="absolute"
      inset="0"
      opacity={0.1}
      bgImage="radial-gradient(circle at 20% 50%, white 1px, transparent 1px)"
      bgSize="30px 30px"
    />
    <Stack position="relative" spacing={4}>
      <HStack spacing={3}>
        <Box
          w="12"
          h="12"
          bgGradient="linear(to-br, whiteAlpha.300, whiteAlpha.100)"
          borderRadius="xl"
          display="flex"
          alignItems="center"
          justifyContent="center"
          backdropFilter="blur(10px)"
          border="1px solid"
          borderColor="whiteAlpha.300"
        >
          <Icon viewBox="0 0 24 24" boxSize={6}>
            <path
              fill="currentColor"
              d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"
            />
          </Icon>
        </Box>
        <VStack align="start" spacing={1}>
          <Text
            textTransform="uppercase"
            fontSize="xs"
            letterSpacing="wider"
            opacity={0.9}
            fontWeight="semibold"
          >
            Módulo de facturación
          </Text>
          <Heading size="xl" fontWeight="bold">
            Gestión de Facturas
          </Heading>
        </VStack>
      </HStack>
      <Text fontSize="sm" opacity={0.95} maxW="2xl">
        Sube facturas, revisa extracciones y gestiona el estado de pago.
      </Text>
    </Stack>

    <SimpleGrid
      columns={{ base: 2, md: 4 }}
      spacing={4}
      mt={6}
      position="relative"
    >
      <Box
        bg="whiteAlpha.200"
        borderRadius="2xl"
        p={5}
        borderWidth="1px"
        borderColor="whiteAlpha.300"
        backdropFilter="blur(10px)"
        transition="all 0.3s"
        _hover={{ transform: "translateY(-2px)", bg: "whiteAlpha.300" }}
      >
        <HStack justify="space-between" mb={2}>
          <Text fontSize="xs" opacity={0.9} fontWeight="semibold">
            Total facturas
          </Text>
          <Icon viewBox="0 0 24 24" boxSize={5} opacity={0.7}>
            <path
              fill="currentColor"
              d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2Z"
            />
          </Icon>
        </HStack>
        <Text fontSize="3xl" fontWeight="bold" fontFamily="mono">
          {totalCount}
        </Text>
      </Box>

      <Box
        bg="whiteAlpha.200"
        borderRadius="2xl"
        p={5}
        borderWidth="1px"
        borderColor="whiteAlpha.300"
        backdropFilter="blur(10px)"
        transition="all 0.3s"
        _hover={{ transform: "translateY(-2px)", bg: "whiteAlpha.300" }}
      >
        <HStack justify="space-between" mb={2}>
          <Text fontSize="xs" opacity={0.9} fontWeight="semibold">
            Pendientes
          </Text>
          <Icon viewBox="0 0 24 24" boxSize={5} opacity={0.7}>
            <path
              fill="currentColor"
              d="M12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22C6.47,22 2,17.5 2,12A10,10 0 0,1 12,2M12.5,7V12.25L17,14.92L16.25,16.15L11,13V7H12.5Z"
            />
          </Icon>
        </HStack>
        <Text fontSize="3xl" fontWeight="bold" fontFamily="mono">
          {pendingCount}
        </Text>
      </Box>

      <Box
        bg="whiteAlpha.200"
        borderRadius="2xl"
        p={5}
        borderWidth="1px"
        borderColor="whiteAlpha.300"
        backdropFilter="blur(10px)"
        transition="all 0.3s"
        _hover={{ transform: "translateY(-2px)", bg: "whiteAlpha.300" }}
      >
        <HStack justify="space-between" mb={2}>
          <Text fontSize="xs" opacity={0.9} fontWeight="semibold">
            Pagadas
          </Text>
          <Icon viewBox="0 0 24 24" boxSize={5} opacity={0.7}>
            <path
              fill="currentColor"
              d="M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2M11,16.5L18,9.5L16.59,8.09L11,13.67L7.91,10.59L6.5,12L11,16.5Z"
            />
          </Icon>
        </HStack>
        <Text fontSize="3xl" fontWeight="bold" fontFamily="mono">
          {paidCount}
        </Text>
      </Box>
    </SimpleGrid>
  </Box>
);
