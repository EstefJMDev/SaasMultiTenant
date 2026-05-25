import React from "react";

import {
  Alert,
  AlertIcon,
  Box,
  Button,
  Divider,
  HStack,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
} from "@chakra-ui/react";
import { AlertCircle, Check, Download, Eye, X } from "lucide-react";

import {
  fetchContractDocumentBlob,
  type Contract,
} from "@entities/contracts";

interface ApprovalDocument {
  id: number;
  doc_type: string;
  created_at?: string | null;
}

interface ApprovalOverviewSectionProps {
  contract: Contract;
  tenantId?: number;
  cardBg: string;
  borderColor: string;
  showDocuments: boolean;
  canApproveCurrent: boolean;
  canApproveAll: boolean;
  canStartSignature: boolean;
  showApproveAll: boolean;
  showSignatureSection: boolean;
  isSuperAdmin: boolean;
  isApproving: boolean;
  isStartingSignaturit: boolean;
  isStartingAutofirma: boolean;
  allowAutofirma: boolean;
  decisionComment: string;
  previewUrl: string | null;
  previewTitle: string;
  documents: ApprovalDocument[];
  isDocumentsFetching: boolean;
  onNavigateToComparative: () => void;
  onToggleDocuments: () => void;
  onPreviewDocument: (title: string, url: string) => void;
  onClosePreview: () => void;
  onDecisionCommentChange: (value: string) => void;
  onApproveAll: () => void;
  onApproveCurrent: () => void;
  onReject: () => void;
  onRequestChanges: () => void;
  onStartSignaturit: () => void;
  onStartAutofirma: () => void;
  formatComparativeStatus: (status?: string | null) => string;
  formatContractStatus: (status?: string | null) => string;
  formatContractType: (status: Contract["type"]) => string;
  formatCurrency: (value: number) => string;
  formatDate: (value?: string | null) => string;
}

