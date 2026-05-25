import { apiClient } from "@shared/api/client";

export interface Department {
  id: number;
  tenant_id: number;
  name: string;
  description?: string | null;
  manager_id?: number | null;
  is_active: boolean;
  created_at: string;
  project_allocation_percentage?: number | null;
  menu_visibility?: DepartmentMenuVisibility;
  can_create_comparative: boolean;
  can_edit_comparative: boolean;
  can_delete_comparative: boolean;
  can_approve_comparative: boolean;
  can_reject_comparative: boolean;
  can_view_contract?: boolean;
  can_edit_contract?: boolean;
  can_regenerate_contract?: boolean;
  can_approve_contract?: boolean;
  can_reject_contract?: boolean;
  can_view_worksite?: boolean;
  can_edit_worksite?: boolean;
  can_view_provider?: boolean;
  can_edit_provider?: boolean;
}

export interface DepartmentMenuVisibility {
  dashboard: boolean;
  erp: boolean;
  erp_time_control: boolean;
  erp_tasks: boolean;
  erp_projects: boolean;
  erp_external_collaborations: boolean;
  erp_simulations: boolean;
  erp_invoices: boolean;
  work_management: boolean;
  work_contracts: boolean;
  work_comparatives: boolean;
  work_worksites: boolean;
  work_providers: boolean;
  legal: boolean;
  legal_contracts: boolean;
  administration_department: boolean;
  administration_contracts: boolean;
  administration_worksites: boolean;
  administration_providers: boolean;
  hr: boolean;
  hr_departments: boolean;
  hr_employees: boolean;
  hr_positions: boolean;
  hr_talent: boolean;
  users: boolean;
  tools: boolean;
  tenant_settings: boolean;
  settings: boolean;
  settings_branding: boolean;
  settings_department_emails: boolean;
  audit_logs: boolean;
  support: boolean;
}

export interface EmployeeProfile {
  id: number;
  tenant_id: number;
  user_id?: number | null;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  email?: string | null;
  hourly_rate?: number | null;
  available_hours?: number | null;
  availability_percentage?: number | null;
  position_id?: number | null;
  director_tecnico_id?: number | null;
  titulacion?: string | null;
  employment_type: string;
  hire_date?: string | null;
  end_date?: string | null;
  is_active: boolean;
  created_at: string;
  primary_department_id?: number | null;
  department_allocations?: EmployeeDepartmentAllocation[] | null;
}

export type PositionRoleCode = "JO" | "DT" | null;

export interface Position {
  id: number;
  tenant_id: number;
  department_id?: number | null;
  name: string;
  level: number;
  role_code?: PositionRoleCode;
  can_create_comparative: boolean;
  can_edit_comparative: boolean;
  can_delete_comparative: boolean;
  can_approve_comparative: boolean;
  can_reject_comparative: boolean;
  can_view_all_comparatives: boolean;
  full_approver: boolean;
  can_view_contract?: boolean;
  can_edit_contract?: boolean;
  can_regenerate_contract?: boolean;
  can_approve_contract?: boolean;
  can_reject_contract?: boolean;
  can_view_worksite?: boolean;
  can_edit_worksite?: boolean;
  can_view_provider?: boolean;
  can_edit_provider?: boolean;
  is_active: boolean;
  created_at: string;
}

export interface PositionCreateInput {
  name: string;
  department_id?: number | null;
  level?: number;
  role_code?: PositionRoleCode;
  can_create_comparative?: boolean;
  can_edit_comparative?: boolean;
  can_delete_comparative?: boolean;
  can_approve_comparative?: boolean;
  can_reject_comparative?: boolean;
  full_approver?: boolean;
  can_view_contract?: boolean;
  can_edit_contract?: boolean;
  can_regenerate_contract?: boolean;
  can_approve_contract?: boolean;
  can_reject_contract?: boolean;
  can_view_worksite?: boolean;
  can_edit_worksite?: boolean;
  can_view_provider?: boolean;
  can_edit_provider?: boolean;
  is_active?: boolean;
}

