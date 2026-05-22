from datetime import datetime, timezone
from decimal import Decimal
from math import ceil
from typing import Optional

from fastapi import UploadFile
from sqlmodel import Session

from app.core.permissions import PROJECTS_READ, PROJECTS_WRITE
from app.core.project_cache import get_project_cache, invalidate_project_cache, set_project_cache
from app.domains.projects import repo
from app.domains.projects.exceptions import (
    ProjectBudgetLineNotFoundError,
    ProjectBudgetMilestoneNotFoundError,
    ProjectNotFoundError,
    ProjectValidationError,
)
from app.models.erp import (
    BudgetLineMilestone,
    Project,
    ProjectBudgetLine,
    ProjectBudgetMilestone,
    ProjectDocument,
)
from app.models.hr import Department
from app.schemas.erp import (
    BudgetLineMilestoneCreate,
    BudgetLineMilestoneRead,
    ProjectBudgetLineCreate,
    ProjectBudgetLineRead,
    ProjectBudgetLineUpdate,
    ProjectBudgetMilestoneCreate,
    ProjectBudgetMilestoneUpdate,
    ProjectCreate,
    ProjectDocumentRead,
    ProjectUpdate,
)
from app.storage.local import save_project_doc_to_disk


ALLOWED_PROJECT_DOC_EXTENSIONS = {
    "pdf",
    "doc",
    "docx",
    "xls",
    "xlsx",
    "ppt",
    "pptx",
    "jpg",
    "jpeg",
    "png",
    "webp",
    "txt",
}
MAX_PROJECT_DOC_UPLOAD_BYTES = 25 * 1024 * 1024  # 25 MB


def resolve_projects_permission(method: str) -> str:
    if method.upper() in repo.READ_METHODS:
        return PROJECTS_READ
    return PROJECTS_WRITE


def list_projects(
    session: Session,
    tenant_id: Optional[int],
    *,
    limit: int,
    offset: int,
) -> list[Project]:
    return repo.list_active_projects(session, tenant_id, limit=limit, offset=offset)


def get_project(session: Session, project_id: int, tenant_id: Optional[int]) -> Project:
    return _get_project_or_404(session, project_id, tenant_id)


def _extension_from_upload(upload: UploadFile) -> str:
    content_type = getattr(upload, "content_type", None) or ""
    filename = (upload.filename or "").lower()
    ext_map = {
        "application/pdf": "pdf",
        "application/msword": "doc",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
        "application/vnd.ms-excel": "xls",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
        "application/vnd.ms-powerpoint": "ppt",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "text/plain": "txt",
    }
    extension = ext_map.get(content_type)
    if not extension and "." in filename:
        extension = filename.rsplit(".", 1)[-1]
    if extension == "jpeg":
        extension = "jpg"
    if not extension:
        extension = "bin"
    return extension


def list_project_documents(
    session: Session,
    project_id: int,
    tenant_id: Optional[int],
    doc_type: Optional[str] = None,
) -> list[ProjectDocument]:
    _get_project_or_404(session, project_id, tenant_id)
    stmt = repo.list_project_documents_query(project_id, tenant_id, doc_type)
    return session.exec(stmt.order_by(ProjectDocument.uploaded_at.desc())).all()


def create_project_document(
    session: Session,
    project_id: int,
    upload: UploadFile,
    tenant_id: Optional[int],
    doc_type: str,
) -> ProjectDocument:
    project = _get_project_or_404(session, project_id, tenant_id)
    resolved_tenant = tenant_id if tenant_id is not None else project.tenant_id
    if resolved_tenant is None:
        raise ProjectValidationError("Tenant requerido para subir documentos del proyecto")
    if not doc_type:
        doc_type = "otros"

    extension = _extension_from_upload(upload)
    if extension not in ALLOWED_PROJECT_DOC_EXTENSIONS:
        raise ProjectValidationError("Formato de archivo no permitido para documentos de proyecto.")
    target_path = save_project_doc_to_disk(
        upload,
        project_id,
        extension,
        max_size_bytes=MAX_PROJECT_DOC_UPLOAD_BYTES,
    )
    size_bytes = target_path.stat().st_size

    doc = ProjectDocument(
        tenant_id=resolved_tenant,
        project_id=project_id,
        doc_type=doc_type,
        file_name=target_path.name,
        original_name=upload.filename or target_path.name,
        content_type=getattr(upload, "content_type", None) or "application/octet-stream",
        size_bytes=size_bytes,
        uploaded_at=datetime.now(timezone.utc),
    )
    session.add(doc)
    session.commit()
    session.refresh(doc)
    return doc


