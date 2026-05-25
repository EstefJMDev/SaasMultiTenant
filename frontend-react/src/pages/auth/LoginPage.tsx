import React, { useState } from "react";
import { extractApiError } from "@shared/api/errors";
import {
  Box,
  Button,
  FormControl,
  FormLabel,
  Heading,
  Image,
  Input,
  InputGroup,
  InputRightElement,
  Stack,
  Text,
  useColorModeValue,
  useToast,
  IconButton,
} from "@chakra-ui/react";
import { FiEye, FiEyeOff } from "react-icons/fi";
import { useRouter } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";

import { login } from "@api/auth";
import { storeAccessToken } from "@shared/auth/tokenStorage";

/**
 * Pantalla de login inicial.
 *
 * Flujo:
 * 1. Usuario introduce email + password.
 * 2. Si el backend indica `mfa_required = true`, navegamos a /mfa.
 * 3. Si no requiere MFA, navegamos directamente al dashboard.
 */

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const toast = useToast();
  const router = useRouter();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const pageBg = useColorModeValue("gray.50", "gray.900");
  const cardBg = useColorModeValue("white", "gray.800");
  const labelColor = useColorModeValue("gray.700", "gray.100");
  const subtitleColor = useColorModeValue("gray.500", "gray.300");

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    try {
      const result = await login(email, password);

      if (result.mfa_required) {
        // Guardamos el username temporalmente para MFA.
        sessionStorage.setItem("mfa_username", email);
        queryClient.clear();
        router.history.push("/mfa");
        return;
      }

      storeAccessToken(result.access_token);
      queryClient.invalidateQueries({ queryKey: ["current-user"] });
      router.history.push("/dashboard");
      return;
    } catch (error: unknown) {
      const backendMessage = extractApiError(error, t("auth.messages.invalidFallback"));
      toast({
        title: t("auth.messages.loginErrorTitle"),
        description: backendMessage,
        status: "error",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Box
      minH="100vh"
      display="flex"
      alignItems="center"
      justifyContent="center"
      bg={pageBg}
      px={4}
    >
      <Box
        bg={cardBg}
        p={8}
        rounded="md"
        shadow="md"
        width="100%"
        maxW="420px"
      >
        <Stack spacing={6} align="center" mb={4}>
          <Image
            src="/logo_urdecon.png"
            alt={t("auth.logoAlt")}
            boxSize="100px"
            objectFit="contain"
          />
          <br/>
        </Stack>

        <form onSubmit={handleSubmit}>
          <Stack spacing={4}>
            <FormControl isRequired>
              <FormLabel htmlFor="email" color={labelColor}>
                {t("auth.login.email")}
              </FormLabel>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </FormControl>
            <FormControl isRequired>
              <FormLabel htmlFor="password" color={labelColor}>
                {t("auth.login.password")}
              </FormLabel>
              <InputGroup>
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <InputRightElement>
                  <IconButton
                    aria-label={showPassword ? "Ocultar contrasena" : "Mostrar contrasena"}
                    variant="ghost"
                    size="sm"
                    icon={showPassword ? <FiEyeOff /> : <FiEye />}
                    onClick={() => setShowPassword((prev) => !prev)}
                  />
                </InputRightElement>
              </InputGroup>
            </FormControl>
            <Button type="submit" colorScheme="blue" isLoading={isLoading}>
              {t("auth.login.submit")}
            </Button>
          </Stack>
        </form>
      </Box>
    </Box>
  );
};