export interface PositionUpdateInput {
  name?: string;
  department_id?: number | null;
  level?: number;
  role_code?: PositionRoleCode;
  can_create_comparative?: boolean;
  can_edit_comparative?: boolean;
  can_delete_comparative?: boolean;
  can_approve_comparative?: boolean;
  can_reject_comparative?: boolean;
  full_approver?: boolean;
  can_view_contract?: boolean;
  can_edit_contract?: boolean;
  can_regenerate_contract?: boolean;
  can_approve_contract?: boolean;
  can_reject_contract?: boolean;
  can_view_worksite?: boolean;
  can_edit_worksite?: boolean;
  can_view_provider?: boolean;
  can_edit_provider?: boolean;
  is_active?: boolean;
}

export interface DirectorTecnicoOption {
  id: number;
  full_name: string;
}

export interface EmployeeYearAvailability {
  id: number;
  tenant_id: number;
  employee_id: number;
  year: number;
  available_hours?: number | null;
  availability_percentage?: number | null;
  hourly_rate?: number | null;
  created_at: string;
  updated_at: string;
}

export interface EmployeeYearAvailabilityUpsertInput {
  year: number;
  available_hours?: number | null;
  availability_percentage?: number | null;
  hourly_rate?: number | null;
}

export interface EmployeeDepartmentAllocation {
  department_id: number;
  percentage: number;
  is_primary: boolean;
}

export interface HeadcountItem {
  department_id: number | null;
  department_name: string | null;
  total_employees: number;
}

export interface DepartmentCreateInput {
  name: string;
  description?: string;
  manager_id?: number | null;
  is_active?: boolean;
  project_allocation_percentage?: number | null;
  menu_visibility?: DepartmentMenuVisibility;
  can_create_comparative?: boolean;
  can_edit_comparative?: boolean;
  can_delete_comparative?: boolean;
  can_approve_comparative?: boolean;
  can_reject_comparative?: boolean;
  can_view_contract?: boolean;
  can_edit_contract?: boolean;
  can_regenerate_contract?: boolean;
  can_approve_contract?: boolean;
  can_reject_contract?: boolean;
  can_view_worksite?: boolean;
  can_edit_worksite?: boolean;
  can_view_provider?: boolean;
  can_edit_provider?: boolean;
}

export interface DepartmentCreatePayload {
  data: DepartmentCreateInput;
  tenantId?: number;
}

export interface DepartmentUpdateInput {
  name?: string;
  description?: string | null;
  manager_id?: number | null;
  is_active?: boolean;
  project_allocation_percentage?: number | null;
  menu_visibility?: DepartmentMenuVisibility;
  can_create_comparative?: boolean;
  can_edit_comparative?: boolean;
  can_delete_comparative?: boolean;
  can_approve_comparative?: boolean;
  can_reject_comparative?: boolean;
  can_view_contract?: boolean;
  can_edit_contract?: boolean;
  can_regenerate_contract?: boolean;
  can_approve_contract?: boolean;
  can_reject_contract?: boolean;
  can_view_worksite?: boolean;
  can_edit_worksite?: boolean;
  can_view_provider?: boolean;
  can_edit_provider?: boolean;
}

export interface DepartmentUpdatePayload {
  departmentId: number;
  data: DepartmentUpdateInput;
}

export interface EmployeeCreateInput {
  user_id?: number | null;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  email?: string;
  hourly_rate?: number;
  available_hours?: number | null;
  availability_percentage?: number | null;
  position_id?: number | null;
  director_tecnico_id?: number | null;
  titulacion?: string;
  employment_type?: string;
  primary_department_id?: number | null;
  department_allocations?: EmployeeDepartmentAllocation[] | null;
  is_active?: boolean;
}

export interface EmployeeCreatePayload {
  data: EmployeeCreateInput;
  tenantId?: number;
}