def list_project_budget_lines(
    session: Session, project_id: int, tenant_id: Optional[int]
) -> tuple[list[ProjectBudgetLine], dict[int, list[BudgetLineMilestone]]]:
    _get_project_or_404(session, project_id, tenant_id)
    lines = repo.list_project_budget_lines(session, project_id)
    return _attach_line_milestones(session, lines, tenant_id)


def list_project_budget_milestones(
    session: Session, project_id: int, tenant_id: Optional[int]
) -> list[ProjectBudgetMilestone]:
    _get_project_or_404(session, project_id, tenant_id)
    return repo.list_project_budget_milestones(session, project_id)


def create_project_budget_milestone(
    session: Session,
    project_id: int,
    data: ProjectBudgetMilestoneCreate,
    tenant_id: Optional[int],
) -> ProjectBudgetMilestone:
    project = _get_project_or_404(session, project_id, tenant_id)
    milestone = ProjectBudgetMilestone(
        project_id=project_id,
        tenant_id=project.tenant_id,
        name=data.name.strip() or "Hito",
        order_index=data.order_index or 0,
    )
    session.add(milestone)
    session.commit()
    session.refresh(milestone)
    return milestone


def update_project_budget_milestone(
    session: Session,
    project_id: int,
    milestone_id: int,
    data: ProjectBudgetMilestoneUpdate,
    tenant_id: Optional[int],
) -> ProjectBudgetMilestone:
    _get_project_or_404(session, project_id, tenant_id)
    milestone = repo.get_project_budget_milestone(session, milestone_id)
    if not milestone or milestone.project_id != project_id:
        raise ProjectBudgetMilestoneNotFoundError("Hito de presupuesto no encontrado.")
    if data.name is not None:
        milestone.name = data.name.strip() or milestone.name
    if data.order_index is not None:
        milestone.order_index = data.order_index
    session.add(milestone)
    session.commit()
    session.refresh(milestone)
    return milestone


def delete_project_budget_milestone(
    session: Session,
    project_id: int,
    milestone_id: int,
    tenant_id: Optional[int],
) -> None:
    _get_project_or_404(session, project_id, tenant_id)
    milestone = repo.get_project_budget_milestone(session, milestone_id)
    if not milestone or milestone.project_id != project_id:
        raise ProjectBudgetMilestoneNotFoundError("Hito de presupuesto no encontrado.")
    line_links = repo.list_budget_line_milestone_links_by_milestone_id(session, milestone_id)
    for link in line_links:
        session.delete(link)
    session.delete(milestone)
    session.commit()


