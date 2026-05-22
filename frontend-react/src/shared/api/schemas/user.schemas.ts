import { z } from "zod";

export const CurrentUserSchema = z.object({
  id: z.number(),
  email: z.string().email(),
  full_name: z.string().nullable(),
  is_active: z.boolean(),
  is_super_admin: z.boolean(),
  tenant_id: z.number().nullable(),
  role_id: z.number().nullable(),
  role_name: z.string().nullable().optional(),
  permissions: z.array(z.string()).optional(),
  language: z.string().nullable().optional(),
  avatar_url: z.string().nullable().optional(),
  avatar_data: z.string().nullable().optional(),
  department_nav_config: z.record(z.string(), z.boolean()).nullable().optional(),
  created_at: z.string(),
  // Flags derivados de Position (organigrama).
  position_id: z.number().nullable().optional(),
  position_name: z.string().nullable().optional(),
  can_create_comparative: z.boolean().optional(),
  can_edit_comparative: z.boolean().optional(),
  can_delete_comparative: z.boolean().optional(),
  can_approve_comparative: z.boolean().optional(),
  can_reject_comparative: z.boolean().optional(),
  can_view_all_comparatives: z.boolean().optional(),
  can_view_contract: z.boolean().optional(),
  can_edit_contract: z.boolean().optional(),
  can_regenerate_contract: z.boolean().optional(),
  can_approve_contract: z.boolean().optional(),
  can_reject_contract: z.boolean().optional(),
  can_view_worksite: z.boolean().optional(),
  can_edit_worksite: z.boolean().optional(),
  can_view_provider: z.boolean().optional(),
  can_edit_provider: z.boolean().optional(),
});

export const TenantUserSummarySchema = z.object({
  id: z.number(),
  email: z.string().email(),
  full_name: z.string().nullable(),
  is_active: z.boolean(),
});

export const TenantOptionSchema = z.object({
  id: z.number(),
  name: z.string(),
  subdomain: z.string(),
  is_active: z.boolean(),
});

export const InvitationValidationSchema = z.object({
  email: z.string().email(),
  full_name: z.string().nullable().optional(),
  tenant_name: z.string(),
  role_name: z.string(),
  is_valid: z.boolean(),
  is_used: z.boolean(),
  is_expired: z.boolean(),
});

export type CurrentUser = z.infer<typeof CurrentUserSchema>;
export type TenantUserSummary = z.infer<typeof TenantUserSummarySchema>;
export type TenantOption = z.infer<typeof TenantOptionSchema>;
export type InvitationValidation = z.infer<typeof InvitationValidationSchema>;
