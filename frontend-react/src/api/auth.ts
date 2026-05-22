import { apiClient } from "@shared/api/client";
import { parseApiResponse } from "@shared/api/parseResponse";
import {
  LoginResponseSchema,
  MFAVerifyResponseSchema,
  type LoginResponse,
  type MFAVerifyResponse,
} from "@shared/api/schemas/auth.schemas";

export type { LoginResponse, MFAVerifyResponse };

export async function login(email: string, password: string): Promise<LoginResponse> {
  const form = new URLSearchParams();
  form.append("username", email);
  form.append("password", password);

  const response = await apiClient.post("/api/v1/auth/login", form, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

  return parseApiResponse(LoginResponseSchema, response.data, "auth/login");
}

export async function verifyMFA(username: string, mfaCode: string): Promise<MFAVerifyResponse> {
  const response = await apiClient.post("/api/v1/auth/mfa/verify", {
    username,
    mfa_code: mfaCode,
  });
  return parseApiResponse(MFAVerifyResponseSchema, response.data, "auth/mfa/verify");
}