def create_project_budget_line(
    session: Session,
    project_id: int,
    data: ProjectBudgetLineCreate,
    tenant_id: Optional[int],
) -> ProjectBudgetLine:
    project = _get_project_or_404(session, project_id, tenant_id)
    milestones_payload: list[BudgetLineMilestoneCreate] = data.milestones or []
    if milestones_payload:
        total_amount = sum(Decimal(m.amount) for m in milestones_payload)
        total_justified = sum(Decimal(m.justified) for m in milestones_payload)
        approved_budget = data.approved_budget
        if approved_budget is None:
            approved_budget = total_amount
        _validate_budget_milestones_totals(
            total_amount=total_amount,
            total_justified=total_justified,
            approved_budget=approved_budget,
        )
        percent_spent = Decimal(0)
        if approved_budget and approved_budget != 0:
            percent_spent = (total_justified / approved_budget) * Decimal(100)
        line = ProjectBudgetLine(
            project_id=project_id,
            tenant_id=project.tenant_id,
            concept=data.concept.strip() or "Concepto",
            hito1_budget=milestones_payload[0].amount if len(milestones_payload) > 0 else Decimal(0),
            justified_hito1=milestones_payload[0].justified if len(milestones_payload) > 0 else Decimal(0),
            hito2_budget=milestones_payload[1].amount if len(milestones_payload) > 1 else Decimal(0),
            justified_hito2=milestones_payload[1].justified if len(milestones_payload) > 1 else Decimal(0),
            approved_budget=approved_budget,
            percent_spent=percent_spent,
            forecasted_spent=data.forecasted_spent,
        )
        session.add(line)
        session.commit()
        session.refresh(line)
        for m in milestones_payload:
            link = BudgetLineMilestone(
                budget_line_id=line.id,
                milestone_id=m.milestone_id,
                tenant_id=project.tenant_id,
                amount=m.amount,
                justified=m.justified,
            )
            session.add(link)
        session.commit()
        return line

    total_amount = Decimal(data.hito1_budget) + Decimal(data.hito2_budget)
    approved_budget = data.approved_budget
    if approved_budget is None:
        approved_budget = total_amount
    _validate_budget_totals(
        hito1_budget=data.hito1_budget,
        hito2_budget=data.hito2_budget,
        approved_budget=approved_budget,
    )
    total_justified = Decimal(data.justified_hito1) + Decimal(data.justified_hito2)
    percent_spent = Decimal(0)
    if approved_budget and approved_budget != 0:
        percent_spent = (total_justified / approved_budget) * Decimal(100)
    line = ProjectBudgetLine(
        project_id=project_id,
        tenant_id=project.tenant_id,
        concept=data.concept.strip() or "Concepto",
        hito1_budget=data.hito1_budget,
        justified_hito1=data.justified_hito1,
        hito2_budget=data.hito2_budget,
        justified_hito2=data.justified_hito2,
        approved_budget=approved_budget,
        percent_spent=percent_spent,
        forecasted_spent=data.forecasted_spent,
    )
    session.add(line)
    session.commit()
    session.refresh(line)
    return line


