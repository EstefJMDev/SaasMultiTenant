import React from "react";
import { Box, Heading, HStack, Icon, Stack, Text } from "@chakra-ui/react";

interface PageHeroProps {
  eyebrow: string;
  title: string;
  subtitle?: string;
  iconPath?: string;
}

const defaultIconPath =
  "M3,4H21V6H3V4M4,8H20V20H4V8M6,10V18H18V10H6Z";

export const PageHero: React.FC<PageHeroProps> = ({
  eyebrow,
  title,
  subtitle,
  iconPath = defaultIconPath,
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
            <path fill="currentColor" d={iconPath} />
          </Icon>
        </Box>
        <Stack spacing={1}>
          <Text
            textTransform="uppercase"
            fontSize="xs"
            letterSpacing="wider"
            opacity={0.9}
            fontWeight="semibold"
          >
            {eyebrow}
          </Text>
          <Heading size="lg" fontWeight="bold">
            {title}
          </Heading>
        </Stack>
      </HStack>
      {subtitle ? (
        <Text fontSize="sm" opacity={0.95}>
          {subtitle}
        </Text>
      ) : null}
    </Stack>
  </Box>
);
