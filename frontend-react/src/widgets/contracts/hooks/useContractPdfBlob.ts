import { useCallback, useEffect, useRef, useState } from "react";

import { fetchContractDocumentBlob } from "@entities/contracts";

export type ContractDocType = "COMPARATIVE" | "CONTRACT" | "SIGNED";

interface UseContractPdfBlobOptions {
  contractId?: number | null;
  docType: ContractDocType;
  tenantId?: number;
  enabled?: boolean;
  templateId?: number | null;
  documentVersion?: string | number | null;
  pollOnPendingGeneration?: boolean;
}

interface UseContractPdfBlobResult {
  blobUrl: string | null;
  filename: string | null;
  isLoading: boolean;
  error: string | null;
  errorStatus: number | null;
  refresh: () => void;
  download: () => void;
}

async function extractDocumentErrorMessage(err: unknown): Promise<string | null> {
  const response = (err as { response?: { data?: unknown } })?.response;
  const data = response?.data;
  if (data instanceof Blob) {
    const rawText = (await data.text()).trim();
    if (!rawText) return null;
    try {
      const parsed = JSON.parse(rawText) as { detail?: unknown };
      if (typeof parsed.detail === "string" && parsed.detail.trim()) {
        return parsed.detail.trim();
      }
    } catch {
      return rawText;
    }
    return rawText;
  }

  const detail = (response as { data?: { detail?: unknown } } | undefined)?.data?.detail;
  return typeof detail === "string" && detail.trim() ? detail.trim() : null;
}

const PENDING_TEMPLATE_MESSAGE = "Pendiente de seleccionar plantilla.";
const PENDING_DOCUMENT_MESSAGE = "Plantilla asignada, documento pendiente de generar.";

function isPendingDocumentMessage(message: string | null): boolean {
  return (message ?? "").trim().toLowerCase() === PENDING_DOCUMENT_MESSAGE.toLowerCase();
}

function isPendingTemplateMessage(message: string | null): boolean {
  return (message ?? "").trim().toLowerCase() === PENDING_TEMPLATE_MESSAGE.toLowerCase();
}

export function useContractPdfBlob({
  contractId,
  docType,
  tenantId,
  enabled = true,
  templateId,
  documentVersion,
  pollOnPendingGeneration = false,
}: UseContractPdfBlobOptions): UseContractPdfBlobResult {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const currentUrlRef = useRef<string | null>(null);
  const pendingPollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPollAttemptsRef = useRef(0);

  const clearPendingPollTimeout = useCallback(() => {
    if (pendingPollTimeoutRef.current) {
      clearTimeout(pendingPollTimeoutRef.current);
      pendingPollTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    pendingPollAttemptsRef.current = 0;
    clearPendingPollTimeout();
  }, [contractId, templateId, documentVersion, docType, clearPendingPollTimeout]);

  useEffect(() => {
    if (!enabled || !contractId) {
      return;
    }
    let cancelled = false;
    clearPendingPollTimeout();

    const loadDocument = async () => {
      setIsLoading(true);
      setError(null);
      setErrorStatus(null);
      try {
        const { blob, filename: fname } = await fetchContractDocumentBlob(
          contractId,
          docType,
          tenantId,
          true,
        );
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        if (currentUrlRef.current) {
          URL.revokeObjectURL(currentUrlRef.current);
        }
        currentUrlRef.current = url;
        setBlobUrl(url);
        setFilename(fname ?? `CT-${contractId}-${docType}.pdf`);
      } catch (err: unknown) {
        if (cancelled) return;
        const status = (err as { response?: { status?: number } })?.response?.status ?? null;
        const backendMessage = await extractDocumentErrorMessage(err);
        setErrorStatus(status);
        if (status === 404) {
          setError(backendMessage ?? "Documento no generado todavia.");
          if (
            pollOnPendingGeneration &&
            templateId != null &&
            isPendingDocumentMessage(backendMessage) &&
            pendingPollAttemptsRef.current < 8
          ) {
            pendingPollAttemptsRef.current += 1;
            pendingPollTimeoutRef.current = setTimeout(() => {
              setReloadToken((token) => token + 1);
            }, 1500);
          } else if (isPendingTemplateMessage(backendMessage)) {
            pendingPollAttemptsRef.current = 0;
          }
        } else if (status === 401 || status === 403) {
          setError("No tienes permisos para ver este documento.");
        } else {
          setError(backendMessage ?? "No se pudo cargar el documento.");
        }
        setBlobUrl(null);
        setFilename(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void loadDocument();

    return () => {
      cancelled = true;
      clearPendingPollTimeout();
    };
  }, [
    clearPendingPollTimeout,
    contractId,
    docType,
    documentVersion,
    enabled,
    pollOnPendingGeneration,
    reloadToken,
    templateId,
    tenantId,
  ]);

  useEffect(() => {
    return () => {
      clearPendingPollTimeout();
      if (currentUrlRef.current) {
        URL.revokeObjectURL(currentUrlRef.current);
        currentUrlRef.current = null;
      }
    };
  }, [clearPendingPollTimeout]);

  const refresh = useCallback(() => {
    setReloadToken((t) => t + 1);
  }, []);

  const download = useCallback(() => {
    if (!blobUrl || !filename) return;
    const anchor = document.createElement("a");
    anchor.href = blobUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  }, [blobUrl, filename]);

  return { blobUrl, filename, isLoading, error, errorStatus, refresh, download };
}