def update_project_budget_line(
    session: Session,
    project_id: int,
    budget_id: int,
    data: ProjectBudgetLineUpdate,
    tenant_id: Optional[int],
) -> ProjectBudgetLine:
    _get_project_or_404(session, project_id, tenant_id)
    line = repo.get_project_budget_line(session, budget_id)
    if not line or line.project_id != project_id:
        raise ProjectBudgetLineNotFoundError("Presupuesto no encontrado para el proyecto.")

    milestones_payload: list[BudgetLineMilestoneCreate] = data.milestones or []
    if milestones_payload:
        total_amount = sum(Decimal(m.amount) for m in milestones_payload)
        total_justified = sum(Decimal(m.justified) for m in milestones_payload)
        approved_budget = (
            data.approved_budget
            if data.approved_budget is not None
            else line.approved_budget
        )
        if approved_budget is None:
            approved_budget = total_amount
        _validate_budget_milestones_totals(
            total_amount=total_amount,
            total_justified=total_justified,
            approved_budget=approved_budget,
        )
        line.hito1_budget = milestones_payload[0].amount if len(milestones_payload) > 0 else Decimal(0)
        line.justified_hito1 = milestones_payload[0].justified if len(milestones_payload) > 0 else Decimal(0)
        line.hito2_budget = milestones_payload[1].amount if len(milestones_payload) > 1 else Decimal(0)
        line.justified_hito2 = milestones_payload[1].justified if len(milestones_payload) > 1 else Decimal(0)
        line.approved_budget = approved_budget
        line.percent_spent = (
            (total_justified / approved_budget * Decimal(100)) if approved_budget else Decimal(0)
        )
        if data.forecasted_spent is not None:
            line.forecasted_spent = data.forecasted_spent
        existing_links = repo.list_budget_line_milestone_links_by_line_id(session, line.id)
        for link in existing_links:
            session.delete(link)
        session.commit()
        for m in milestones_payload:
            link = BudgetLineMilestone(
                budget_line_id=line.id,
                milestone_id=m.milestone_id,
                tenant_id=line.tenant_id,
                amount=m.amount,
                justified=m.justified,
            )
            session.add(link)
        session.commit()
        line.milestones = repo.list_budget_line_milestone_links_by_line_id(session, line.id)
        session.refresh(line)
        return line

    hito1_budget = data.hito1_budget if data.hito1_budget is not None else line.hito1_budget
    hito2_budget = data.hito2_budget if data.hito2_budget is not None else line.hito2_budget
    approved_budget = (
        data.approved_budget if data.approved_budget is not None else line.approved_budget
    )
    if approved_budget is None:
        approved_budget = hito1_budget + hito2_budget

    _validate_budget_totals(
        hito1_budget=hito1_budget,
        hito2_budget=hito2_budget,
        approved_budget=approved_budget,
    )

    if data.concept is not None:
        line.concept = data.concept.strip() or line.concept
    if data.hito1_budget is not None:
        line.hito1_budget = data.hito1_budget
    if data.justified_hito1 is not None:
        line.justified_hito1 = data.justified_hito1
    if data.hito2_budget is not None:
        line.hito2_budget = data.hito2_budget
    if data.justified_hito2 is not None:
        line.justified_hito2 = data.justified_hito2
    line.approved_budget = approved_budget
    total_justified_line = Decimal(line.justified_hito1 or 0) + Decimal(line.justified_hito2 or 0)
    line.percent_spent = (
        (total_justified_line / approved_budget * Decimal(100)) if approved_budget else Decimal(0)
    )
    if data.forecasted_spent is not None:
        line.forecasted_spent = data.forecasted_spent

    session.add(line)
    session.commit()
    session.refresh(line)
    return line


def delete_project_budget_line(
    session: Session,
    project_id: int,
    budget_id: int,
    tenant_id: Optional[int],
) -> None:
    _get_project_or_404(session, project_id, tenant_id)
    line = repo.get_project_budget_line(session, budget_id)
    if not line or line.project_id != project_id:
        raise ProjectBudgetLineNotFoundError("Presupuesto no encontrado para el proyecto.")
    links = repo.list_budget_line_milestone_links_by_line_id(session, budget_id)
    for link in links:
        session.delete(link)
    session.delete(line)
    session.commit()


def create_project(
    session: Session,
    data: ProjectCreate,
    tenant_id: Optional[int],
) -> Project:
    tenant_id = _require_tenant(tenant_id)
    _validate_date_range(data.start_date, data.end_date)
    project_type = _normalize_project_type(data.project_type)
    department = _resolve_department(session, data.department_id, tenant_id)
    project = Project(
        tenant_id=tenant_id,
        department_id=department.id if department else None,
        name=data.name,
        description=data.description,
        project_type=project_type,
        start_date=data.start_date,
        end_date=data.end_date,
        duration_months=_calculate_duration_months(data.start_date, data.end_date),
        loan_percent=Decimal(_clamp_percent(data.loan_percent) or 0)
        if data.loan_percent is not None
        else None,
        subsidy_percent=Decimal(_clamp_percent(data.subsidy_percent) or 0)
        if data.subsidy_percent is not None
        else None,
        is_active=data.is_active,
    )
    session.add(project)
    session.commit()
    session.refresh(project)
    set_project_cache(
        project.id,
        project.tenant_id,
        {"id": project.id, "tenant_id": project.tenant_id, "is_active": True},
    )
    return project


