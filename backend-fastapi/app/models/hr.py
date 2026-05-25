from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from sqlalchemy import Column, JSON
from sqlmodel import Field, SQLModel


class Department(SQLModel, table=True):
    """
    Departamento dentro de un tenant.
    """

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)

    name: str
    description: Optional[str] = None

    manager_id: Optional[int] = Field(
        default=None,
        foreign_key="user.id",
        description="Usuario manager del departamento (dentro del mismo tenant).",
    )

    is_active: bool = Field(default=True)
    project_allocation_percentage: Optional[Decimal] = Field(
        default=Decimal(100),
        description="Porcentaje máximo del tiempo disponible que el departamento puede dedicar a proyectos.",
    )
    menu_visibility: dict[str, bool] = Field(
        default_factory=dict,
        sa_column=Column(JSON, nullable=False, default=dict),
        description="Configuracion de visibilidad del menu lateral por departamento.",
    )

    can_create_comparative: bool = Field(default=False)
    can_edit_comparative: bool = Field(default=False)
    can_delete_comparative: bool = Field(default=False)
    can_approve_comparative: bool = Field(default=False)
    can_reject_comparative: bool = Field(default=False)

    can_view_contract: bool = Field(default=False)
    can_edit_contract: bool = Field(default=False)
    can_regenerate_contract: bool = Field(default=False)
    can_approve_contract: bool = Field(default=False)
    can_reject_contract: bool = Field(default=False)
    can_view_worksite: bool = Field(default=False)
    can_edit_worksite: bool = Field(default=False)
    can_view_provider: bool = Field(default=False)
    can_edit_provider: bool = Field(default=False)

    created_at: datetime = Field(default_factory=datetime.utcnow)


class EmployeeProfile(SQLModel, table=True):
    """
    Perfil de empleado asociado a un usuario dentro de un tenant.
    """

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    user_id: Optional[int] = Field(default=None, foreign_key="user.id", index=True, unique=True)

    first_name: Optional[str] = Field(default=None, max_length=150)
    last_name: Optional[str] = Field(default=None, max_length=150)
    full_name: Optional[str] = Field(default=None, max_length=200)
    email: Optional[str] = Field(default=None, max_length=255)
    hourly_rate: Optional[Decimal] = Field(default=None)

    available_hours: Optional[Decimal] = Field(
        default=None, description="Horas disponibles al año para asignación."
    )
    availability_percentage: Optional[Decimal] = Field(
        default=None, description="Porcentaje de disponibilidad sobre las horas base."
    )

    position_id: Optional[int] = Field(
        default=None,
        foreign_key="position.id",
        index=True,
        description="FK al puesto/posición (Position).",
    )
    director_tecnico_id: Optional[int] = Field(
        default=None,
        foreign_key="employeeprofile.id",
        index=True,
        description=(
            "FK al EmployeeProfile que actúa como Director Técnico. "
            "Solo aplica si el empleado es Jefe de Obra (Position.role_code='JO')."
        ),
    )
    titulacion: Optional[str] = None
    employment_type: str = Field(
        default="permanent",
        description="Tipo de contrato: permanent, temporary, contractor, etc.",
    )

    hire_date: Optional[datetime] = None
    end_date: Optional[datetime] = None

    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class EmployeeAllocation(SQLModel, table=True):
    """
    Asignación de horas de un empleado a un proyecto/departamento concreto.
    """

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    employee_id: int = Field(foreign_key="employeeprofile.id", index=True)
    department_id: Optional[int] = Field(default=None, foreign_key="department.id", index=True)
    project_id: Optional[int] = Field(default=None, foreign_key="erp_project.id", index=True)
    milestone: Optional[str] = Field(default=None, max_length=50)
    year: int = Field(default=datetime.now(timezone.utc).year, index=True)
    allocated_hours: Optional[Decimal] = Field(default=None)
    allocation_percentage: Optional[Decimal] = Field(default=None)
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class EmployeeYearAvailability(SQLModel, table=True):
    """
    Disponibilidad anual de un empleado para un anio concreto.
    """

    __tablename__ = "employee_year_availability"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    employee_id: int = Field(foreign_key="employeeprofile.id", index=True)
    year: int = Field(index=True)
    available_hours: Optional[Decimal] = Field(
        default=None,
        description="Horas disponibles del empleado para el anio indicado.",
    )
    availability_percentage: Optional[Decimal] = Field(
        default=None,
        description="Porcentaje de disponibilidad para el anio indicado.",
    )
    hourly_rate: Optional[Decimal] = Field(
        default=None,
        description="Coste por hora del empleado para el anio indicado.",
    )
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class EmployeeDepartment(SQLModel, table=True):
    """
    Relación N:N entre empleados y departamentos.
    """

    employee_id: int = Field(foreign_key="employeeprofile.id", primary_key=True)
    department_id: int = Field(foreign_key="department.id", primary_key=True)
    is_primary: bool = Field(
        default=False,
        description="Indica si es el departamento principal del empleado.",
    )
    allocation_percentage: Decimal = Field(
        default=Decimal(100),
        description="Porcentaje de dedicacion del empleado en este departamento.",
    )


class Position(SQLModel, table=True):
    """
    Puesto de trabajo dentro de un tenant. Define permisos atómicos del empleado.
    Los permisos se calculan como UNION de las posiciones activas del empleado.
    """

    __tablename__ = "position"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    department_id: Optional[int] = Field(
        default=None,
        foreign_key="department.id",
        index=True,
        description="Departamento al que pertenece el puesto (opcional).",
    )

    name: str = Field(max_length=150)
    level: int = Field(
        default=0,
        description="Nivel jerárquico (0=básico, mayor=más senior).",
    )
    role_code: Optional[str] = Field(
        default=None,
        max_length=20,
        index=True,
        description=(
            "Código de rol funcional opcional. Valores convencionales: "
            "'JO' (Jefe de Obra), 'DT' (Director Técnico). NULL = sin rol especial."
        ),
    )

    can_create_comparative: bool = Field(default=False)
    can_edit_comparative: bool = Field(default=False)
    can_delete_comparative: bool = Field(default=False)
    can_approve_comparative: bool = Field(default=False)
    can_reject_comparative: bool = Field(default=False)
    can_view_all_comparatives: bool = Field(default=False)
    full_approver: bool = Field(default=False)

    can_view_contract: bool = Field(default=False)
    can_edit_contract: bool = Field(default=False)
    can_regenerate_contract: bool = Field(default=False)
    can_approve_contract: bool = Field(default=False)
    can_reject_contract: bool = Field(default=False)
    can_view_worksite: bool = Field(default=False)
    can_edit_worksite: bool = Field(default=False)
    can_view_provider: bool = Field(default=False)
    can_edit_provider: bool = Field(default=False)

    is_active: bool = Field(default=True, index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
