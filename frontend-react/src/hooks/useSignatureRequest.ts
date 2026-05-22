import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createContractSignatureRequest,
  finalizeSignatureRequest,
  getSignatureRequest,
  presignAutofirma,
  submitAutofirmaClientResult,
  type SignatureProvider,
} from "@api/signatures";

interface CreatePayload {
  contractId: number;
  signerName: string;
  signerEmail: string;
  provider: SignatureProvider;
  tenantId?: number;
  signerUserId?: number;
}

export function useSignatureRequest() {
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: async (payload: CreatePayload) => {
      const created = await createContractSignatureRequest(
        payload.contractId,
        {
          provider: payload.provider,
          signer_name: payload.signerName,
          signer_email: payload.signerEmail,
          signer_user_id: payload.signerUserId,
        },
        payload.tenantId,
      );
      return created;
    },
  });

  const presignMutation = useMutation({
    mutationFn: async ({
      signatureRequestId,
      tenantId,
    }: {
      signatureRequestId: string;
      tenantId?: number;
    }) => presignAutofirma(signatureRequestId, tenantId),
  });

  const clientResultMutation = useMutation({
    mutationFn: async ({
      signatureRequestId,
      sessionId,
      signatureB64,
      certChainB64,
      tenantId,
      deviceHints,
    }: {
      signatureRequestId: string;
      sessionId: string;
      signatureB64: string;
      certChainB64?: string[];
      tenantId?: number;
      deviceHints?: Record<string, unknown>;
    }) =>
      submitAutofirmaClientResult(
        signatureRequestId,
        {
          session_id: sessionId,
          signature_b64: signatureB64,
          cert_chain_b64: certChainB64 ?? [],
          device_hints: deviceHints ?? {},
        },
        tenantId,
      ),
  });

  const finalizeMutation = useMutation({
    mutationFn: async ({
      signatureRequestId,
      tenantId,
    }: {
      signatureRequestId: string;
      tenantId?: number;
    }) => finalizeSignatureRequest(signatureRequestId, tenantId),
  });

  const useStatus = (signatureRequestId?: string, tenantId?: number) =>
    useQuery({
      queryKey: ["signature-request", signatureRequestId, tenantId],
      queryFn: () => getSignatureRequest(signatureRequestId!, tenantId),
      enabled: Boolean(signatureRequestId),
      refetchInterval: (query) => {
        const status = query.state.data?.status;
        if (!status) return 2000;
        if (status === "SIGNED" || status === "FAILED" || status === "EXPIRED") {
          return false;
        }
        return 2000;
      },
    });

  const invalidate = async (signatureRequestId: string, tenantId?: number) => {
    await queryClient.invalidateQueries({
      queryKey: ["signature-request", signatureRequestId, tenantId],
    });
  };

  return {
    createMutation,
    presignMutation,
    clientResultMutation,
    finalizeMutation,
    useStatus,
    invalidate,
  };
}