def update_project(
    session: Session,
    project_id: int,
    data: ProjectUpdate,
    tenant_id: Optional[int],
) -> Project:
    project = _get_project_or_404(session, project_id, tenant_id)

    if data.name is not None:
        project.name = data.name
    if data.description is not None:
        project.description = data.description
    if data.project_type is not None:
        project.project_type = _normalize_project_type(data.project_type)
    if "department_id" in data.__fields_set__:
        if data.department_id is None:
            project.department_id = None
        else:
            department = _resolve_department(session, data.department_id, project.tenant_id)
            project.department_id = department.id if department else None
    if data.start_date is not None or data.end_date is not None:
        start_date = data.start_date if data.start_date is not None else project.start_date
        end_date = data.end_date if data.end_date is not None else project.end_date
        _validate_date_range(start_date, end_date)
        project.start_date = start_date
        project.end_date = end_date
    if data.loan_percent is not None:
        project.loan_percent = Decimal(_clamp_percent(data.loan_percent) or 0)
    if data.subsidy_percent is not None:
        project.subsidy_percent = Decimal(_clamp_percent(data.subsidy_percent) or 0)
    if data.is_active is not None:
        project.is_active = data.is_active

    if project.start_date and project.end_date:
        project.duration_months = _calculate_duration_months(
            project.start_date, project.end_date
        )
    else:
        project.duration_months = None

    session.add(project)
    session.commit()
    session.refresh(project)
    set_project_cache(
        project.id,
        project.tenant_id,
        {"id": project.id, "tenant_id": project.tenant_id, "is_active": project.is_active},
    )
    return project


def delete_project(session: Session, project_id: int, tenant_id: Optional[int]) -> None:
    project = _get_project_or_404(session, project_id, tenant_id)
    project.is_active = False
    session.add(project)
    session.commit()
    invalidate_project_cache(project_id)


def to_project_document_read(doc: ProjectDocument) -> ProjectDocumentRead:
    tenant_query = f"?tenant_id={doc.tenant_id}" if doc.tenant_id is not None else ""
    return ProjectDocumentRead(
        id=doc.id,
        tenant_id=doc.tenant_id,
        project_id=doc.project_id,
        doc_type=doc.doc_type,
        original_name=doc.original_name,
        content_type=doc.content_type,
        size_bytes=doc.size_bytes,
        uploaded_at=doc.uploaded_at,
        url=f"/api/v1/projects/{doc.project_id}/documents/{doc.id}/download{tenant_query}",
    )


def to_project_budget_line_read(
    line: ProjectBudgetLine,
    milestones: list[BudgetLineMilestone],
) -> ProjectBudgetLineRead:
    return ProjectBudgetLineRead(
        id=line.id,
        project_id=line.project_id,
        concept=line.concept,
        hito1_budget=line.hito1_budget,
        justified_hito1=line.justified_hito1,
        hito2_budget=line.hito2_budget,
        justified_hito2=line.justified_hito2,
        approved_budget=line.approved_budget,
        percent_spent=line.percent_spent,
        forecasted_spent=line.forecasted_spent,
        created_at=line.created_at,
        milestones=[
            BudgetLineMilestoneRead(
                id=item.id,
                milestone_id=item.milestone_id,
                amount=item.amount,
                justified=item.justified,
                created_at=item.created_at,
            )
            for item in milestones
        ],
    )


def _require_tenant(tenant_id: Optional[int]) -> int:
    if tenant_id is None:
        raise ProjectValidationError("Tenant requerido para esta operacion.")
    return tenant_id


def _get_project_or_404(
    session: Session,
    project_id: int,
    tenant_id: Optional[int],
) -> Project:
    # Fast tenant-ownership check from cache before hitting DB.
    # Cache stores lightweight metadata; ORM object is always loaded via session.
    cached = get_project_cache(project_id, tenant_id)
    if cached is None:
        project = repo.get_project_by_id(session, project_id)
        if not project:
            raise ProjectNotFoundError("Proyecto no encontrado.")
        if tenant_id is not None and project.tenant_id != tenant_id:
            raise ProjectNotFoundError("Proyecto no encontrado.")
        if project.is_active:
            set_project_cache(
                project_id,
                project.tenant_id,
                {"id": project.id, "tenant_id": project.tenant_id, "is_active": True},
            )
        return project

    # Cache hit: tenant already validated. Load ORM object from session identity map / DB.
    project = session.get(Project, project_id)
    if not project or not project.is_active:
        invalidate_project_cache(project_id)
        raise ProjectNotFoundError("Proyecto no encontrado.")
    return project