export const ApprovalOverviewSection: React.FC<ApprovalOverviewSectionProps> = ({
  contract,
  tenantId,
  cardBg,
  borderColor,
  showDocuments,
  canApproveCurrent,
  canApproveAll,
  canStartSignature,
  showApproveAll,
  showSignatureSection,
  isSuperAdmin,
  isApproving,
  isStartingSignaturit,
  isStartingAutofirma,
  allowAutofirma,
  decisionComment,
  previewUrl,
  previewTitle,
  documents,
  isDocumentsFetching,
  onNavigateToComparative,
  onToggleDocuments,
  onPreviewDocument,
  onClosePreview,
  onDecisionCommentChange,
  onApproveAll,
  onApproveCurrent,
  onReject,
  onRequestChanges,
  onStartSignaturit,
  onStartAutofirma,
  formatComparativeStatus,
  formatContractStatus,
  formatContractType,
  formatCurrency,
  formatDate,
}) => {
  const hasCorruptedChars = (value: string): boolean =>
    /[\uFFFD]|\u00C3\u0192|\u00C3\u201A|\u00C3\u00A2|\u00C3|\u00C2|\u00E2/.test(value);

  const tryRepairMojibake = (value: string): string => {
    if (!/[\u00C3\u00C2\u00E2]/.test(value)) {
      return value;
    }
    try {
      const bytes = Uint8Array.from(value, (char) => char.charCodeAt(0) & 0xff);
      const repaired = new TextDecoder("utf-8").decode(bytes).trim();
      return repaired || value;
    } catch {
      return value;
    }
  };

  const sanitizeTextValue = (value: string | null | undefined): string => {
    if (!value) return "-";
    const normalized = value.trim();
    if (!normalized) return "-";
    const repaired = tryRepairMojibake(normalized);
    if (!repaired || hasCorruptedChars(repaired)) return "-";
    return repaired;
  };
  const getNoPendingStepMessage = (): string => {
    if (contract.comparative_status === "PENDING_REVIEW") {
      return "El comparativo esta pendiente de aprobacion por Gerencia. Esta pantalla es solo para aprobar/rechazar comparativos en esa fase.";
    }
    if (contract.status === "PENDING_JEFE_OBRA") {
      return "Este contrato todavia no esta en flujo de aprobacion. Ve a la pestana Contrato y pulsa Enviar a aprobacion.";
    }
    if (contract.status === "PENDING_SUPPLIER") {
      const sentAt = (contract.comparative_data as any)?.supplier_form_sent_at;
      if (sentAt) {
        return "Se ha enviado el correo al proveedor con el enlace de onboarding. Estamos a la espera de que complete sus datos.";
      }
      return "Faltan datos del proveedor. Completa los datos en la pestana Contrato para poder continuar.";
    }
    return isSuperAdmin
      ? `No hay un paso pendiente para aprobar en este momento (estado: ${formatContractStatus(contract.status)}).`
      : `Este contrato esta en ${formatContractStatus(contract.status)} y no corresponde a tu departamento.`;
  };

  return (
    <Box bg={cardBg} border="1px solid" borderColor={borderColor} rounded="xl" overflow="hidden">
      <Box px={6} py={4} bg="yellow.50" borderBottom="1px solid" borderColor={borderColor}>
        <HStack spacing={3}>
          <AlertCircle size={20} color="#d97706" />
          <Text fontWeight="bold">COMPARATIVO CT-{contract.id}</Text>
        </HStack>
      </Box>
      <Stack spacing={4} p={6}>
        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4} fontSize="sm">
          <Text><strong>Estado comparativo:</strong> {formatComparativeStatus(contract.comparative_status)}</Text>
          <Text><strong>Estado contrato:</strong> {formatContractStatus(contract.status)}</Text>
          <Text>
            <strong>Pendiente de:</strong>{" "}
            {sanitizeTextValue(contract.current_pending_department)}
          </Text>
          <Text><strong>Tipo:</strong> {formatContractType(contract.type)}</Text>
          <Text><strong>Contrato:</strong> CT-{contract.id}</Text>
          <Text><strong>Ultima actualizacion:</strong> {formatDate(contract.updated_at)}</Text>
        </SimpleGrid>

        <Divider />

        <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4} fontSize="sm">
          <Text>
            <strong>Proveedor:</strong> {sanitizeTextValue(contract.supplier_name)}
          </Text>
          <Text>
            <strong>Importe:</strong>{" "}
            {contract.total_amount != null
              ? formatCurrency(Number(contract.total_amount))
              : "Pendiente"}
          </Text>
          <Text><strong>Plazo:</strong> Pendiente</Text>
        </SimpleGrid>

        <Divider />

        <Box>
          <Text fontSize="sm" color="gray.500" mb={2}>Observaciones</Text>
          <Text fontStyle="italic">
            {sanitizeTextValue(
              ((contract.contract_data as any)?.additional?.observations as
                | string
                | undefined) ?? "Sin observaciones registradas.",
            )}
          </Text>
        </Box>

        <HStack spacing={3}>
          <Button leftIcon={<Eye size={16} />} colorScheme="blue" variant="outline" onClick={onNavigateToComparative}>
            Ver Comparativo Completo
          </Button>
          <Button leftIcon={<Download size={16} />} colorScheme="gray" variant="outline" onClick={onToggleDocuments}>
            Documentos Adjuntos
          </Button>
        </HStack>

        {!canApproveCurrent && (
          <Alert status="info" borderRadius="md">
            <AlertIcon />
            {getNoPendingStepMessage()}
          </Alert>
        )}

        {showDocuments && (
          <Box p={3} border="1px solid" borderColor={borderColor} rounded="md">
            <Text fontSize="sm" fontWeight="semibold" mb={2}>Documentos del expediente</Text>
            {isDocumentsFetching && <Text fontSize="sm" color="gray.500">Cargando documentos...</Text>}
            {!isDocumentsFetching && documents.length === 0 && (
              <Text fontSize="sm" color="gray.500">No hay documentos generados todavia.</Text>
            )}
            <Stack spacing={2}>
              {documents.map((doc) => {
                const docType = doc.doc_type as "SIGNED" | "COMPARATIVE" | "CONTRACT";
                const effectiveTenantId = contract.tenant_id ?? tenantId;
                const handlePreview = async () => {
                  const { blob } = await fetchContractDocumentBlob(
                    contract.id,
                    docType,
                    effectiveTenantId,
                    true,
                  );
                  const url = URL.createObjectURL(blob);
                  onPreviewDocument(`CT-${contract.id} - ${doc.doc_type}`, url);
                };
                const handleDownload = async () => {
                  const { blob, filename } = await fetchContractDocumentBlob(
                    contract.id,
                    docType,
                    effectiveTenantId,
                  );
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement("a");
                  link.href = url;
                  link.download = filename || `CT-${contract.id}-${docType}.pdf`;
                  document.body.appendChild(link);
                  link.click();
                  link.remove();
                  setTimeout(() => URL.revokeObjectURL(url), 1_000);
                };
                return (
                  <HStack key={doc.id} justify="space-between">
                    <Text fontSize="sm">
                      {sanitizeTextValue(doc.doc_type)} - {formatDate(doc.created_at)}
                    </Text>
                    <HStack spacing={2}>
                      <Button size="xs" colorScheme="blue" variant="outline" onClick={handlePreview}>
                        Ver
                      </Button>
                      <Button size="xs" colorScheme="blue" onClick={handleDownload}>
                        Descargar
                      </Button>
                    </HStack>
                  </HStack>
                );
              })}
            </Stack>
          </Box>
        )}

        <Modal isOpen={Boolean(previewUrl)} onClose={onClosePreview} size="6xl" isCentered>
          <ModalOverlay />
          <ModalContent minH="80vh">
            <ModalHeader>{previewTitle}</ModalHeader>
            <ModalCloseButton />
            <ModalBody pb={4}>
              {previewUrl ? (
                <Box borderWidth="1px" rounded="md" overflow="hidden" h="70vh">
                  <iframe src={previewUrl} title={previewTitle} style={{ width: "100%", height: "100%", border: "none" }} />
                </Box>
              ) : null}
            </ModalBody>
          </ModalContent>
        </Modal>

        <Divider />

        {contract.comparative_status === "PENDING_MGMT_APPROVAL" && contract.submitted_at && (() => {
          const submittedAt = new Date(contract.submitted_at);
          const autoApproveAt = new Date(submittedAt.getTime() + 3 * 24 * 60 * 60 * 1000);
          const now = Date.now();
          const diffMs = autoApproveAt.getTime() - now;
          if (diffMs <= 0) {
            return (
              <Alert status="warning" borderRadius="md">
                <AlertIcon />
                Este comparativo ya supera los 3 días. Se auto-aprobará en cuestión de minutos.
              </Alert>
            );
          }
          const totalHours = Math.floor(diffMs / (60 * 60 * 1000));
          const days = Math.floor(totalHours / 24);
          const hours = totalHours % 24;
          const statusColor = days < 1 ? "orange" : "blue";
          return (
            <Alert status={statusColor === "orange" ? "warning" : "info"} borderRadius="md">
              <AlertIcon />
              <Box>
                <Text fontWeight="semibold">Auto-aprobación automática</Text>
                <Text fontSize="sm">
                  Si Gerencia no decide en {days}d {hours}h, el comparativo se aprobará automáticamente
                  (regla de 3 días naturales desde el envío).
                </Text>
              </Box>
            </Alert>
          );
        })()}

        <Box>
          <Text fontSize="sm" fontWeight="semibold" mb={2}>Tu decision</Text>
          <Textarea rows={3} placeholder="Comentarios (obligatorio para rechazar o solicitar cambios)..." value={decisionComment} onChange={(event) => onDecisionCommentChange(event.target.value)} />
        </Box>

        <HStack spacing={3}>
          {isSuperAdmin && showApproveAll && (
            <Button
              leftIcon={<Check size={16} />}
              colorScheme="blue"
              variant="solid"
              isDisabled={!canApproveAll}
              isLoading={isApproving}
              loadingText="Aprobando todo"
              onClick={onApproveAll}
            >
              Aprobar todas las fases
            </Button>
          )}
          <Button leftIcon={<X size={16} />} colorScheme="red" isDisabled={!decisionComment.trim()} isLoading={isApproving} loadingText="Rechazando" onClick={onReject}>Rechazar</Button>
          <Button leftIcon={<AlertCircle size={16} />} colorScheme="yellow" isDisabled={!decisionComment.trim()} isLoading={isApproving} loadingText="Devolviendo" onClick={onRequestChanges}>Solicitar Cambios</Button>
          <Button leftIcon={<Check size={16} />} colorScheme="brand" isDisabled={!canApproveCurrent} isLoading={isApproving} loadingText="Aprobando" onClick={onApproveCurrent}>
            Aprobar
          </Button>
        </HStack>

        {showSignatureSection && (
          <>
            <Divider />
            <Box>
              <Text fontSize="sm" fontWeight="semibold" mb={2}>Firma del contrato</Text>
              {!canStartSignature ? (
                <Alert status="info" borderRadius="md">
                  <AlertIcon />
                  La firma se habilita cuando el comparativo y todas las fases de aprobacion estan completadas.
                </Alert>
              ) : (
                <HStack spacing={3}>
                  <Button size="sm" colorScheme="brand" isLoading={isStartingSignaturit} loadingText="Enviando..." onClick={onStartSignaturit}>
                    Firmar con Signaturit
                  </Button>
                  {allowAutofirma && (
                    <Button size="sm" colorScheme="blue" variant="outline" isLoading={isStartingAutofirma} loadingText="Preparando..." onClick={onStartAutofirma}>
                      Firmar con AutoFirma
                    </Button>
                  )}
                </HStack>
              )}
            </Box>
          </>
        )}
      </Stack>
    </Box>
  );
};
