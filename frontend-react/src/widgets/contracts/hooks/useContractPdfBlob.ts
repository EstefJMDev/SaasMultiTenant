import { useCallback, useEffect, useRef, useState } from "react";

import { fetchContractDocumentBlob } from "@entities/contracts";

export type ContractDocType = "COMPARATIVE" | "CONTRACT" | "SIGNED";

interface UseContractPdfBlobOptions {
  contractId?: number | null;
  docType: ContractDocType;
  tenantId?: number;
  enabled?: boolean;
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

export function useContractPdfBlob({
  contractId,
  docType,
  tenantId,
  enabled = true,
}: UseContractPdfBlobOptions): UseContractPdfBlobResult {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const currentUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !contractId) {
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    setErrorStatus(null);

    fetchContractDocumentBlob(contractId, docType, tenantId, true)
      .then(({ blob, filename: fname }) => {
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        if (currentUrlRef.current) {
          URL.revokeObjectURL(currentUrlRef.current);
        }
        currentUrlRef.current = url;
        setBlobUrl(url);
        setFilename(fname ?? `CT-${contractId}-${docType}.pdf`);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const status = (err as { response?: { status?: number } })?.response?.status ?? null;
        setErrorStatus(status);
        if (status === 404) {
          setError("Documento no generado todavía.");
        } else if (status === 401 || status === 403) {
          setError("No tienes permisos para ver este documento.");
        } else {
          setError("No se pudo cargar el documento.");
        }
        setBlobUrl(null);
        setFilename(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [contractId, docType, tenantId, enabled, reloadToken]);

  useEffect(() => {
    return () => {
      if (currentUrlRef.current) {
        URL.revokeObjectURL(currentUrlRef.current);
        currentUrlRef.current = null;
      }
    };
  }, []);

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
