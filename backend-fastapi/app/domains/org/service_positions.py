from typing import Optional

from sqlmodel import Session, select

from app.core.audit import log_action
from app.core.user_me_cache import invalidate_user_me_cache
from app.models.hr import Department, EmployeeProfile, Position
from app.models.user import User
from app.schemas.hr import PositionCreate, PositionRead, PositionUpdate


def _ensure_same_tenant(tenant_id: int, user: User) -> None:
    if user.is_super_admin:
        return
    if not user.tenant_id or user.tenant_id != tenant_id:
        raise PermissionError("No tienes permisos para gestionar este tenant")


VALID_ROLE_CODES = {"JO", "DT"}


def _normalize_role_code(value: Optional[str]) -> Optional[str]:
    """Normaliza role_code: trim + upper; '' → None. Valida contra VALID_ROLE_CODES."""
    if value is None:
        return None
    normalized = value.strip().upper()
    if not normalized:
        return None
    if normalized not in VALID_ROLE_CODES:
        raise ValueError(
            f"role_code inválido: '{value}'. Valores permitidos: {sorted(VALID_ROLE_CODES)} o vacío."
        )
    return normalized


def _infer_role_code_from_name(name: Optional[str]) -> Optional[str]:
    """Infiere role_code a partir del nombre del puesto.

    Reglas:
      - Nombre contiene 'jefe de obra' → 'JO'
      - Nombre contiene 'director tecnico'/'director técnico' → 'DT'
      - Otro → None

    Comparación case/accents-insensitive básica. El admin de tenant ya no
    selecciona role_code manualmente: se deriva del nombre del puesto.
    """
    if not name:
        return None
    norm = name.strip().lower()
    norm = (
        norm.replace("á", "a")
        .replace("é", "e")
        .replace("í", "i")
        .replace("ó", "o")
        .replace("ú", "u")
    )
    if "jefe de obra" in norm:
        return "JO"
    if "director tecnico" in norm:
        return "DT"
    return None


def _to_read(p: Position) -> PositionRead:
    return PositionRead(
        id=p.id,
        tenant_id=p.tenant_id,
        name=p.name,
        department_id=p.department_id,
        level=p.level,
        role_code=getattr(p, "role_code", None),
        can_create_comparative=p.can_create_comparative,
        can_edit_comparative=p.can_edit_comparative,
        can_delete_comparative=p.can_delete_comparative,
        can_approve_comparative=p.can_approve_comparative,
        can_reject_comparative=getattr(p, "can_reject_comparative", False),
        can_view_all_comparatives=getattr(p, "can_view_all_comparatives", False),
        can_view_contract=getattr(p, "can_view_contract", False),
        can_edit_contract=getattr(p, "can_edit_contract", False),
        can_regenerate_contract=getattr(p, "can_regenerate_contract", False),
        can_approve_contract=getattr(p, "can_approve_contract", False),
        can_reject_contract=getattr(p, "can_reject_contract", False),
        can_view_worksite=getattr(p, "can_view_worksite", False),
        can_edit_worksite=getattr(p, "can_edit_worksite", False),
        can_view_provider=getattr(p, "can_view_provider", False),
        can_edit_provider=getattr(p, "can_edit_provider", False),
        is_active=p.is_active,
        created_at=p.created_at,
    )


COMPARATIVE_CAPS = (
    "can_create_comparative",
    "can_edit_comparative",
    "can_delete_comparative",
    "can_approve_comparative",
    "can_reject_comparative",
)


CONTRACT_CAPS = (
    "can_view_contract",
    "can_edit_contract",
    "can_regenerate_contract",
    "can_approve_contract",
    "can_reject_contract",
)


CATALOG_CAPS = (
    "can_view_worksite",
    "can_edit_worksite",
    "can_view_provider",
    "can_edit_provider",
)


