from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, EmailStr


class ProjectRead(BaseModel):
    id: int
    tenant_id: Optional[int] = None
    department_id: Optional[int] = None
    name: str
    description: Optional[str] = None
    project_type: Optional[str] = None
    department_id: Optional[int] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    duration_months: Optional[int] = None
    loan_percent: Optional[float] = None
    subsidy_percent: Optional[float] = None
    is_active: bool
    created_at: datetime


class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None
    project_type: Optional[str] = None
    department_id: Optional[int] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    loan_percent: Optional[float] = None
    subsidy_percent: Optional[float] = None
    is_active: bool = True


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    project_type: Optional[str] = None
    department_id: Optional[int] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    loan_percent: Optional[float] = None
    subsidy_percent: Optional[float] = None
    is_active: Optional[bool] = None


class TaskRead(BaseModel):
    id: int
    project_id: Optional[int] = None
    subactivity_id: Optional[int] = None
    task_template_id: Optional[int] = None
    title: str
    description: Optional[str] = None
    assigned_to_id: Optional[int] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    status: str
    is_completed: bool
    created_at: datetime


class TaskCreate(BaseModel):
    project_id: Optional[int] = None
    subactivity_id: Optional[int] = None
    task_template_id: Optional[int] = None
    title: str
    description: Optional[str] = None
    assigned_to_id: Optional[int] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    status: Optional[str] = None
    is_completed: bool = False


class TaskUpdate(BaseModel):
    project_id: Optional[int] = None
    subactivity_id: Optional[int] = None
    task_template_id: Optional[int] = None
    title: Optional[str] = None
    description: Optional[str] = None
    assigned_to_id: Optional[int] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    status: Optional[str] = None
    is_completed: Optional[bool] = None


