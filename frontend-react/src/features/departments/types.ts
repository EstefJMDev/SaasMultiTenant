export type DepartmentRead = {
  id: number;
  tenant_id: number;
  name: string;
  description?: string | null;
  manager_id: number | null;
  is_active: boolean;
  project_allocation_percentage: string;
  menu_visibility: string;
  created_at: string;
};
