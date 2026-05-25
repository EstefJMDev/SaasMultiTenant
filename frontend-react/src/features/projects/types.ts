export type ProjectRead = {
  id: number;
  tenant_id: number;
  department_id: number;
  name: string;
  description?: string | null;
  project_type: string;
  start_date: string;
  end_date: string | null;
  duration_months: number;
  loan_percent: number;
  subsidy_percent: number;
  is_active: boolean;
  created_at: string;
};
