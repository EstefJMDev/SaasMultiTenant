import type { ErpProjectUpdate } from "@api/erpManagement";
import type { ErpProject as ErpProjectApi } from "@entities/projects";

interface ResolveTenantIdParams {
  isSuperAdmin: boolean;
  tenantId?: number | null;
  selectedProject: ErpProjectApi;
  projects: ErpProjectApi[];
}

export const resolveTenantIdForUpdate = ({
  isSuperAdmin,
  tenantId,
  selectedProject,
  projects,
}: ResolveTenantIdParams) =>
  isSuperAdmin
    ? selectedProject.tenant_id ??
      projects.find((project) => project.id === selectedProject.id)?.tenant_id ??
      undefined
    : tenantId ??
      selectedProject.tenant_id ??
      projects.find((project) => project.id === selectedProject.id)?.tenant_id ??
      undefined;

interface BuildProjectUpdatePayloadParams {
  editName: string;
  editDescription: string;
  editProjectType: string;
  editDepartmentId: number | "";
  editStart: string;
  editEnd: string;
  editLoanPercent: string;
  editSubsidyPercent: string;
  editActive: boolean;
}

type ProjectType = NonNullable<ErpProjectUpdate["project_type"]>;

const isProjectType = (value: string): value is ProjectType =>
  value === "regional" || value === "nacional" || value === "internacional";

export const buildProjectUpdatePayload = ({
  editName,
  editDescription,
  editProjectType,
  editDepartmentId,
  editStart,
  editEnd,
  editLoanPercent,
  editSubsidyPercent,
  editActive,
}: BuildProjectUpdatePayloadParams): ErpProjectUpdate => ({
  name: editName.trim(),
  description: editDescription.trim() || null,
  project_type: isProjectType(editProjectType) ? editProjectType : null,
  department_id: editDepartmentId === "" ? null : editDepartmentId,
  start_date: editStart || null,
  end_date: editEnd || null,
  loan_percent: editLoanPercent ? Number(editLoanPercent) : null,
  subsidy_percent: editSubsidyPercent ? Number(editSubsidyPercent) : 0,
  is_active: editActive,
});
