import { apiClient } from "@shared/api/client";
import { AxiosError } from "axios";

export interface SignaturitSignatureRequest {
  id: number;
  tenant_id: number;
  contract_id: number;
  provider: string;
  status: string;
  provider_signature_id?: string | null;
  provider_document_id?: string | null;
  signer_name?: string | null;
  signer_email?: string | null;
  source_pdf_path?: string | null;
  signed_pdf_path?: string | null;
  audit_trail_path?: string | null;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
}

export interface SignaturitStartResponse {
  request: SignaturitSignatureRequest;
  signing_url?: string | null;
  provider_signature_id?: string | null;
  email_sent?: boolean | null;
  email_recipient?: string | null;
}

export type SignatureProvider = "SIGNATURIT" | "AUTOFIRMA";

export interface SignatureRequestV2 {
  id: string;
  tenant_id: number;
  contract_id: number;
  provider: SignatureProvider;
  status: string;
  signer_name?: string | null;
  signer_email?: string | null;
  contract_snapshot_id: string;
  pdf_original_sha256: string;
  signed_pdf_sha256?: string | null;
  expires_at?: string | null;
  signed_at?: string | null;
  failure_reason?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TenantSignatureConfig {
  tenant_id: number;
  allow_signaturit: boolean;
  allow_autofirma: boolean;
  signature_provider_default: SignatureProvider;
  autofirma_session_ttl_minutes: number;
  autofirma_tsa_enabled: boolean;
  autofirma_tsa_url?: string | null;
}

const buildForbiddenSignatureConfig = (
  tenantId?: number,
): TenantSignatureConfig => ({
  tenant_id: tenantId ?? 0,
  allow_signaturit: false,
  allow_autofirma: false,
  signature_provider_default: "SIGNATURIT",
  autofirma_session_ttl_minutes: 0,
  autofirma_tsa_enabled: false,
  autofirma_tsa_url: null,
});

export interface SignatureCreateResponseV2 {
  request: SignatureRequestV2;
  provider_payload: Record<string, unknown>;
}

export interface AutofirmaPresignResponse {
  session_id: string;
  algorithm: string;
  format: string;
  to_be_signed_b64: string;
  protocol_url: string;
  expires_at: string;
}

export interface PublicSignatureStatusResponse {
  id: string;
  status: string;
  expires_at?: string | null;
  signed_at?: string | null;
  failure_reason?: string | null;
}

const buildTenantHeaders = (tenantId?: number) =>
  tenantId
    ? {
        headers: {
          "X-Tenant-Id": tenantId.toString(),
        },
      }
    : undefined;

export async function createSignaturitRequest(
  payload: {
    contract_id: number;
    signer_name: string;
    signer_email: string;
    delivery_type?: string;
    signature_mode?: "biometric" | "certificate";
    digital_certificate_name?: string;
  },
  tenantId?: number,
): Promise<SignaturitStartResponse> {
  const response = await apiClient.post<SignaturitStartResponse>(
    "/api/v1/signatures/signaturit/requests",
    payload,
    buildTenantHeaders(tenantId),
  );
  return response.data;
}

export async function createContractSignatureRequest(
  contractId: number,
  payload: {
    provider?: SignatureProvider;
    signer_name: string;
    signer_email: string;
    signer_user_id?: number;
  },
  tenantId?: number,
): Promise<SignatureCreateResponseV2> {
  const response = await apiClient.post<SignatureCreateResponseV2>(
    `/api/v1/contracts/${contractId}/signature-requests`,
    payload,
    buildTenantHeaders(tenantId),
  );
  return response.data;
}

export async function createContractAutofirmaSignatureRequest(
  contractId: number,
  payload: {
    signer_name: string;
    signer_email: string;
    signer_user_id?: number;
  },
  tenantId?: number,
): Promise<SignatureCreateResponseV2> {
  const response = await apiClient.post<SignatureCreateResponseV2>(
    `/api/v1/contracts/${contractId}/signature-requests/autofirma`,
    payload,
    buildTenantHeaders(tenantId),
  );
  return response.data;
}

export async function presignAutofirma(
  signatureRequestId: string,
  tenantId?: number,
): Promise<AutofirmaPresignResponse> {
  const response = await apiClient.post<AutofirmaPresignResponse>(
    `/api/v1/signatures/${signatureRequestId}/presign`,
    {},
    buildTenantHeaders(tenantId),
  );
  return response.data;
}

export async function submitAutofirmaClientResult(
  signatureRequestId: string,
  payload: {
    session_id: string;
    signature_b64: string;
    signed_pdf_b64?: string;
    cms_signature_b64?: string;
    cert_chain_b64?: string[];
    device_hints?: Record<string, unknown>;
  },
  tenantId?: number,
): Promise<SignatureRequestV2> {
  const response = await apiClient.post<SignatureRequestV2>(
    `/api/v1/signatures/${signatureRequestId}/client-result`,
    payload,
    buildTenantHeaders(tenantId),
  );
  return response.data;
}

export async function finalizeSignatureRequest(
  signatureRequestId: string,
  tenantId?: number,
): Promise<{
  status: string;
  signed_pdf_path?: string;
  validation_report_path?: string;
  evidence_json_path?: string;
}> {
  const response = await apiClient.post(
    `/api/v1/signatures/${signatureRequestId}/finalize`,
    {},
    buildTenantHeaders(tenantId),
  );
  return response.data;
}

export async function getSignatureRequest(
  signatureRequestId: string,
  tenantId?: number,
): Promise<SignatureRequestV2> {
  const response = await apiClient.get<SignatureRequestV2>(
    `/api/v1/signatures/${signatureRequestId}`,
    buildTenantHeaders(tenantId),
  );
  return response.data;
}

export async function getSignedPdfDownloadUrl(
  signatureRequestId: string,
  tenantId?: number,
): Promise<{ url: string; expires_at: string }> {
  const response = await apiClient.get<{ url: string; expires_at: string }>(
    `/api/v1/signatures/${signatureRequestId}/download-url`,
    buildTenantHeaders(tenantId),
  );
  return response.data;
}

export async function getTenantSignatureConfig(
  tenantId?: number,
): Promise<TenantSignatureConfig> {
  try {
    const response = await apiClient.get<TenantSignatureConfig>(
      "/api/v1/signatures/config",
      buildTenantHeaders(tenantId),
    );
    return response.data;
  } catch (error) {
    const axiosErr = error as AxiosError;
    if (axiosErr.response?.status === 403) {
      return buildForbiddenSignatureConfig(tenantId);
    }
    throw error;
  }
}

export function buildSignedPdfDownloadUrl(signatureRequestId: string): string {
  return `/api/v1/signatures/${signatureRequestId}/download`;
}

export async function publicPresignAutofirma(params: {
  signatureRequestId: string;
  tenantId: number;
  exp: number;
  sig: string;
}): Promise<AutofirmaPresignResponse> {
  const response = await apiClient.post<AutofirmaPresignResponse>(
    `/public/signatures/${params.signatureRequestId}/presign`,
    {},
    {
      params: {
        tenant_id: params.tenantId,
        exp: params.exp,
        sig: params.sig,
      },
    },
  );
  return response.data;
}

export async function publicSubmitAutofirmaClientResult(
  params: {
    signatureRequestId: string;
    tenantId: number;
    exp: number;
    sig: string;
  },
  payload: {
    session_id: string;
    signature_b64: string;
    cert_chain_b64?: string[];
    device_hints?: Record<string, unknown>;
  },
): Promise<PublicSignatureStatusResponse> {
  const response = await apiClient.post<PublicSignatureStatusResponse>(
    `/public/signatures/${params.signatureRequestId}/client-result`,
    payload,
    {
      params: {
        tenant_id: params.tenantId,
        exp: params.exp,
        sig: params.sig,
      },
    },
  );
  return response.data;
}

export async function publicGetSignatureStatus(params: {
  signatureRequestId: string;
  tenantId: number;
  exp: number;
  sig: string;
}): Promise<PublicSignatureStatusResponse> {
  const response = await apiClient.get<PublicSignatureStatusResponse>(
    `/public/signatures/${params.signatureRequestId}`,
    {
      params: {
        tenant_id: params.tenantId,
        exp: params.exp,
        sig: params.sig,
      },
    },
  );
  return response.data;
}

