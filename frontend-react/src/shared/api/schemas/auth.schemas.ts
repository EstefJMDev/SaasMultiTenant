import { z } from "zod";

export const LoginResponseSchema = z.object({
  mfa_required: z.boolean(),
  access_token: z.string().optional(),
  token_type: z.string().optional(),
  message: z.string().nullable().optional(),
});

export const MFAVerifyResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.string(),
  mfa_required: z.boolean(),
});

export type LoginResponse = z.infer<typeof LoginResponseSchema>;
export type MFAVerifyResponse = z.infer<typeof MFAVerifyResponseSchema>;
