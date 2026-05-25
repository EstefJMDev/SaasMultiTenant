from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from sqlmodel import Session, select

from app.models.erp import SimulationExpense, SimulationProject
from app.schemas.simulations import (
    SimulationExpenseCreate,
    SimulationExpenseRead,
    SimulationExpenseUpdate,
    SimulationProjectCreate,
    SimulationProjectRead,
    SimulationProjectUpdate,
)


def _require_tenant(tenant_id: Optional[int]) -> None:
    # Bloquea escrituras sin tenant (superadmin debe elegirlo).
    if tenant_id is None:
        raise ValueError("Tenant requerido para esta operacion.")


def _project_filter(project_id: int, tenant_id: Optional[int]):
    if tenant_id is None:
        return SimulationProject.id == project_id
    return (SimulationProject.id == project_id) & (SimulationProject.tenant_id == tenant_id)


def _expense_filter(expense_id: int, project_id: int, tenant_id: Optional[int]):
    if tenant_id is None:
        return (SimulationExpense.id == expense_id) & (SimulationExpense.project_id == project_id)
    return (
        (SimulationExpense.id == expense_id)
        & (SimulationExpense.project_id == project_id)
        & (SimulationProject.tenant_id == tenant_id)
    )


def list_simulation_projects(
    session: Session, tenant_id: Optional[int]
) -> list[SimulationProjectRead]:
    # Lista proyectos y sus gastos, filtrando por tenant si aplica.
    statement = select(SimulationProject).order_by(SimulationProject.created_at.desc())
    if tenant_id is not None:
        statement = statement.where(SimulationProject.tenant_id == tenant_id)

    projects = session.exec(statement).all()
    if not projects:
        return []

    project_ids = [project.id for project in projects if project.id is not None]
    expenses = session.exec(
        select(SimulationExpense).where(SimulationExpense.project_id.in_(project_ids))
    ).all()
    expense_map: dict[int, list[SimulationExpenseRead]] = {pid: [] for pid in project_ids}
    for expense in expenses:
        expense_map.setdefault(expense.project_id, []).append(
            SimulationExpenseRead(
                id=expense.id,
                project_id=expense.project_id,
                concept=expense.concept,
                amount=expense.amount,
                created_at=expense.created_at,
                updated_at=expense.updated_at,
            )
        )

    return [
        SimulationProjectRead(
            id=project.id,
            tenant_id=project.tenant_id,
            name=project.name,
            budget=project.budget,
            subsidy_percent=project.subsidy_percent,
            threshold_percent=project.threshold_percent,
            created_at=project.created_at,
            updated_at=project.updated_at,
            expenses=expense_map.get(project.id or 0, []),
        )
        for project in projects
    ]


def create_simulation_project(
    session: Session, tenant_id: Optional[int], data: SimulationProjectCreate
) -> SimulationProjectRead:
    # Crea proyecto de simulacion para el tenant.
    _require_tenant(tenant_id)
    name = data.name.strip()
    if not name:
        raise ValueError("Nombre obligatorio.")

    now = datetime.now(timezone.utc)
    project = SimulationProject(
        tenant_id=tenant_id,
        name=name,
        budget=Decimal(data.budget or 0),
        subsidy_percent=Decimal(data.subsidy_percent or 0),
        threshold_percent=Decimal(data.threshold_percent or 50),
        created_at=now,
        updated_at=now,
    )
    session.add(project)
    session.commit()
    session.refresh(project)
    return SimulationProjectRead(
        id=project.id,
        tenant_id=project.tenant_id,
        name=project.name,
        budget=project.budget,
        subsidy_percent=project.subsidy_percent,
        threshold_percent=project.threshold_percent,
        created_at=project.created_at,
        updated_at=project.updated_at,
        expenses=[],
    )


