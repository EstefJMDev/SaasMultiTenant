from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import BigInteger, Column, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlmodel import Field, SQLModel


class Project(SQLModel, table=True):
    __tablename__ = "erp_project"

    id: Optional[int] = Field(
        default=None,
        sa_column=Column(
            BigInteger().with_variant(Integer, "sqlite"),
            primary_key=True,
            autoincrement=True,
        ),
    )
    tenant_id: Optional[int] = Field(default=None, foreign_key="tenant.id")
    department_id: Optional[int] = Field(default=None, foreign_key="department.id")
    name: str
    description: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    project_type: Optional[str] = Field(default=None, max_length=32)
    department_id: Optional[int] = Field(default=None, foreign_key="department.id")
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    duration_months: Optional[int] = None
    loan_percent: Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(5, 2)))
    subsidy_percent: Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(5, 2)))
    is_active: bool = Field(default=True)
    created_at: datetime = Field(
        default_factory=datetime.utcnow,
        sa_column=Column(DateTime(timezone=True)),
    )


class Task(SQLModel, table=True):
    __tablename__ = "erp_task"

    id: Optional[int] = Field(
        default=None,
        sa_column=Column(BigInteger, primary_key=True),
    )
    tenant_id: Optional[int] = Field(default=None, foreign_key="tenant.id")
    project_id: Optional[int] = Field(
        default=None,
        sa_column=Column(BigInteger, ForeignKey("erp_project.id")),
    )
    # Subactividad dentro del proyecto (opcional para compatibilidad).
    subactivity_id: Optional[int] = Field(default=None, foreign_key="erp_subactivity.id")
    # Plantilla base de tarea (catalogo reusable).
    task_template_id: Optional[int] = Field(default=None, foreign_key="erp_task_template.id")
    title: str
    description: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    assigned_to_id: Optional[int] = Field(default=None, foreign_key="user.id")
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    status: str = Field(default="pending", max_length=20)
    is_completed: bool = Field(default=False)
    created_at: datetime = Field(
        default_factory=datetime.utcnow,
        sa_column=Column(DateTime(timezone=True)),
    )


class TaskTemplate(SQLModel, table=True):
    __tablename__ = "erp_task_template"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: Optional[int] = Field(default=None, foreign_key="tenant.id")
    title: str
    description: Optional[str] = Field(
        default=None,
        sa_column=Column(String(255), nullable=True),
    )
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Activity(SQLModel, table=True):
    __tablename__ = "erp_activity"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: Optional[int] = Field(default=None, foreign_key="tenant.id")
    project_id: int = Field(foreign_key="erp_project.id")
    assigned_to_id: Optional[int] = Field(default=None, foreign_key="user.id")
    name: str
    description: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class SubActivity(SQLModel, table=True):
    __tablename__ = "erp_subactivity"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: Optional[int] = Field(default=None, foreign_key="tenant.id")
    activity_id: int = Field(foreign_key="erp_activity.id")
    assigned_to_id: Optional[int] = Field(default=None, foreign_key="user.id")
    name: str
    description: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Milestone(SQLModel, table=True):
    __tablename__ = "erp_milestone"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: Optional[int] = Field(default=None, foreign_key="tenant.id")
    project_id: int = Field(foreign_key="erp_project.id")
    # Hito opcionalmente ligado a una actividad concreta.
    activity_id: Optional[int] = Field(default=None, foreign_key="erp_activity.id")
    title: str
    description: Optional[str] = None
    due_date: Optional[datetime] = None
    allow_late_submission: bool = Field(default=False)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Deliverable(SQLModel, table=True):
    __tablename__ = "erp_deliverable"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: Optional[int] = Field(default=None, foreign_key="tenant.id")
    milestone_id: int = Field(foreign_key="erp_milestone.id")
    title: str
    notes: Optional[str] = None
    # Registro inicial de entregable (texto/URL).
    link_url: Optional[str] = None
    # Preparado para futura subida de archivos (referencia externa).
    file_id: Optional[str] = None
    submitted_at: Optional[datetime] = None
    is_late: bool = Field(default=False)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class TimeEntry(SQLModel, table=True):
    __tablename__ = "erp_timeentry"

    id: Optional[int] = Field(
        default=None,
        sa_column=Column(BigInteger, primary_key=True),
    )
    tenant_id: Optional[int] = Field(default=None, foreign_key="tenant.id")
    task_id: Optional[int] = Field(
        default=None,
        sa_column=Column(BigInteger, ForeignKey("erp_task.id")),
    )
    activity_id: Optional[int] = Field(default=None, foreign_key="erp_activity.id")
    subactivity_id: Optional[int] = Field(default=None, foreign_key="erp_subactivity.id")
    user_id: Optional[int] = Field(default=None, foreign_key="user.id")
    time_session_id: Optional[int] = Field(
        default=None,
        sa_column=Column(BigInteger, ForeignKey("erp_timesession.id")),
    )
    hours: Decimal = Field(sa_column=Column(Numeric(6, 2)))
    description: Optional[str] = Field(default=None, max_length=255)
    created_at: datetime = Field(
        default_factory=datetime.utcnow,
        sa_column=Column(DateTime(timezone=True)),
    )