def _apply_dept_contract_defaults(
    dept: Optional[Department],
    explicit: dict[str, Optional[bool]],
) -> dict[str, bool]:
    """Para cada cap de contrato:
      - si llega valor explícito (no None) en payload → respeta
      - si no llega → hereda del Department (True si dept.cap=True)
    Si no hay dept, todos quedan False.
    """
    out: dict[str, bool] = {}
    for cap in CONTRACT_CAPS:
        value = explicit.get(cap)
        if value is not None:
            out[cap] = bool(value)
        elif dept is not None:
            out[cap] = bool(getattr(dept, cap, False))
        else:
            out[cap] = False
    return out


def _apply_dept_catalog_defaults(
    dept: Optional[Department],
    explicit: dict[str, Optional[bool]],
) -> dict[str, bool]:
    out: dict[str, bool] = {}
    for cap in CATALOG_CAPS:
        value = explicit.get(cap)
        if value is not None:
            out[cap] = bool(value)
        elif dept is not None:
            out[cap] = bool(getattr(dept, cap, False))
        else:
            out[cap] = False
    return out


def _validate_department(session: Session, tenant_id: int, department_id: Optional[int]) -> Optional[Department]:
    if department_id is None:
        return None
    dept = session.get(Department, department_id)
    if not dept or dept.tenant_id != tenant_id:
        raise ValueError("El departamento debe pertenecer al mismo tenant")
    return dept


def _enforce_inheritance(
    session: Session,
    tenant_id: int,
    department_id: Optional[int],
    flags: dict[str, Optional[bool]],
) -> dict[str, Optional[bool]]:
    """Valida solo que el dept pertenezca al tenant. Las caps del puesto son
    independientes de las del dept."""
    _validate_department(session, tenant_id, department_id)
    return flags


def list_positions(
    session: Session,
    current_user: User,
    tenant_id: Optional[int] = None,
    include_inactive: bool = False,
) -> list[PositionRead]:
    if not current_user.is_super_admin:
        tenant_id = current_user.tenant_id

    stmt = select(Position)
    if tenant_id is not None:
        stmt = stmt.where(Position.tenant_id == tenant_id)
    if not include_inactive:
        stmt = stmt.where(Position.is_active == True)  # noqa: E712
    stmt = stmt.order_by(Position.level.desc(), Position.name)
    return [_to_read(p) for p in session.exec(stmt).all()]


def create_position(
    session: Session,
    current_user: User,
    tenant_id: int,
    data: PositionCreate,
) -> PositionRead:
    _ensure_same_tenant(tenant_id, current_user)
    _enforce_inheritance(
        session,
        tenant_id,
        data.department_id,
        {cap: getattr(data, cap) for cap in COMPARATIVE_CAPS},
    )

    existing = session.exec(
        select(Position).where(
            Position.tenant_id == tenant_id,
            Position.name == data.name,
        )
    ).one_or_none()
    if existing:
        raise ValueError(f"Ya existe un puesto con nombre '{data.name}' en este tenant")

    # role_code se infiere del nombre del puesto (no se selecciona en UI).
    # Si llega explícito en payload (compat o super_admin), se respeta tras normalizar.
    explicit_role_code = _normalize_role_code(data.role_code)
    inferred_role_code = _infer_role_code_from_name(data.name)
    resolved_role_code = explicit_role_code or inferred_role_code

    # Defaults Department → Position para caps de contrato. En create el
    # payload del front trae el estado completo del form (que ya pre-marca
    # según el dept). Aquí aplicamos refuerzo: si el dept tiene una cap=True
    # y el payload viene False, el dept gana (no se puede desmarcar la cap
    # del puesto si el dept la concede). La cap se desmarca eliminándola del
    # Department.
    target_dept = _validate_department(session, tenant_id, data.department_id)
    explicit_caps: dict[str, Optional[bool]] = {}
    fields_set = getattr(data, "model_fields_set", set()) or set()
    for cap in CONTRACT_CAPS:
        if cap in fields_set:
            # El admin lo seleccionó explícitamente en el form.
            explicit_caps[cap] = bool(getattr(data, cap))
        else:
            explicit_caps[cap] = None
    contract_defaults = _apply_dept_contract_defaults(target_dept, explicit_caps)
    explicit_catalog_caps: dict[str, Optional[bool]] = {}
    for cap in CATALOG_CAPS:
        explicit_catalog_caps[cap] = bool(getattr(data, cap)) if cap in fields_set else None
    catalog_defaults = _apply_dept_catalog_defaults(target_dept, explicit_catalog_caps)

    pos = Position(
        tenant_id=tenant_id,
        name=data.name,
        department_id=data.department_id,
        level=data.level,
        role_code=resolved_role_code,
        can_create_comparative=data.can_create_comparative,
        can_edit_comparative=data.can_edit_comparative,
        can_delete_comparative=data.can_delete_comparative,
        can_approve_comparative=data.can_approve_comparative,
        can_reject_comparative=data.can_reject_comparative,
        can_view_contract=contract_defaults["can_view_contract"],
        can_edit_contract=contract_defaults["can_edit_contract"],
        can_regenerate_contract=contract_defaults["can_regenerate_contract"],
        can_approve_contract=contract_defaults["can_approve_contract"],
        can_reject_contract=contract_defaults["can_reject_contract"],
        can_view_worksite=catalog_defaults["can_view_worksite"],
        can_edit_worksite=catalog_defaults["can_edit_worksite"],
        can_view_provider=catalog_defaults["can_view_provider"],
        can_edit_provider=catalog_defaults["can_edit_provider"],
        is_active=data.is_active,
    )
    session.add(pos)
    session.commit()
    session.refresh(pos)

    log_action(
        session,
        user_id=current_user.id,
        tenant_id=tenant_id,
        action="org.position.create",
        details=f"Puesto creado: {pos.name} (id={pos.id})",
    )
    return _to_read(pos)