export interface EmployeeUpdateInput {
  first_name?: string;
  last_name?: string;
  full_name?: string;
  email?: string;
  hourly_rate?: number;
  available_hours?: number | null;
  availability_percentage?: number | null;
  position_id?: number | null;
  director_tecnico_id?: number | null;
  position?: string;
  titulacion?: string;
  employment_type?: string;
  primary_department_id?: number | null;
  department_allocations?: EmployeeDepartmentAllocation[] | null;
  is_active?: boolean;
}

export interface EmployeeUpdatePayload {
  profileId: number;
  data: EmployeeUpdateInput;
}

export interface EmployeeAllocation {
  id: number;
  tenant_id: number;
  employee_id: number;
  department_id?: number | null;
  project_id?: number | null;
  milestone?: string | null;
  year?: number | null;
  allocated_hours?: number | null;
  allocation_percentage?: number | null;
  notes?: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface EmployeeAllocationCreateInput {
  tenant_id: number;
  employee_id: number;
  department_id?: number | null;
  project_id?: number | null;
  milestone?: string | null;
  year?: number | null;
  allocated_hours?: number | null;
  allocation_percentage?: number | null;
  notes?: string | null;
  override_limit_authorized?: boolean;
}

export interface EmployeeAllocationUpdateInput {
  department_id?: number | null;
  project_id?: number | null;
  milestone?: string | null;
  year?: number | null;
  allocated_hours?: number | null;
  allocation_percentage?: number | null;
  notes?: string | null;
  override_limit_authorized?: boolean;
}

export interface AllocationFilters {
  tenantId?: number;
  projectId?: number;
  employeeId?: number;
  year?: number;
}

const buildTenantHeaders = (tenantId?: number | null) =>
  tenantId
    ? {
        headers: {
          "X-Tenant-Id": tenantId.toString(),
        },
      }
    : undefined;

export async function fetchDepartments(
  tenantId?: number | null,
): Promise<Department[]> {
  const response = await apiClient.get<Department[]>("/api/v1/hr/departments", {
    ...(buildTenantHeaders(tenantId) ?? {}),
  });
  return response.data;
}

export async function createDepartment(
  payload: DepartmentCreatePayload,
): Promise<Department> {
  const { data, tenantId } = payload;
  const response = await apiClient.post<Department>(
    "/api/v1/hr/departments",
    data,
    {
      ...(buildTenantHeaders(tenantId) ?? {}),
    },
  );
  return response.data;
}

export async function updateDepartment(
  payload: DepartmentUpdatePayload,
): Promise<Department> {
  const { departmentId, data } = payload;
  const response = await apiClient.patch<Department>(
    `/api/v1/hr/departments/${departmentId}`,
    data,
  );
  return response.data;
}

export async function deleteDepartment(
  departmentId: number,
  cascade: boolean = true,
): Promise<void> {
  await apiClient.delete(`/api/v1/hr/departments/${departmentId}`, {
    params: { cascade },
  });
}

export async function fetchDirectoresTecnicos(
  tenantId?: number | null,
): Promise<DirectorTecnicoOption[]> {
  const response = await apiClient.get<DirectorTecnicoOption[]>(
    "/api/v1/hr/employees/directores-tecnicos",
    { ...(buildTenantHeaders(tenantId) ?? {}) },
  );
  return response.data;
}

export async function fetchEmployees(
  tenantId?: number | null,
  year?: number | null,
): Promise<EmployeeProfile[]> {
  const config: {
    headers?: Record<string, string>;
    params?: Record<string, number>;
  } = {
    ...(buildTenantHeaders(tenantId) ?? {}),
  };
  if (year != null) {
    config.params = { year };
  }

  const response = await apiClient.get<EmployeeProfile[]>(
    "/api/v1/hr/employees",
    config,
  );
  return response.data;
}

export async function createEmployee(
  payload: EmployeeCreatePayload,
): Promise<EmployeeProfile> {
  const { data, tenantId } = payload;
  const response = await apiClient.post<EmployeeProfile>(
    "/api/v1/hr/employees",
    data,
    {
      ...(buildTenantHeaders(tenantId) ?? {}),
    },
  );
  return response.data;
}

export async function updateEmployee(
  payload: EmployeeUpdatePayload,
): Promise<EmployeeProfile> {
  const { profileId, data } = payload;
  const response = await apiClient.patch<EmployeeProfile>(
    `/api/v1/hr/employees/${profileId}`,
    data,
  );
  return response.data;
}

export async function deleteEmployee(profileId: number): Promise<void> {
  await apiClient.delete(`/api/v1/hr/employees/${profileId}`);
}

export async function upsertEmployeeYearAvailability(
  profileId: number,
  year: number,
  data: EmployeeYearAvailabilityUpsertInput,
  tenantId?: number | null,
): Promise<EmployeeYearAvailability> {
  const response = await apiClient.put<EmployeeYearAvailability>(
    `/api/v1/hr/employees/${profileId}/availability/${year}`,
    data,
    {
      ...(buildTenantHeaders(tenantId) ?? {}),
    },
  );
  return response.data;
}

export async function fetchEmployeeAllocations(
  filters: AllocationFilters = {},
): Promise<EmployeeAllocation[]> {
  const params: Record<string, number> = {};
  if (filters.projectId) params.project_id = filters.projectId;
  if (filters.employeeId) params.employee_id = filters.employeeId;
  if (filters.year) params.year = filters.year;

  const response = await apiClient.get<EmployeeAllocation[]>(
    "/api/v1/hr/allocations",
    {
      params: Object.keys(params).length ? params : undefined,
      ...(buildTenantHeaders(filters.tenantId ?? null) ?? {}),
    },
  );
  return response.data;
}

export async function createEmployeeAllocation(
  data: EmployeeAllocationCreateInput,
): Promise<EmployeeAllocation> {
  const response = await apiClient.post<EmployeeAllocation>(
    "/api/v1/hr/allocations",
    data,
  );
  return response.data;
}

export async function updateEmployeeAllocation(
  allocationId: number,
  data: EmployeeAllocationUpdateInput,
): Promise<EmployeeAllocation> {
  const response = await apiClient.patch<EmployeeAllocation>(
    `/api/v1/hr/allocations/${allocationId}`,
    data,
  );
  return response.data;
}

export async function deleteEmployeeAllocation(
  allocationId: number,
): Promise<void> {
  await apiClient.delete(`/api/v1/hr/allocations/${allocationId}`);
}

export async function fetchHeadcount(
  tenantId?: number,
): Promise<HeadcountItem[]> {
  const response = await apiClient.get<HeadcountItem[]>(
    "/api/v1/hr/reports/headcount",
    {
      ...(buildTenantHeaders(tenantId ?? null) ?? {}),
    },
  );
  return response.data;
}

// ────────────────────────────────────────────────────────────────────────────
// Positions (puestos)
// ────────────────────────────────────────────────────────────────────────────

export async function fetchPositions(
  tenantId?: number | null,
  includeInactive: boolean = false,
): Promise<Position[]> {
  const config: {
    headers?: Record<string, string>;
    params?: Record<string, boolean>;
  } = {
    ...(buildTenantHeaders(tenantId) ?? {}),
  };
  if (includeInactive) {
    config.params = { include_inactive: true };
  }
  const response = await apiClient.get<Position[]>("/api/v1/org/positions", config);
  return response.data;
}

export async function createPosition(
  data: PositionCreateInput,
  tenantId?: number | null,
): Promise<Position> {
  const response = await apiClient.post<Position>(
    "/api/v1/org/positions",
    data,
    {
      ...(buildTenantHeaders(tenantId) ?? {}),
    },
  );
  return response.data;
}

export async function updatePosition(
  positionId: number,
  data: PositionUpdateInput,
): Promise<Position> {
  const response = await apiClient.patch<Position>(
    `/api/v1/org/positions/${positionId}`,
    data,
  );
  return response.data;
}

export async function deletePosition(positionId: number): Promise<void> {
  await apiClient.delete(`/api/v1/org/positions/${positionId}`);
}