def _resolve_department(
    session: Session,
    department_id: Optional[int],
    tenant_id: Optional[int],
) -> Optional[Department]:
    if department_id is None:
        return None
    dept = session.get(Department, department_id)
    if not dept:
        raise ProjectValidationError("Departamento no encontrado.")
    if tenant_id is not None and dept.tenant_id != tenant_id:
        raise ProjectValidationError("El departamento no pertenece al tenant.")
    return dept


def _validate_budget_totals(
    *,
    hito1_budget: Decimal,
    hito2_budget: Decimal,
    approved_budget: Decimal,
) -> None:
    total = hito1_budget + hito2_budget
    if total > approved_budget:
        raise ProjectValidationError(
            "La suma de los hitos no puede superar el presupuesto aprobado."
        )


def _validate_budget_milestones_totals(
    *,
    total_amount: Decimal,
    total_justified: Decimal,
    approved_budget: Decimal,
) -> None:
    if total_amount > approved_budget:
        raise ProjectValidationError(
            "La suma de los hitos no puede superar el presupuesto aprobado."
        )
    if total_justified > approved_budget:
        raise ProjectValidationError(
            "El justificado total no puede superar el presupuesto aprobado."
        )


def _attach_line_milestones(
    session: Session,
    lines: list[ProjectBudgetLine],
    tenant_id: Optional[int],
) -> tuple[list[ProjectBudgetLine], dict[int, list[BudgetLineMilestone]]]:
    if not lines:
        return lines, {}
    line_ids = [line.id for line in lines if line.id is not None]
    if not line_ids:
        return lines, {}
    project_id = lines[0].project_id
    milestones = {
        m.id: m for m in list_project_budget_milestones(session, project_id, tenant_id)
    }
    links = repo.list_budget_line_milestone_links_by_line_ids(session, line_ids)
    links_by_line: dict[int, list[BudgetLineMilestone]] = {}
    for link in links:
        links_by_line.setdefault(link.budget_line_id, []).append(link)

    sorted_links: dict[int, list[BudgetLineMilestone]] = {}
    for line_id, mlinks in links_by_line.items():
        mlinks_sorted = sorted(
            mlinks,
            key=lambda link: milestones.get(link.milestone_id).order_index
            if milestones.get(link.milestone_id)
            else 0,
        )
        sorted_links[line_id] = mlinks_sorted
    return lines, sorted_links


def _validate_date_range(start_date: Optional[datetime], end_date: Optional[datetime]) -> None:
    if start_date and end_date and end_date < start_date:
        raise ProjectValidationError("La fecha de fin debe ser posterior a la de inicio.")


def _normalize_project_type(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    cleaned = value.strip().lower()
    if not cleaned:
        return None
    allowed = {"regional", "nacional", "internacional"}
    if cleaned not in allowed:
        raise ProjectValidationError("Tipo de proyecto no válido")
    return cleaned


def _calculate_duration_months(
    start_date: Optional[datetime],
    end_date: Optional[datetime],
) -> Optional[int]:
    if not start_date or not end_date:
        return None
    start = start_date.date()
    end = end_date.date()
    if end < start:
        return None
    total_days = (end - start).days + 1
    return max(1, ceil(total_days / 30))


def _clamp_percent(value: Optional[float]) -> Optional[float]:
    if value is None:
        return None
    try:
        num = float(value)
    except (TypeError, ValueError):
        return None
    return max(0.0, min(100.0, num))
