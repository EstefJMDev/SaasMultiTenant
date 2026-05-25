from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field


class DepartmentMenuVisibility(BaseModel):
    dashboard: bool = True
    erp: bool = True
    erp_time_control: bool = True
    erp_tasks: bool = True
    erp_projects: bool = True
    erp_external_collaborations: bool = True
    erp_simulations: bool = True
    erp_invoices: bool = True
    work_management: bool = True
    work_contracts: bool = True
    work_comparatives: bool = True
    work_worksites: bool = True
    work_providers: bool = True
    legal: bool = True
    legal_contracts: bool = True
    administration_department: bool = True
    administration_contracts: bool = True
    administration_worksites: bool = True
    administration_providers: bool = True
    hr: bool = True
    hr_departments: bool = True
    hr_employees: bool = True
    hr_positions: bool = True
    hr_talent: bool = True
    users: bool = True
    tools: bool = True
    tenant_settings: bool = True
    settings: bool = True
    settings_branding: bool = True
    settings_department_emails: bool = True
    audit_logs: bool = True
    support: bool = True


class DepartmentBase(BaseModel):
    name: str
    description: Optional[str] = None
    manager_id: Optional[int] = None
    is_active: bool = True
    project_allocation_percentage: Decimal = Decimal(100)
    menu_visibility: DepartmentMenuVisibility = Field(
        default_factory=DepartmentMenuVisibility
    )
    can_create_comparative: bool = False
    can_edit_comparative: bool = False
    can_delete_comparative: bool = False
    can_approve_comparative: bool = False
    can_reject_comparative: bool = False
    can_view_contract: bool = False
    can_edit_contract: bool = False
    can_regenerate_contract: bool = False
    can_approve_contract: bool = False
    can_reject_contract: bool = False
    can_view_worksite: bool = False
    can_edit_worksite: bool = False
    can_view_provider: bool = False
    can_edit_provider: bool = False


class DepartmentCreate(DepartmentBase):
    pass


class DepartmentUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    manager_id: Optional[int] = None
    is_active: Optional[bool] = None
    project_allocation_percentage: Optional[Decimal] = None
    menu_visibility: Optional[DepartmentMenuVisibility] = None
    can_create_comparative: Optional[bool] = None
    can_edit_comparative: Optional[bool] = None
    can_delete_comparative: Optional[bool] = None
    can_approve_comparative: Optional[bool] = None
    can_reject_comparative: Optional[bool] = None
    can_view_contract: Optional[bool] = None
    can_edit_contract: Optional[bool] = None
    can_regenerate_contract: Optional[bool] = None
    can_approve_contract: Optional[bool] = None
    can_reject_contract: Optional[bool] = None
    can_view_worksite: Optional[bool] = None
    can_edit_worksite: Optional[bool] = None
    can_view_provider: Optional[bool] = None
    can_edit_provider: Optional[bool] = None


class DepartmentRead(DepartmentBase):
    id: int
    tenant_id: int
    created_at: datetime


class EmployeeProfileBase(BaseModel):
    user_id: Optional[int] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    full_name: Optional[str] = None
    email: Optional[str] = None
    hourly_rate: Optional[Decimal] = None
    available_hours: Optional[Decimal] = None
    availability_percentage: Optional[Decimal] = None
    position_id: Optional[int] = None
    director_tecnico_id: Optional[int] = None
    titulacion: Optional[str] = None
    employment_type: str = "permanent"
    hire_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    is_active: bool = True


class EmployeeDepartmentAllocationInput(BaseModel):
    department_id: int
    percentage: Decimal
    is_primary: bool = False


class EmployeeDepartmentAllocationRead(BaseModel):
    department_id: int
    percentage: Decimal
    is_primary: bool


class EmployeeProfileCreate(EmployeeProfileBase):
    primary_department_id: Optional[int] = None
    department_allocations: Optional[list[EmployeeDepartmentAllocationInput]] = None


class EmployeeProfileUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    full_name: Optional[str] = None
    email: Optional[str] = None
    hourly_rate: Optional[Decimal] = None
    available_hours: Optional[Decimal] = None
    availability_percentage: Optional[Decimal] = None
    position_id: Optional[int] = None
    director_tecnico_id: Optional[int] = None
    titulacion: Optional[str] = None
    employment_type: Optional[str] = None
    hire_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    is_active: Optional[bool] = None
    primary_department_id: Optional[int] = None
    department_allocations: Optional[list[EmployeeDepartmentAllocationInput]] = None


class EmployeeProfileRead(EmployeeProfileBase):
    id: int
    tenant_id: int
    created_at: datetime
    primary_department_id: Optional[int] = None
    department_allocations: list[EmployeeDepartmentAllocationRead] = Field(default_factory=list)


class HeadcountItem(BaseModel):
    department_id: Optional[int]
    department_name: Optional[str]
    total_employees: int


class EmployeeAllocationBase(BaseModel):
    employee_id: int
    department_id: Optional[int] = None
    project_id: Optional[int] = None
    milestone: Optional[str] = None
    year: int
    allocated_hours: Optional[Decimal] = None
    allocation_percentage: Optional[Decimal] = None
    notes: Optional[str] = None


class EmployeeAllocationCreate(EmployeeAllocationBase):
    tenant_id: int
    override_limit_authorized: bool = False


class EmployeeAllocationUpdate(BaseModel):
    department_id: Optional[int] = None
    project_id: Optional[int] = None
    milestone: Optional[str] = None
    year: Optional[int] = None
    allocated_hours: Optional[Decimal] = None
    allocation_percentage: Optional[Decimal] = None
    notes: Optional[str] = None
    override_limit_authorized: Optional[bool] = None


class EmployeeAllocationRead(EmployeeAllocationBase):
    id: int
    tenant_id: int
    created_at: datetime
    updated_at: datetime


class EmployeeYearAvailabilityBase(BaseModel):
    year: int
    available_hours: Optional[Decimal] = None
    availability_percentage: Optional[Decimal] = None
    hourly_rate: Optional[Decimal] = None


class EmployeeYearAvailabilityUpsert(EmployeeYearAvailabilityBase):
    pass


class EmployeeYearAvailabilityRead(EmployeeYearAvailabilityBase):
    id: int
    tenant_id: int
    employee_id: int
    created_at: datetime
    updated_at: datetime


class PositionBase(BaseModel):
    name: str
    department_id: Optional[int] = None
    level: int = 0
    role_code: Optional[str] = None
    can_create_comparative: bool = False
    can_edit_comparative: bool = False
    can_delete_comparative: bool = False
    can_approve_comparative: bool = False
    can_reject_comparative: bool = False
    full_approver: bool = False
    can_view_contract: bool = False
    can_edit_contract: bool = False
    can_regenerate_contract: bool = False
    can_approve_contract: bool = False
    can_reject_contract: bool = False
    can_view_worksite: bool = False
    can_edit_worksite: bool = False
    can_view_provider: bool = False
    can_edit_provider: bool = False
    is_active: bool = True


class PositionCreate(PositionBase):
    pass


class PositionUpdate(BaseModel):
    name: Optional[str] = None
    department_id: Optional[int] = None
    level: Optional[int] = None
    role_code: Optional[str] = None
    can_create_comparative: Optional[bool] = None
    can_edit_comparative: Optional[bool] = None
    can_delete_comparative: Optional[bool] = None
    can_approve_comparative: Optional[bool] = None
    can_reject_comparative: Optional[bool] = None
    full_approver: Optional[bool] = None
    can_view_contract: Optional[bool] = None
    can_edit_contract: Optional[bool] = None
    can_regenerate_contract: Optional[bool] = None
    can_approve_contract: Optional[bool] = None
    can_reject_contract: Optional[bool] = None
    can_view_worksite: Optional[bool] = None
    can_edit_worksite: Optional[bool] = None
    can_view_provider: Optional[bool] = None
    can_edit_provider: Optional[bool] = None
    is_active: Optional[bool] = None


class PositionRead(PositionBase):
    id: int
    tenant_id: int
    created_at: datetime