class TaskTemplateRead(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    is_active: bool
    created_at: datetime


class TaskTemplateCreate(BaseModel):
    title: str
    description: Optional[str] = None
    is_active: bool = True


class ActivityRead(BaseModel):
    id: int
    project_id: int
    assigned_to_id: Optional[int] = None
    name: str
    description: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    created_at: datetime


class ActivityCreate(BaseModel):
    project_id: int
    assigned_to_id: Optional[int] = None
    name: str
    description: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None


class ActivityUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    assigned_to_id: Optional[int] = None


class SubActivityRead(BaseModel):
    id: int
    activity_id: int
    assigned_to_id: Optional[int] = None
    name: str
    description: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    created_at: datetime


class SubActivityCreate(BaseModel):
    activity_id: int
    assigned_to_id: Optional[int] = None
    name: str
    description: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None


class SubActivityUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    assigned_to_id: Optional[int] = None


class MilestoneRead(BaseModel):
    id: int
    project_id: int
    activity_id: Optional[int] = None
    title: str
    description: Optional[str] = None
    due_date: Optional[datetime] = None
    allow_late_submission: bool
    created_at: datetime


class MilestoneCreate(BaseModel):
    project_id: int
    activity_id: Optional[int] = None
    title: str
    description: Optional[str] = None
    due_date: Optional[datetime] = None
    allow_late_submission: bool = False


class MilestoneUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    due_date: Optional[datetime] = None
    allow_late_submission: Optional[bool] = None


class DeliverableRead(BaseModel):
    id: int
    milestone_id: int
    title: str
    notes: Optional[str] = None
    link_url: Optional[str] = None
    file_id: Optional[str] = None
    submitted_at: Optional[datetime] = None
    is_late: bool
    created_at: datetime


class DeliverableCreate(BaseModel):
    milestone_id: int
    title: str
    notes: Optional[str] = None
    link_url: Optional[str] = None
    file_id: Optional[str] = None
    submitted_at: Optional[datetime] = None


class DeliverableUpdate(BaseModel):
    title: Optional[str] = None
    notes: Optional[str] = None
    link_url: Optional[str] = None
    file_id: Optional[str] = None
    submitted_at: Optional[datetime] = None


class TimeSessionRead(BaseModel):
    id: int
    task_id: Optional[int] = None
    activity_id: Optional[int] = None
    subactivity_id: Optional[int] = None
    user_id: int
    description: Optional[str] = None
    started_at: datetime
    ended_at: Optional[datetime] = None
    duration_seconds: int
    is_active: bool
    created_at: datetime


class TimeTrackingStart(BaseModel):
    task_id: Optional[int] = None
    activity_id: Optional[int] = None
    subactivity_id: Optional[int] = None
    tenant_id: Optional[int] = None


class TimeSessionCreate(BaseModel):
    task_id: Optional[int] = None
    activity_id: Optional[int] = None
    subactivity_id: Optional[int] = None
    description: Optional[str] = None
    started_at: datetime
    ended_at: datetime


class TimeSessionUpdate(BaseModel):
    task_id: Optional[int] = None
    activity_id: Optional[int] = None
    subactivity_id: Optional[int] = None
    description: Optional[str] = None
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None


class TimeReportRow(BaseModel):
    project_id: Optional[int] = None
    project_name: Optional[str] = None
    task_id: int
    task_title: str
    user_id: Optional[int] = None
    username: Optional[str] = None
    total_hours: Decimal
    hourly_rate: Optional[Decimal] = None


class TimeReportDepartmentRow(BaseModel):
    department_id: int
    department_name: Optional[str] = None
    user_id: Optional[int] = None
    username: Optional[str] = None
    total_hours: Decimal


class BudgetLineMilestoneBase(BaseModel):
    milestone_id: int
    amount: Decimal
    justified: Decimal


class BudgetLineMilestoneCreate(BudgetLineMilestoneBase):
    pass


class BudgetLineMilestoneRead(BudgetLineMilestoneBase):
    id: int
    created_at: datetime


class ProjectBudgetMilestoneBase(BaseModel):
    name: str
    order_index: int = 0


class ProjectBudgetMilestoneCreate(ProjectBudgetMilestoneBase):
    pass


class ProjectBudgetMilestoneUpdate(BaseModel):
    name: Optional[str] = None
    order_index: Optional[int] = None


class ProjectBudgetMilestoneRead(ProjectBudgetMilestoneBase):
    id: int
    project_id: int
    created_at: datetime


class ProjectBudgetLineBase(BaseModel):
    concept: str
    hito1_budget: Decimal
    justified_hito1: Decimal
    hito2_budget: Decimal
    justified_hito2: Decimal
    approved_budget: Decimal
    percent_spent: Decimal
    forecasted_spent: Decimal
    milestones: Optional[list[BudgetLineMilestoneRead]] = None


class ProjectBudgetLineCreate(ProjectBudgetLineBase):
    milestones: Optional[list[BudgetLineMilestoneCreate]] = None


class ProjectBudgetLineUpdate(BaseModel):
    concept: Optional[str] = None
    hito1_budget: Optional[Decimal] = None
    justified_hito1: Optional[Decimal] = None
    hito2_budget: Optional[Decimal] = None
    justified_hito2: Optional[Decimal] = None
    approved_budget: Optional[Decimal] = None
    percent_spent: Optional[Decimal] = None
    forecasted_spent: Optional[Decimal] = None
    milestones: Optional[list[BudgetLineMilestoneCreate]] = None


class ProjectBudgetLineRead(ProjectBudgetLineBase):
    id: int
    project_id: int
    created_at: datetime


class ExternalCollaborationBase(BaseModel):
    collaboration_type: str
    name: str
    legal_name: str
    cif: str
    contact_email: EmailStr


class ExternalCollaborationCreate(ExternalCollaborationBase):
    pass


class ExternalCollaborationUpdate(BaseModel):
    collaboration_type: Optional[str] = None
    name: Optional[str] = None
    legal_name: Optional[str] = None
    cif: Optional[str] = None
    contact_email: Optional[EmailStr] = None


class ExternalCollaborationRead(BaseModel):
    id: int
    collaboration_type: str
    name: str
    legal_name: str
    cif: str
    contact_email: str
    created_at: datetime
    updated_at: datetime


class ProjectDocumentRead(BaseModel):
    id: int
    tenant_id: Optional[int] = None
    project_id: int
    doc_type: str
    original_name: str
    content_type: str
    size_bytes: int
    uploaded_at: datetime
    url: str