class TimeEntryDepartmentSplit(SQLModel, table=True):
    __tablename__ = "erp_timeentry_department_split"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: Optional[int] = Field(default=None, foreign_key="tenant.id", index=True)
    time_entry_id: int = Field(foreign_key="erp_timeentry.id", index=True)
    user_id: Optional[int] = Field(default=None, foreign_key="user.id", index=True)
    department_id: int = Field(foreign_key="department.id", index=True)
    percentage: Decimal = Field(sa_column=Column(Numeric(5, 2)))
    hours: Decimal = Field(sa_column=Column(Numeric(6, 2)))
    created_at: datetime = Field(default_factory=datetime.utcnow)


class TimeSession(SQLModel, table=True):
    __tablename__ = "erp_timesession"

    id: Optional[int] = Field(
        default=None,
        sa_column=Column(BigInteger, primary_key=True),
    )
    tenant_id: Optional[int] = Field(default=None, foreign_key="tenant.id")
    task_id: Optional[int] = Field(
        default=None,
        sa_column=Column(BigInteger, ForeignKey("erp_task.id")),
    )
    activity_id: Optional[int] = Field(default=None, foreign_key="erp_activity.id")
    subactivity_id: Optional[int] = Field(default=None, foreign_key="erp_subactivity.id")
    user_id: int = Field(foreign_key="user.id")
    description: Optional[str] = Field(default=None, sa_column=Column(Text))
    started_at: datetime = Field(sa_column=Column(DateTime(timezone=True)))
    ended_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True)),
    )
    duration_seconds: int = Field(default=0)
    is_active: bool = Field(default=True)
    created_at: datetime = Field(
        default_factory=datetime.utcnow,
        sa_column=Column(DateTime(timezone=True)),
    )


class ProjectBudgetLine(SQLModel, table=True):
    __tablename__ = "erp_project_budget_line"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: Optional[int] = Field(default=None, foreign_key="tenant.id")
    project_id: int = Field(foreign_key="erp_project.id")
    concept: str
    hito1_budget: Decimal = Field(sa_column=Column(Numeric(14, 2), nullable=False))
    justified_hito1: Decimal = Field(sa_column=Column(Numeric(14, 2), nullable=False))
    hito2_budget: Decimal = Field(sa_column=Column(Numeric(14, 2), nullable=False))
    justified_hito2: Decimal = Field(sa_column=Column(Numeric(14, 2), nullable=False))
    approved_budget: Decimal = Field(sa_column=Column(Numeric(14, 2), nullable=False))
    percent_spent: Decimal = Field(sa_column=Column(Numeric(6, 2), nullable=False))
    forecasted_spent: Decimal = Field(sa_column=Column(Numeric(14, 2), nullable=False))
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ProjectBudgetMilestone(SQLModel, table=True):
    __tablename__ = "erp_project_budget_milestone"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: Optional[int] = Field(default=None, foreign_key="tenant.id")
    project_id: int = Field(foreign_key="erp_project.id")
    name: str
    order_index: int = Field(default=0)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class BudgetLineMilestone(SQLModel, table=True):
    __tablename__ = "erp_budget_line_milestone"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: Optional[int] = Field(default=None, foreign_key="tenant.id")
    budget_line_id: int = Field(foreign_key="erp_project_budget_line.id")
    milestone_id: int = Field(foreign_key="erp_project_budget_milestone.id")
    amount: Decimal = Field(sa_column=Column(Numeric(14, 2), nullable=False))
    justified: Decimal = Field(sa_column=Column(Numeric(14, 2), nullable=False))
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ExternalCollaboration(SQLModel, table=True):
    __tablename__ = "erp_external_collaboration"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: Optional[int] = Field(default=None, foreign_key="tenant.id")
    collaboration_type: str
    name: str
    legal_name: str
    cif: str
    contact_email: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class SimulationProject(SQLModel, table=True):
    __tablename__ = "erp_simulation_project"

    # Proyecto de simulacion por tenant.
    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: Optional[int] = Field(default=None, foreign_key="tenant.id")
    name: str
    budget: Decimal = Field(sa_column=Column(Numeric(14, 2), nullable=False), default=0)
    subsidy_percent: Decimal = Field(
        sa_column=Column(Numeric(6, 2), nullable=False),
        default=0,
    )
    threshold_percent: Decimal = Field(
        sa_column=Column(Numeric(6, 2), nullable=False),
        default=50,
    )
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class SimulationExpense(SQLModel, table=True):
    __tablename__ = "erp_simulation_expense"

    # Gasto asociado a un proyecto de simulacion.
    id: Optional[int] = Field(default=None, primary_key=True)
    project_id: int = Field(foreign_key="erp_simulation_project.id")
    concept: str
    amount: Decimal = Field(sa_column=Column(Numeric(14, 2), nullable=False), default=0)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class ProjectDocument(SQLModel, table=True):
    __tablename__ = "erp_project_document"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: Optional[int] = Field(default=None, foreign_key="tenant.id")
    project_id: int = Field(foreign_key="erp_project.id")
    doc_type: str = Field(default="otros", max_length=40)
    file_name: str
    original_name: str
    content_type: str
    size_bytes: int
    uploaded_at: datetime = Field(default_factory=datetime.utcnow)
