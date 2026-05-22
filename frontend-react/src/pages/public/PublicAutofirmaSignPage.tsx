import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  AlertIcon,
  Box,
  Button,
  Flex,
  Heading,
  HStack,
  Text,
  VStack,
} from "@chakra-ui/react";
import type { AxiosError } from "axios";

import {
  publicGetSignatureStatus,
  publicPresignAutofirma,
  publicSubmitAutofirmaClientResult,
} from "@api/signatures";

const getPublicRouteSearchParams = (): URLSearchParams => {
  const directParams = new URLSearchParams(window.location.search);
  if ([...directParams.keys()].length > 0) return directParams;

  const hash = window.location.hash ?? "";
  const hashQueryIndex = hash.indexOf("?");
  if (hashQueryIndex === -1) return new URLSearchParams();

  return new URLSearchParams(hash.slice(hashQueryIndex + 1));
};

const getParam = (key: string): string =>
  getPublicRouteSearchParams().get(key)?.trim() ?? "";

const parseClientResultFromQuery = () => {
  const sessionId = getParam("afirmaSessionId");
  const signatureB64 = getParam("afirmaSignature");
  const certChainRaw = getParam("afirmaCertChain");
  if (!sessionId || !signatureB64) return null;
  return {
    sessionId,
    signatureB64,
    certChainB64: certChainRaw
      ? certChainRaw
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      : [],
  };
};

export const PublicAutofirmaSignPage: React.FC = () => {
  const signatureRequestId = getParam("sr");
  const tenantId = Number(getParam("tenant"));
  const exp = Number(getParam("exp"));
  const sig = getParam("sig");

  const [status, setStatus] = useState<string>("PENDING");
  const [error, setError] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [pendingClientResult, setPendingClientResult] = useState<{
    sessionId: string;
    signatureB64: string;
    certChainB64: string[];
  } | null>(null);

  const isParamsValid = useMemo(
    () =>
      Boolean(
        signatureRequestId &&
          sig &&
          Number.isFinite(tenantId) &&
          tenantId > 0 &&
          Number.isFinite(exp) &&
          exp > 0,
      ),
    [signatureRequestId, sig, tenantId, exp],
  );

  useEffect(() => {
    const fromQuery = parseClientResultFromQuery();
    if (fromQuery) setPendingClientResult(fromQuery);
  }, []);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== "autofirma_client_result" || !event.newValue) return;
      try {
        const payload = JSON.parse(event.newValue) as {
          sessionId?: string;
          signatureB64?: string;
          certChainB64?: string[];
        };
        if (!payload.sessionId || !payload.signatureB64) return;
        setPendingClientResult({
          sessionId: payload.sessionId,
          signatureB64: payload.signatureB64,
          certChainB64: payload.certChainB64 ?? [],
        });
      } catch {
        // ignore malformed payload
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (!isParamsValid || !signatureRequestId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const data = await publicGetSignatureStatus({
          signatureRequestId,
          tenantId,
          exp,
          sig,
        });
        if (!cancelled) setStatus(data.status);
      } catch {
        // ignore polling errors in UI
      }
    };
    void tick();
    const timer = window.setInterval(() => void tick(), 2500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [isParamsValid, signatureRequestId, tenantId, exp, sig]);

  const getApiError = (err: unknown, fallback: string) => {
    const ax = err as AxiosError<{ detail?: string }>;
    return ax?.response?.data?.detail ?? fallback;
  };

  const onLaunchAutofirma = async () => {
    if (!signatureRequestId) return;
    setError("");
    setIsLoading(true);
    try {
      const presign = await publicPresignAutofirma({
        signatureRequestId,
        tenantId,
        exp,
        sig,
      });
      window.location.href = presign.protocol_url;
    } catch (err) {
      setError(getApiError(err, "No se pudo iniciar AutoFirma."));
    } finally {
      setIsLoading(false);
    }
  };

  const onSubmitResult = async () => {
    if (!signatureRequestId || !pendingClientResult) return;
    setError("");
    setIsLoading(true);
    try {
      const data = await publicSubmitAutofirmaClientResult(
        {
          signatureRequestId,
          tenantId,
          exp,
          sig,
        },
        {
          session_id: pendingClientResult.sessionId,
          signature_b64: pendingClientResult.signatureB64,
          cert_chain_b64: pendingClientResult.certChainB64,
          device_hints: { userAgent: window.navigator.userAgent },
        },
      );
      setStatus(data.status);
    } catch (err) {
      setError(getApiError(err, "No se pudo completar la firma."));
    } finally {
      setIsLoading(false);
    }
  };

  if (!isParamsValid) {
    return (
      <Box minH="100vh" display="flex" alignItems="center" justifyContent="center">
        <Alert status="error" maxW="640px" borderRadius="md">
          <AlertIcon />
          Enlace de firma inv?lido.
        </Alert>
      </Box>
    );
  }

  const documentPreviewUrl = signatureRequestId
    ? `/public/signatures/${signatureRequestId}/document?tenant_id=${tenantId}&exp=${exp}&sig=${encodeURIComponent(sig)}`
    : "";

  return (
    <Box minH="100vh" bg="gray.100" overflow="hidden">
      <Flex
        px={{ base: 3, md: 6 }}
        py={3}
        bg="white"
        borderBottomWidth="1px"
        align="center"
        justify="space-between"
        gap={4}
        wrap="wrap"
      >
        <VStack align="start" spacing={0}>
          <Heading size="sm">Firma de contrato con AutoFirma</Heading>
          <Text color="gray.700" fontSize="sm">
            Estado actual: {status}
          </Text>
        </VStack>

        <HStack spacing={3}>
          <Button colorScheme="blue" onClick={() => void onLaunchAutofirma()} isLoading={isLoading}>
            Firmar
          </Button>
          {pendingClientResult ? (
            <Button variant="outline" onClick={() => void onSubmitResult()} isLoading={isLoading}>
              Enviar resultado
            </Button>
          ) : null}
        </HStack>
      </Flex>

      <Box px={{ base: 3, md: 6 }} py={3}>
        {error ? (
          <Alert status="warning" borderRadius="md" mb={3}>
            <AlertIcon />
            {error}
          </Alert>
        ) : null}
        {status === "SIGNED" ? (
          <Alert status="success" borderRadius="md" mb={3}>
            <AlertIcon />
            Firma completada correctamente.
          </Alert>
        ) : null}
        {!pendingClientResult && status !== "SIGNED" ? (
          <Alert status="info" borderRadius="md" mb={3}>
            <AlertIcon />
            Tras firmar en AutoFirma, vuelve a esta pestana para enviar el resultado.
          </Alert>
        ) : null}
      </Box>

      <Box px={{ base: 3, md: 6 }} pb={4} h="calc(100vh - 132px)">
        <Box borderWidth="1px" borderRadius="md" overflow="hidden" h="100%" bg="white">
          <iframe
            src={documentPreviewUrl}
            title="Contrato PDF"
            style={{ width: "100%", height: "100%", border: "none" }}
          />
        </Box>
      </Box>
    </Box>
  );
};

export default PublicAutofirmaSignPage;
