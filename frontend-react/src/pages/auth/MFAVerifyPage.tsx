import React, { useState } from "react";
import { extractApiError } from "@shared/api/errors";
import {
  Box,
  Button,
  Heading,
  Input,
  Stack,
  Text,
  useToast,
} from "@chakra-ui/react";
import { useRouter } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";

import { verifyMFA } from "@api/auth";
import { storeAccessToken } from "@shared/auth/tokenStorage";

/**
 * Pantalla para introducir el código MFA enviado por correo.
 *
 * El backend valida el código y, si es correcto, devuelve el token final.
 */

export const MFAVerifyPage: React.FC = () => {
  const [code, setCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const toast = useToast();
  const router = useRouter();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const username = sessionStorage.getItem("mfa_username") ?? "";

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!username.trim()) {
      toast({
        title: t("mfa.messages.errorTitle"),
        description: "Sesi?n MFA no encontrada. Vuelve a iniciar sesi?n.",
        status: "error",
      });
      router.history.push("/");
      return;
    }
    setIsLoading(true);
    try {
      const result = await verifyMFA(username, code.trim());
      storeAccessToken(result.access_token);
      sessionStorage.removeItem("mfa_username");
      queryClient.invalidateQueries({ queryKey: ["current-user"] });
      router.history.push("/dashboard");
    } catch (error: unknown) {
      const detail = extractApiError(error, t("mfa.messages.errorDesc"));
      toast({
        title: t("mfa.messages.errorTitle"),
        description: detail,
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
      bg="gray.50"
    >
      <Box bg="white" p={8} rounded="md" shadow="md" width="100%" maxW="400px">
        <Heading mb={6} size="lg" textAlign="center">
          {t("mfa.title")}
        </Heading>
        <Text mb={4} textAlign="center">
          {t("mfa.subtitle")}
        </Text>
        <form onSubmit={handleSubmit}>
          <Stack spacing={4}>
            <Box>
              <Text mb={1}>{t("mfa.codeLabel")}</Text>
              <Input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
              />
            </Box>
            <Button type="submit" colorScheme="blue" isLoading={isLoading}>
              {t("mfa.actions.verify")}
            </Button>
          </Stack>
        </form>
      </Box>
    </Box>
  );
};