def update_simulation_project(
    session: Session,
    tenant_id: Optional[int],
    project_id: int,
    data: SimulationProjectUpdate,
) -> SimulationProjectRead:
    # Actualiza campos del proyecto (nombre/presupuesto/porcentaje).
    _require_tenant(tenant_id)
    project = session.exec(select(SimulationProject).where(_project_filter(project_id, tenant_id))).one_or_none()
    if not project:
        raise LookupError("Simulacion no encontrada.")

    if data.name is not None:
        name = data.name.strip()
        if not name:
            raise ValueError("Nombre obligatorio.")
        project.name = name
    if data.budget is not None:
        project.budget = Decimal(data.budget)
    if data.subsidy_percent is not None:
        project.subsidy_percent = Decimal(data.subsidy_percent)
    if data.threshold_percent is not None:
        project.threshold_percent = Decimal(data.threshold_percent)

    project.updated_at = datetime.now(timezone.utc)
    session.add(project)
    session.commit()
    session.refresh(project)

    expenses = session.exec(
        select(SimulationExpense).where(SimulationExpense.project_id == project.id)
    ).all()
    return SimulationProjectRead(
        id=project.id,
        tenant_id=project.tenant_id,
        name=project.name,
        budget=project.budget,
        subsidy_percent=project.subsidy_percent,
        threshold_percent=project.threshold_percent,
        created_at=project.created_at,
        updated_at=project.updated_at,
        expenses=[
            SimulationExpenseRead(
                id=expense.id,
                project_id=expense.project_id,
                concept=expense.concept,
                amount=expense.amount,
                created_at=expense.created_at,
                updated_at=expense.updated_at,
            )
            for expense in expenses
        ],
    )


def delete_simulation_project(
    session: Session, tenant_id: Optional[int], project_id: int
) -> None:
    # Elimina proyecto y sus gastos.
    _require_tenant(tenant_id)
    project = session.exec(select(SimulationProject).where(_project_filter(project_id, tenant_id))).one_or_none()
    if not project:
        raise LookupError("Simulacion no encontrada.")

    expenses = session.exec(
        select(SimulationExpense).where(SimulationExpense.project_id == project.id)
    ).all()
    for expense in expenses:
        session.delete(expense)
    session.delete(project)
    session.commit()


def create_simulation_expense(
    session: Session,
    tenant_id: Optional[int],
    project_id: int,
    data: SimulationExpenseCreate,
) -> SimulationExpenseRead:
    # Crea gasto dentro de un proyecto de simulacion.
    _require_tenant(tenant_id)
    project = session.exec(select(SimulationProject).where(_project_filter(project_id, tenant_id))).one_or_none()
    if not project:
        raise LookupError("Simulacion no encontrada.")

    concept = data.concept.strip()
    if not concept:
        raise ValueError("Concepto obligatorio.")
    now = datetime.now(timezone.utc)
    expense = SimulationExpense(
        project_id=project.id,
        concept=concept,
        amount=Decimal(data.amount or 0),
        created_at=now,
        updated_at=now,
    )
    session.add(expense)
    session.commit()
    session.refresh(expense)
    return SimulationExpenseRead(
        id=expense.id,
        project_id=expense.project_id,
        concept=expense.concept,
        amount=expense.amount,
        created_at=expense.created_at,
        updated_at=expense.updated_at,
    )


def update_simulation_expense(
    session: Session,
    tenant_id: Optional[int],
    project_id: int,
    expense_id: int,
    data: SimulationExpenseUpdate,
) -> SimulationExpenseRead:
    # Actualiza concepto o importe del gasto.
    _require_tenant(tenant_id)
    statement = (
        select(SimulationExpense)
        .join(SimulationProject, SimulationProject.id == SimulationExpense.project_id)
        .where(_expense_filter(expense_id, project_id, tenant_id))
    )
    expense = session.exec(statement).one_or_none()
    if not expense:
        raise LookupError("Gasto no encontrado.")

    if data.concept is not None:
        concept = data.concept.strip()
        if not concept:
            raise ValueError("Concepto obligatorio.")
        expense.concept = concept
    if data.amount is not None:
        expense.amount = Decimal(data.amount)

    expense.updated_at = datetime.now(timezone.utc)
    session.add(expense)
    session.commit()
    session.refresh(expense)
    return SimulationExpenseRead(
        id=expense.id,
        project_id=expense.project_id,
        concept=expense.concept,
        amount=expense.amount,
        created_at=expense.created_at,
        updated_at=expense.updated_at,
    )


def delete_simulation_expense(
    session: Session,
    tenant_id: Optional[int],
    project_id: int,
    expense_id: int,
) -> None:
    # Elimina un gasto de simulacion.
    _require_tenant(tenant_id)
    statement = (
        select(SimulationExpense)
        .join(SimulationProject, SimulationProject.id == SimulationExpense.project_id)
        .where(_expense_filter(expense_id, project_id, tenant_id))
    )
    expense = session.exec(statement).one_or_none()
    if not expense:
        raise LookupError("Gasto no encontrado.")
    session.delete(expense)
    session.commit()
