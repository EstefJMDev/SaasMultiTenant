from math import ceil

from sqlalchemy import text
from sqlmodel import Session, select

from app.core.db_session import engine


def backfill_budget_milestone_tenant_id(conn) -> None:
    conn.execute(
        text(
            "UPDATE erp_project_budget_milestone m "
            "SET tenant_id = p.tenant_id "
            "FROM erp_project p "
            "WHERE m.project_id = p.id AND m.tenant_id IS NULL"
        )
    )


def backfill_budget_line_milestone_tenant_id(conn) -> None:
    conn.execute(
        text(
            "UPDATE erp_budget_line_milestone blm "
            "SET tenant_id = p.tenant_id "
            "FROM erp_project_budget_line bl "
            "JOIN erp_project p ON p.id = bl.project_id "
            "WHERE blm.budget_line_id = bl.id AND blm.tenant_id IS NULL"
        )
    )


def backfill_simulation_threshold(conn) -> None:
    conn.execute(
        text(
            "UPDATE erp_simulation_project "
            "SET threshold_percent = 50 "
            "WHERE threshold_percent IS NULL"
        )
    )


def backfill_project_duration_months() -> None:
    from app.models.erp import Project

    with Session(engine) as session:
        projects = session.exec(select(Project)).all()
        updated = False
        for project in projects:
            if (
                project.start_date
                and project.end_date
                and project.duration_months is None
            ):
                start = project.start_date.date()
                end = project.end_date.date()
                if end >= start:
                    total_days = (end - start).days + 1
                    months = max(1, ceil(total_days / 30))
                    project.duration_months = months
                    updated = True
        if updated:
            session.commit()


def backfill_department_allocation(conn) -> None:
    conn.execute(
        text(
            "UPDATE department "
            "SET project_allocation_percentage = 100 "
            "WHERE project_allocation_percentage IS NULL"
        )
    )


def backfill_audit_log_source(conn, audit_table: str) -> None:
    conn.execute(
        text(f"UPDATE {audit_table} SET source = 'app' WHERE source IS NULL")
    )


def backfill_dynamic_budget_milestones() -> None:
    from app.models.erp import ProjectBudgetMilestone, ProjectBudgetLine, BudgetLineMilestone, Project

    with Session(engine) as session:
        existing = session.exec(select(ProjectBudgetMilestone)).first()
        if not existing:
            projects = session.exec(select(Project)).all()
            created_milestones: dict[tuple[int, int], ProjectBudgetMilestone] = {}
            for project in projects:
                m1 = ProjectBudgetMilestone(project_id=project.id, name="HITO 1", order_index=1)
                m2 = ProjectBudgetMilestone(project_id=project.id, name="HITO 2", order_index=2)
                session.add(m1)
                session.add(m2)
                session.commit()
                session.refresh(m1)
                session.refresh(m2)
                created_milestones[(project.id, 1)] = m1
                created_milestones[(project.id, 2)] = m2

            lines = session.exec(select(ProjectBudgetLine)).all()
            for line in lines:
                m1 = created_milestones.get((line.project_id, 1))
                m2 = created_milestones.get((line.project_id, 2))
                if m1:
                    session.add(
                        BudgetLineMilestone(
                            budget_line_id=line.id,
                            milestone_id=m1.id,
                            amount=line.hito1_budget or 0,
                            justified=line.justified_hito1 or 0,
                        )
                    )
                if m2:
                    session.add(
                        BudgetLineMilestone(
                            budget_line_id=line.id,
                            milestone_id=m2.id,
                            amount=line.hito2_budget or 0,
                            justified=line.justified_hito2 or 0,
                        )
                    )
            session.commit()
