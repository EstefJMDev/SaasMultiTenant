import React from "react";
import { Box, Heading, HStack, Text, VStack } from "@chakra-ui/react";

interface HeroItem {
  label: string;
  value: string | number;
  sub?: string;
  positive?: boolean;
  icon?: React.ReactNode;
}

interface ProjectHeroProps {
  items: HeroItem[];
  title: string;
  subtitle: string;
  animation?: string;
  action?: React.ReactNode;
  eyebrow?: string;
  leadIcon?: React.ReactNode;
  breadcrumb?: string;
}

export const ProjectHero: React.FC<ProjectHeroProps> = ({
  items,
  title,
  subtitle,
  animation,
  action,
  eyebrow,
  leadIcon,
  breadcrumb,
}) => {
  const showBreadcrumb = Boolean(breadcrumb);
  const showEyebrow = Boolean(eyebrow);
  const showLeadIcon = Boolean(leadIcon);

  return (
    <Box
      borderRadius="18px"
      mb={6}
      position="relative"
      overflow="hidden"
      animation={animation}
      boxShadow="0 8px 40px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.1)"
    >
      <Box
        position="absolute"
        inset="0"
        background="linear-gradient(125deg, var(--chakra-colors-brand-900) 0%, var(--chakra-colors-brand-800) 40%, var(--chakra-colors-brand-700) 70%, var(--chakra-colors-brand-600) 100%)"
      />

      <Box
        position="absolute"
        right="-120px"
        top="-120px"
        w="550px"
        h="550px"
        background="radial-gradient(circle, color-mix(in srgb, var(--chakra-colors-brand-600) 22%, transparent) 0%, color-mix(in srgb, var(--chakra-colors-brand-700) 9%, transparent) 45%, transparent 70%)"
        pointerEvents="none"
      />

      <Box
        position="absolute"
        left="-60px"
        bottom="-80px"
        w="300px"
        h="300px"
        background="radial-gradient(circle, color-mix(in srgb, var(--chakra-colors-brand-400) 10%, transparent) 0%, transparent 65%)"
        pointerEvents="none"
      />

      <Box
        position="absolute"
        inset="0"
        pointerEvents="none"
        style={{
          backgroundImage:
            "repeating-linear-gradient(-55deg, transparent, transparent 36px, rgba(255,255,255,0.013) 36px, rgba(255,255,255,0.013) 37px)",
        }}
      />

      <Box
        position="absolute"
        top="0"
        left="8%"
        right="8%"
        h="1px"
        background="linear-gradient(90deg, transparent, color-mix(in srgb, var(--chakra-colors-brand-300) 45%, transparent) 25%, color-mix(in srgb, var(--chakra-colors-brand-300) 75%, transparent) 50%, color-mix(in srgb, var(--chakra-colors-brand-300) 45%, transparent) 75%, transparent)"
      />

      <Box position="relative" zIndex={1}>
        <Box
          px={{ base: 6, md: 8 }}
          pt={{ base: 6, md: 7 }}
          pb={{ base: 5, md: 6 }}
          display="flex"
          alignItems="flex-start"
          justifyContent="space-between"
          gap={5}
          flexWrap="wrap"
        >
          <VStack align="flex-start" spacing={0}>
            {showBreadcrumb && (
              <HStack spacing={2} mb={4}>
                <Box
                  w="18px"
                  h="18px"
                  borderRadius="5px"
                  background="color-mix(in srgb, var(--chakra-colors-brand-300) 12%, transparent)"
                  border="1px solid color-mix(in srgb, var(--chakra-colors-brand-300) 20%, transparent)"
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="color-mix(in srgb, var(--chakra-colors-brand-300) 65%, transparent)"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    width="10"
                    height="10"
                  >
                    <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                  </svg>
                </Box>
                <Text
                  fontSize="10.5px"
                  fontWeight={500}
                  color="color-mix(in srgb, var(--chakra-colors-brand-300) 65%, transparent)"
                >
                  {breadcrumb}
                </Text>
                <Text fontSize="10px" color="rgba(255,255,255,0.15)">
                  {"›"}
                </Text>
                <Text fontSize="10.5px" color="rgba(255,255,255,0.35)">
                  {title}
                </Text>
              </HStack>
            )}

            {showEyebrow && !showBreadcrumb && (
              <HStack spacing={2} mb={2}>
                {showLeadIcon && (
                  <Box
                  w="18px"
                  h="18px"
                  borderRadius="5px"
                  background="color-mix(in srgb, var(--chakra-colors-brand-300) 12%, transparent)"
                  border="1px solid color-mix(in srgb, var(--chakra-colors-brand-300) 20%, transparent)"
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                  color="color-mix(in srgb, var(--chakra-colors-brand-300) 65%, transparent)"
                >
                  {leadIcon}
                </Box>
                )}
                <Text
                  fontSize="10.5px"
                  fontWeight={600}
                  letterSpacing="0.12em"
                  textTransform="uppercase"
                  color="color-mix(in srgb, var(--chakra-colors-brand-300) 65%, transparent)"
                >
                  {eyebrow}
                </Text>
              </HStack>
            )}

            <Box mb={2}>
              <Heading
                as="h1"
                fontSize={{ base: "28px", md: "36px" }}
                fontWeight={800}
                letterSpacing="-0.048em"
                lineHeight={1}
                style={{
                  textShadow: "0 2px 24px rgba(0,0,0,0.4)",
                  background:
                    "linear-gradient(100deg, #ffffff 0%, color-mix(in srgb, var(--chakra-colors-brand-100) 85%, #ffffff) 25%, var(--chakra-colors-brand-300) 55%, var(--chakra-colors-brand-400) 75%, color-mix(in srgb, var(--chakra-colors-brand-200) 75%, #ffffff) 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                {title}
              </Heading>
            </Box>

            <Text
              fontSize="12.5px"
              color="rgba(255,255,255,0.36)"
              fontWeight={400}
              lineHeight={1.55}
              maxW="360px"
              mt={1}
            >
              {subtitle}
            </Text>
          </VStack>

          {action && (
            <VStack align="flex-end" spacing={2} flexShrink={0}>
              {action}
              <HStack
                spacing={2}
                bg="rgba(255,255,255,0.05)"
                border="1px solid rgba(255,255,255,0.07)"
                borderRadius="full"
                px={3}
                py={1}
              >
                <Box
                  w="5px"
                  h="5px"
                  borderRadius="full"
                  bg="brand.400"
                  style={{
                    boxShadow:
                      "0 0 8px color-mix(in srgb, var(--chakra-colors-brand-400) 80%, transparent)",
                  }}
                />
                <Text
                  fontSize="10.5px"
                  color="rgba(255,255,255,0.32)"
                  fontWeight={400}
                >
                  Actualizado hoy
                </Text>
              </HStack>
            </VStack>
          )}
        </Box>

        {items.length > 0 && (
          <Box
            display="flex"
            borderTop="1px solid rgba(255,255,255,0.055)"
            background="rgba(0,0,0,0.08)"
            flexWrap={{ base: "wrap", md: "nowrap" }}
          >
            {items.map((item, i) => (
              <Box
                key={item.label}
                flex="1"
                px={{ base: 5, md: 7 }}
                py={{ base: 4, md: "18px" }}
                borderRight={
                  i < items.length - 1
                    ? "1px solid rgba(255,255,255,0.055)"
                    : "none"
                }
                position="relative"
                cursor="default"
                transition="background 0.15s"
                minW={{ base: "50%", md: "0" }}
                _hover={{ background: "rgba(255,255,255,0.03)" }}
              >
                <HStack spacing={2} mb={2}>
                  {item.icon && (
                    <Box
                      w="18px"
                      h="18px"
                      borderRadius="4px"
                      background="color-mix(in srgb, var(--chakra-colors-brand-300) 10%, transparent)"
                      display="flex"
                      alignItems="center"
                      justifyContent="center"
                      color="color-mix(in srgb, var(--chakra-colors-brand-300) 60%, transparent)"
                      flexShrink={0}
                    >
                      {item.icon}
                    </Box>
                  )}
                  <Text
                    fontSize="9.5px"
                    fontWeight={600}
                    letterSpacing="0.07em"
                    textTransform="uppercase"
                    color="rgba(255,255,255,0.3)"
                  >
                    {item.label}
                  </Text>
                </HStack>

                <Text
                  fontSize={{ base: "32px", md: "38px" }}
                  fontWeight={800}
                  lineHeight={1}
                  color="white"
                  letterSpacing="-0.055em"
                  mb={item.sub ? 1 : 0}
                  sx={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {item.value}
                </Text>

                {item.sub && (
                  <Text
                    fontSize="10.5px"
                    fontWeight={500}
                    color={
                      item.positive
                        ? "var(--chakra-colors-brand-300)"
                        : "rgba(255,255,255,0.22)"
                    }
                  >
                    {item.sub}
                  </Text>
                )}
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
};
