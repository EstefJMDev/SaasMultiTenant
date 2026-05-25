import React, { useEffect, useRef } from "react";

import {
  Box,
  Button,
  Center,
  HStack,
  Icon,
  Spinner,
  Text,
  useColorModeValue,
} from "@chakra-ui/react";
import { Download, FileText, RefreshCw } from "lucide-react";

import { useContractPdfBlob } from "@widgets/contracts/hooks/useContractPdfBlob";

interface ContractPdfViewerProps {
  contractId?: number | null;
  tenantId?: number;
  docType?: "COMPARATIVE" | "CONTRACT" | "SIGNED";
  canRegenerate?: boolean;
  onRegenerate?: () => void | Promise<void>;
  isRegenerating?: boolean;
  refreshToken?: number;
}

export const ContractPdfViewer: React.FC<ContractPdfViewerProps> = ({
  contractId,
  tenantId,
  docType = "CONTRACT",
  canRegenerate = false,
  onRegenerate,
  isRegenerating = false,
  refreshToken = 0,
}) => {
  const cardBg = useColorModeValue("white", "gray.800");
  const borderColor = useColorModeValue("gray.200", "gray.700");
  const placeholderBg = useColorModeValue("gray.50", "gray.900");

  const { blobUrl, isLoading, error, errorStatus, refresh, download } = useContractPdfBlob({
    contractId,
    docType,
    tenantId,
    enabled: Boolean(contractId),
  });

  const handleRegenerate = async () => {
    if (!onRegenerate) return;
    await onRegenerate();
    refresh();
  };

  // Auto-genera el contrato cuando aún no existe (404). Solo disparamos esto
  // si el usuario tiene permiso de regeneración (canRegenerate): para los
  // demás roles el contrato lo genera otro flujo y aquí solo mostramos el
  // placeholder hasta que aparezca el PDF.
  const autoRegeneratedRef = useRef<number | null>(null);
  useEffect(() => {
    if (!canRegenerate) return;
    if (!contractId || !onRegenerate || docType !== "CONTRACT") return;
    if (errorStatus !== 404) return;
    if (autoRegeneratedRef.current === contractId) return;
    autoRegeneratedRef.current = contractId;
    (async () => {
      try {
        await onRegenerate();
        refresh();
      } catch {
        // No reseteamos el ref: un único intento por contractId evita el
        // bucle si el backend responde con error.
      }
    })();
  }, [canRegenerate, contractId, docType, onRegenerate, refresh, errorStatus]);

  useEffect(() => {
    if (!contractId) return;
    refresh();
  }, [contractId, refresh, refreshToken]);

  return (
    <Box
      bg={cardBg}
      border="1px solid"
      borderColor={borderColor}
      rounded="xl"
      overflow="hidden"
      h="100%"
      display="flex"
      flexDirection="column"
    >
      <HStack
        px={4}
        py={3}
        borderBottom="1px solid"
        borderColor={borderColor}
        justify="space-between"
      >
        <HStack spacing={2}>
          <Icon as={FileText} boxSize={4} />
          <Text fontWeight="semibold" fontSize="sm">
            Contrato generado
          </Text>
        </HStack>
        <HStack spacing={2}>
          {canRegenerate && onRegenerate && (
            <Button
              size="xs"
              variant="outline"
              leftIcon={<RefreshCw size={12} />}
              onClick={handleRegenerate}
              isLoading={isRegenerating}
              isDisabled={!contractId}
            >
              Regenerar
            </Button>
          )}
          <Button
            size="xs"
            colorScheme="blue"
            leftIcon={<Download size={12} />}
            onClick={download}
            isDisabled={!blobUrl}
          >
            Descargar
          </Button>
        </HStack>
      </HStack>
      <Box flex={1} bg={placeholderBg} minH={0}>
        {!contractId ? (
          <Placeholder text="Guarda el contrato para ver el documento generado." />
        ) : isLoading ? (
          <Center h="100%">
            <Spinner />
          </Center>
        ) : error ? (
          <Placeholder text={error} />
        ) : blobUrl ? (
          <iframe
            src={`${blobUrl}#toolbar=1&navpanes=0&pagemode=none&view=FitH`}
            title="Contrato generado"
            style={{ width: "100%", height: "100%", border: "none" }}
          />
        ) : (
          <Placeholder text="Sin documento disponible." />
        )}
      </Box>
    </Box>
  );
};

const Placeholder: React.FC<{ text: string }> = ({ text }) => (
  <Center h="100%" p={6}>
    <Text fontSize="sm" color="gray.500" textAlign="center">
      {text}
    </Text>
  </Center>
);