def update_position(
    session: Session,
    current_user: User,
    position_id: int,
    data: PositionUpdate,
) -> PositionRead:
    pos = session.get(Position, position_id)
    if not pos:
        raise ValueError("Puesto no encontrado")
    _ensure_same_tenant(pos.tenant_id, current_user)

    if data.department_id is not None:
        _validate_department(session, pos.tenant_id, data.department_id)
        pos.department_id = data.department_id

    if data.name is not None and data.name != pos.name:
        clash = session.exec(
            select(Position).where(
                Position.tenant_id == pos.tenant_id,
                Position.name == data.name,
                Position.id != pos.id,
            )
        ).one_or_none()
        if clash:
            raise ValueError(f"Ya existe un puesto con nombre '{data.name}' en este tenant")
        pos.name = data.name

    target_dept_id = pos.department_id
    effective_caps = {
        cap: (getattr(data, cap) if getattr(data, cap) is not None else getattr(pos, cap))
        for cap in COMPARATIVE_CAPS
    }
    _enforce_inheritance(session, pos.tenant_id, target_dept_id, effective_caps)

    for field in ("level", *COMPARATIVE_CAPS, "is_active"):
        value = getattr(data, field)
        if value is not None:
            setattr(pos, field, value)

    # Caps de contrato: para cada cap, lo recibido del payload se aplica
    # SOLO si llega no-None. Además, si el Department actual del puesto
    # tiene cap=True, gana sobre cualquier intento de marcarla False en
    # Position (no se puede "desmarcar" una cap que el dept concede).
    # Para quitar la cap, hay que destildarla en el Department.
    dept_for_defaults = (
        session.get(Department, pos.department_id)
        if pos.department_id is not None
        else None
    )
    for cap in CONTRACT_CAPS:
        value = getattr(data, cap)
        if value is not None:
            setattr(pos, cap, bool(value))
        # Refuerzo dept: si el dept lo tiene a True, garantizamos True en Position.
        if dept_for_defaults is not None and getattr(dept_for_defaults, cap, False):
            setattr(pos, cap, True)

    for cap in CATALOG_CAPS:
        value = getattr(data, cap)
        if value is not None:
            setattr(pos, cap, bool(value))
        if dept_for_defaults is not None and getattr(dept_for_defaults, cap, False):
            setattr(pos, cap, True)

    previous_role_code = (pos.role_code or "").upper() or None
    if data.role_code is not None:
        # Payload explícito (compat / super_admin) — respeta.
        new_role_code = _normalize_role_code(data.role_code)
        pos.role_code = new_role_code
    elif data.name is not None and data.name != "":
        # Renombrado: re-inferir del nombre nuevo. Si la inferencia no detecta
        # JO/DT y el puesto antes era JO/DT, se mantiene el valor previo para
        # no romper asignaciones existentes sin intención explícita.
        inferred = _infer_role_code_from_name(pos.name)
        if inferred is not None:
            new_role_code = inferred
            pos.role_code = inferred
        else:
            new_role_code = previous_role_code
    else:
        new_role_code = previous_role_code

    session.add(pos)
    session.commit()
    session.refresh(pos)

    # Si el puesto deja de ser 'DT', limpiar director_tecnico_id en JO que apuntaban a empleados con este puesto.
    if previous_role_code == "DT" and new_role_code != "DT":
        dt_employee_ids = session.exec(
            select(EmployeeProfile.id).where(
                EmployeeProfile.position_id == pos.id,
                EmployeeProfile.tenant_id == pos.tenant_id,
            )
        ).all()
        if dt_employee_ids:
            affected_jos = session.exec(
                select(EmployeeProfile).where(
                    EmployeeProfile.tenant_id == pos.tenant_id,
                    EmployeeProfile.director_tecnico_id.in_(dt_employee_ids),
                )
            ).all()
            jo_user_ids: list[int] = []
            for jo in affected_jos:
                jo.director_tecnico_id = None
                session.add(jo)
                if jo.user_id:
                    jo_user_ids.append(jo.user_id)
            if affected_jos:
                session.commit()
            for uid in jo_user_ids:
                invalidate_user_me_cache(uid)

    # Si el puesto deja de ser 'JO', limpiar director_tecnico_id en sus empleados.
    if previous_role_code == "JO" and new_role_code != "JO":
        jos_with_this_pos = session.exec(
            select(EmployeeProfile).where(
                EmployeeProfile.position_id == pos.id,
                EmployeeProfile.tenant_id == pos.tenant_id,
                EmployeeProfile.director_tecnico_id.is_not(None),
            )
        ).all()
        cleared_user_ids: list[int] = []
        for jo in jos_with_this_pos:
            jo.director_tecnico_id = None
            session.add(jo)
            if jo.user_id:
                cleared_user_ids.append(jo.user_id)
        if jos_with_this_pos:
            session.commit()
        for uid in cleared_user_ids:
            invalidate_user_me_cache(uid)

    affected_user_ids = session.exec(
        select(EmployeeProfile.user_id).where(
            EmployeeProfile.position_id == pos.id,
            EmployeeProfile.tenant_id == pos.tenant_id,
            EmployeeProfile.is_active.is_(True),
        )
    ).all()
    for uid in affected_user_ids:
        invalidate_user_me_cache(uid)

    log_action(
        session,
        user_id=current_user.id,
        tenant_id=pos.tenant_id,
        action="org.position.update",
        details=f"Puesto actualizado: {pos.id}",
    )
    return _to_read(pos)


def delete_position(
    session: Session,
    current_user: User,
    position_id: int,
) -> None:
    pos = session.get(Position, position_id)
    if not pos:
        raise ValueError("Puesto no encontrado")
    _ensure_same_tenant(pos.tenant_id, current_user)

    in_use = session.exec(
        select(EmployeeProfile.id).where(EmployeeProfile.position_id == pos.id).limit(1)
    ).one_or_none()
    if in_use:
        raise ValueError(
            "No se puede eliminar el puesto porque tiene empleados asignados. "
            "Reasigna o desactiva el puesto en su lugar."
        )

    session.delete(pos)
    session.commit()

    log_action(
        session,
        user_id=current_user.id,
        tenant_id=pos.tenant_id,
        action="org.position.delete",
        details=f"Puesto eliminado: {position_id}",
    )
