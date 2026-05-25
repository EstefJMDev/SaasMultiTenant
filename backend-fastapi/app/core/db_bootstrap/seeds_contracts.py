from pathlib import Path

from sqlalchemy import text
import shutil

from app.core.config import settings
from app.core.db_session import engine


def _ensure_contract_approval_step_order(inspector, table_names):
    if "contract_approval" in table_names:
        approval_columns = {col["name"] for col in inspector.get_columns("contract_approval")}
        with engine.begin() as conn:
            if "step_order" not in approval_columns:
                conn.execute(
                    text("ALTER TABLE contract_approval ADD COLUMN step_order INTEGER NULL")
                )


def _seed_contract_workflow(inspector, table_names):
    # Seed de workflow por tenant para contratos (si no existe configuracion).
    if {"tenant", "contract_workflow_step"}.issubset(table_names):
        step_columns = {col["name"] for col in inspector.get_columns("contract_workflow_step")}
        with engine.begin() as conn:
            if "department_name" not in step_columns:
                conn.execute(
                    text(
                        "ALTER TABLE contract_workflow_step "
                        "ADD COLUMN department_name VARCHAR(120) NULL"
                    )
                )
            if "department_id" not in step_columns:
                conn.execute(
                    text(
                        "ALTER TABLE contract_workflow_step "
                        "ADD COLUMN department_id INTEGER NULL"
                    )
                )
            if "department" in step_columns:
                conn.execute(
                    text(
                        "UPDATE contract_workflow_step "
                        "SET department_name = COALESCE(department_name, department::text)"
                    )
                )
            conn.execute(
                text(
                    "UPDATE contract_workflow_step "
                    "SET department_name = COALESCE(NULLIF(TRIM(department_name), ''), 'DEPARTAMENTO')"
                )
            )
            conn.execute(
                text(
                    """
                    INSERT INTO contract_workflow_step (tenant_id, step_order, department_name, is_active, created_at, updated_at)
                    SELECT t.id, wf.step_order, wf.department_name, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                    FROM tenant t
                    CROSS JOIN (
                        VALUES
                            (1, 'GERENCIA'),
                            (2, 'ADMIN'),
                            (3, 'COMPRAS'),
                            (4, 'JURIDICO')
                    ) AS wf(step_order, department_name)
                    WHERE NOT EXISTS (
                        SELECT 1
                        FROM contract_workflow_step cws
                        WHERE cws.tenant_id = t.id
                    )
                    """
                )
            )

    if "erp_task" in table_names:
        task_columns = {col["name"] for col in inspector.get_columns("erp_task")}
        with engine.begin() as conn:
            if "tenant_id" not in task_columns:
                conn.execute(
                    text("ALTER TABLE erp_task ADD COLUMN tenant_id INTEGER NULL")
                )
            if "status" not in task_columns:
                # Backfill rapido para entornos locales sin migraciones.
                conn.execute(
                    text(
                        "ALTER TABLE erp_task "
                        "ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'pending'"
                    )
                )
                conn.execute(
                    text(
                        "UPDATE erp_task "
                        "SET status = CASE WHEN is_completed THEN 'done' ELSE 'pending' END "
                        "WHERE status IS NULL"
                    )
                )
            if "start_date" not in task_columns:
                conn.execute(
                    text(
                        "ALTER TABLE erp_task "
                        "ADD COLUMN start_date TIMESTAMP NULL"
                    )
                )
            if "end_date" not in task_columns:
                conn.execute(
                    text(
                        "ALTER TABLE erp_task "
                        "ADD COLUMN end_date TIMESTAMP NULL"
                    )
                )
            if "subactivity_id" not in task_columns:
                conn.execute(
                    text(
                        "ALTER TABLE erp_task "
                        "ADD COLUMN subactivity_id INTEGER NULL"
                    )
                )
            if "task_template_id" not in task_columns:
                conn.execute(
                    text(
                        "ALTER TABLE erp_task "
                        "ADD COLUMN task_template_id INTEGER NULL"
                    )
                )

    if "erp_project" in table_names:
        project_columns = {col["name"] for col in inspector.get_columns("erp_project")}
        with engine.begin() as conn:
            if "tenant_id" not in project_columns:
                conn.execute(
                    text("ALTER TABLE erp_project ADD COLUMN tenant_id INTEGER NULL")
                )
            if "project_type" not in project_columns:
                conn.execute(
                    text("ALTER TABLE erp_project ADD COLUMN project_type VARCHAR(32) NULL")
                )
            if "department_id" not in project_columns:
                conn.execute(
                    text("ALTER TABLE erp_project ADD COLUMN department_id INTEGER NULL")
                )
            if "subsidy_percent" not in project_columns:
                conn.execute(
                    text("ALTER TABLE erp_project ADD COLUMN subsidy_percent NUMERIC(5,2) NULL")
                )
            if "loan_percent" not in project_columns:
                conn.execute(
                    text("ALTER TABLE erp_project ADD COLUMN loan_percent NUMERIC(5,2) NULL")
                )
            if "start_date" not in project_columns:
                conn.execute(
                    text(
                        "ALTER TABLE erp_project "
                        "ADD COLUMN start_date TIMESTAMP NULL"
                    )
                )
            if "end_date" not in project_columns:
                conn.execute(
                    text(
                        "ALTER TABLE erp_project "
                        "ADD COLUMN end_date TIMESTAMP NULL"
                    )
                )
            if "duration_months" not in project_columns:
                conn.execute(
                    text(
                        "ALTER TABLE erp_project "
                        "ADD COLUMN duration_months INTEGER NULL"
                    )
                )

    if "erp_project_document" in table_names:
        doc_columns = {col["name"] for col in inspector.get_columns("erp_project_document")}
        with engine.begin() as conn:
            if "doc_type" not in doc_columns:
                conn.execute(
                    text(
                        "ALTER TABLE erp_project_document "
                        "ADD COLUMN doc_type VARCHAR(40) NOT NULL DEFAULT 'otros'"
                    )
                )


# Departamentos fijos por tenant.
# Obra → solo ve gestión de obra + settings básicos
# Gerencia → ve todo
_DEFAULT_DEPARTMENTS: list[tuple[str, dict[str, bool]]] = [
    (
        "Obra",
        {
            "dashboard": True,
            "work_management": True,
            "work_comparatives": True,
            "work_contracts": True,
            "work_worksites": True,
            "work_providers": True,
            "settings": True,
            # Resto oculto: erp, hr, users, admin, etc.
            "erp": False,
            "erp_time_control": False,
            "erp_tasks": False,
            "erp_projects": False,
            "erp_external_collaborations": False,
            "erp_simulations": False,
            "erp_invoices": False,
            "legal": False,
            "legal_contracts": False,
            "administration_department": False,
            "administration_contracts": False,
            "administration_worksites": False,
            "administration_providers": False,
            "hr": False,
            "hr_departments": False,
            "hr_employees": False,
            "hr_talent": False,
            "users": False,
            "tools": False,
            "tenant_settings": False,
            "settings_branding": False,
            "settings_department_emails": False,
            "audit_logs": False,
            "support": True,
        },
    ),
    (
        "Gerencia",
        {
            # Gerencia ve todo por defecto (los flags True por defecto en schema).
            "dashboard": True,
            "erp": True,
            "erp_time_control": True,
            "erp_tasks": True,
            "erp_projects": True,
            "erp_external_collaborations": True,
            "erp_simulations": True,
            "erp_invoices": True,
            "work_management": True,
            "work_contracts": True,
            "work_comparatives": True,
            "work_worksites": True,
            "work_providers": True,
            "legal": True,
            "legal_contracts": True,
            "administration_department": True,
            "administration_contracts": True,
            "administration_worksites": True,
            "administration_providers": True,
            "hr": True,
            "hr_departments": True,
            "hr_employees": True,
            "hr_talent": True,
            "users": True,
            "tools": True,
            "tenant_settings": True,
            "settings": True,
            "settings_branding": True,
            "settings_department_emails": True,
            "audit_logs": True,
            "support": True,
        },
    ),
]


# Catálogo base de posiciones por tenant.
# (name, department_name, level, can_create_comparative, can_edit_comparative,
#  can_delete_comparative, can_approve_comparative, can_reject_comparative,
#  can_view_all_comparatives, can_view_contract, can_edit_contract,
#  can_regenerate_contract, can_approve_contract, can_reject_contract,
#  can_view_worksite, can_edit_worksite, can_view_provider, can_edit_provider)
_DEFAULT_POSITIONS: list[
    tuple[str, str, int, bool, bool, bool, bool, bool, bool, bool, bool, bool, bool, bool, bool, bool, bool, bool]
] = [
    ("Jefe de Obra", "Obra", 1, True, True, True, False, False, False, True, False, False, True, True, True, False, True, False),
    ("Director Técnico", "Obra", 2, False, False, False, True, True, False, True, False, False, True, True, True, False, True, False),
    ("Gerente", "Gerencia", 3, False, False, False, True, True, True, True, False, False, True, True, True, True, True, True),
    ("Director General", "Gerencia", 4, False, False, False, True, True, True, True, False, False, True, True, True, True, True, True),
]


def _infer_role_code_from_position_name(name: str | None) -> str | None:
    if not name:
        return None
    normalized = (
        name.strip()
        .lower()
        .replace("á", "a")
        .replace("é", "e")
        .replace("í", "i")
        .replace("ó", "o")
        .replace("ú", "u")
    )
    if "jefe de obra" in normalized:
        return "JO"
    if "director tecnico" in normalized:
        return "DT"
    return None


# Capacidades obra por defecto por departamento.
# Solo Obra y Gerencia tienen capacidades comparativos por defecto.
_DEPARTMENT_OBRA_CAPS: dict[str, dict[str, bool]] = {
    "Obra": {
        "can_create_comparative": True,
        "can_edit_comparative": True,
        "can_delete_comparative": True,
        "can_approve_comparative": True,
        "can_reject_comparative": True,
        "can_view_contract": False,
        "can_edit_contract": False,
        "can_regenerate_contract": False,
        "can_approve_contract": False,
        "can_reject_contract": False,
        "can_view_worksite": True,
        "can_edit_worksite": False,
        "can_view_provider": True,
        "can_edit_provider": False,
    },
    "Gerencia": {
        "can_create_comparative": True,
        "can_edit_comparative": True,
        "can_delete_comparative": True,
        "can_approve_comparative": True,
        "can_reject_comparative": True,
        "can_view_contract": True,
        "can_edit_contract": False,
        "can_regenerate_contract": False,
        "can_approve_contract": True,
        "can_reject_contract": True,
        "can_view_worksite": True,
        "can_edit_worksite": True,
        "can_view_provider": True,
        "can_edit_provider": True,
    },
}

_NAMED_DEPARTMENT_CAP_OVERRIDES: dict[str, dict[str, bool]] = {
    "Obra": _DEPARTMENT_OBRA_CAPS["Obra"],
    "Gerencia": _DEPARTMENT_OBRA_CAPS["Gerencia"],
    "Administración": {
        "can_view_contract": True,
        "can_edit_contract": True,
        "can_regenerate_contract": True,
        "can_approve_contract": True,
        "can_reject_contract": False,
        "can_view_worksite": True,
        "can_edit_worksite": True,
        "can_view_provider": True,
        "can_edit_provider": True,
    },
    "Administracion": {
        "can_view_contract": True,
        "can_edit_contract": True,
        "can_regenerate_contract": True,
        "can_approve_contract": True,
        "can_reject_contract": False,
        "can_view_worksite": True,
        "can_edit_worksite": True,
        "can_view_provider": True,
        "can_edit_provider": True,
    },
    "Jurídico": {
        "can_view_contract": True,
        "can_edit_contract": False,
        "can_regenerate_contract": False,
        "can_approve_contract": True,
        "can_reject_contract": True,
        "can_view_worksite": False,
        "can_edit_worksite": False,
        "can_view_provider": False,
        "can_edit_provider": False,
    },
    "Juridico": {
        "can_view_contract": True,
        "can_edit_contract": False,
        "can_regenerate_contract": False,
        "can_approve_contract": True,
        "can_reject_contract": True,
        "can_view_worksite": False,
        "can_edit_worksite": False,
        "can_view_provider": False,
        "can_edit_provider": False,
    },
    "Legal": {
        "can_view_contract": True,
        "can_edit_contract": False,
        "can_regenerate_contract": False,
        "can_approve_contract": True,
        "can_reject_contract": True,
        "can_view_worksite": False,
        "can_edit_worksite": False,
        "can_view_provider": False,
        "can_edit_provider": False,
    },
}


def _seed_default_departments(inspector, table_names):
    """Seed dptos fijos Obra/Gerencia por tenant. Idempotente por (tenant_id, name)."""
    if not {"tenant", "department"}.issubset(table_names):
        return

    import json

    with engine.begin() as conn:
        for name, menu_visibility in _DEFAULT_DEPARTMENTS:
            caps = _DEPARTMENT_OBRA_CAPS.get(
                name,
                {
                    "can_create_comparative": False,
                    "can_edit_comparative": False,
                    "can_delete_comparative": False,
                    "can_approve_comparative": False,
                    "can_reject_comparative": False,
                    "can_view_contract": False,
                    "can_edit_contract": False,
                    "can_regenerate_contract": False,
                    "can_approve_contract": False,
                    "can_reject_contract": False,
                    "can_view_worksite": False,
                    "can_edit_worksite": False,
                    "can_view_provider": False,
                    "can_edit_provider": False,
                },
            )
            conn.execute(
                text(
                    """
                    INSERT INTO department (
                        tenant_id, name, is_active,
                        project_allocation_percentage, menu_visibility,
                        can_create_comparative, can_edit_comparative,
                        can_delete_comparative, can_approve_comparative,
                        can_reject_comparative,
                        can_view_contract, can_edit_contract,
                        can_regenerate_contract, can_approve_contract,
                        can_reject_contract,
                        can_view_worksite, can_edit_worksite,
                        can_view_provider, can_edit_provider,
                        created_at
                    )
                    SELECT t.id, :name, true, 100, CAST(:menu AS JSON),
                           :cr, :ed, :de, :ap, :rj,
                           :cv, :ce, :cg, :ca, :cx,
                           :wv, :we, :pv, :pe,
                           CURRENT_TIMESTAMP
                    FROM tenant t
                    WHERE NOT EXISTS (
                        SELECT 1 FROM department d
                        WHERE d.tenant_id = t.id AND d.name = :name
                    )
                    """
                ),
                {
                    "name": name,
                    "menu": json.dumps(menu_visibility),
                    "cr": caps["can_create_comparative"],
                    "ed": caps["can_edit_comparative"],
                    "de": caps["can_delete_comparative"],
                    "ap": caps["can_approve_comparative"],
                    "rj": caps.get("can_reject_comparative", False),
                    "cv": caps.get("can_view_contract", False),
                    "ce": caps.get("can_edit_contract", False),
                    "cg": caps.get("can_regenerate_contract", False),
                    "ca": caps.get("can_approve_contract", False),
                    "cx": caps.get("can_reject_contract", False),
                    "wv": caps.get("can_view_worksite", False),
                    "we": caps.get("can_edit_worksite", False),
                    "pv": caps.get("can_view_provider", False),
                    "pe": caps.get("can_edit_provider", False),
                },
            )
        for dept_name, caps in _NAMED_DEPARTMENT_CAP_OVERRIDES.items():
            conn.execute(
                text(
                    """
                    UPDATE department
                    SET
                        can_view_contract = :cv,
                        can_edit_contract = :ce,
                        can_regenerate_contract = :cg,
                        can_approve_contract = :ca,
                        can_reject_contract = :cx,
                        can_view_worksite = :wv,
                        can_edit_worksite = :we,
                        can_view_provider = :pv,
                        can_edit_provider = :pe
                    WHERE name = :name
                    """
                ),
                {
                    "name": dept_name,
                    "cv": caps.get("can_view_contract", False),
                    "ce": caps.get("can_edit_contract", False),
                    "cg": caps.get("can_regenerate_contract", False),
                    "ca": caps.get("can_approve_contract", False),
                    "cx": caps.get("can_reject_contract", False),
                    "wv": caps.get("can_view_worksite", False),
                    "we": caps.get("can_edit_worksite", False),
                    "pv": caps.get("can_view_provider", False),
                    "pe": caps.get("can_edit_provider", False),
                },
            )


_UNIVERSAL_TEMPLATES: list[tuple[str, str, str]] = [
    # (subtype, filename, display_name)
    ("subcontratacion", "subcontratacion.docx", "Plantilla universal — Subcontratacion"),
    ("servicio", "servicio.docx", "Plantilla universal — Servicio"),
    ("suministro", "suministro.docx", "Plantilla universal — Suministro"),
]

_UNIVERSAL_TEMPLATE_FALLBACKS: dict[str, tuple[str, ...]] = {
    "subcontratacion": (
        "CONTRATO_SUBCONTRATACION_template.docx",
        "plantilla_subcontratacion.docx",
    ),
    "servicio": (
        "CONTRATO_SERVICIOS_template.docx",
        "plantilla_servicio.docx",
    ),
    "suministro": (
        "CONTRATO_SUMINISTRO_template.docx",
        "plantilla_suministro.docx",
    ),
}


def _unwrap_sdt_content_in_docx(file_path: Path) -> int:
    """Reescribe el .docx desenvolviendo todos los <w:sdt> en su <w:sdtContent>.

    Word a veces guarda los tokens [VAR] dentro de Structured Document Tags
    (content controls). `python-docx` ignora ese contenido al iterar paragraphs
    y runs, por lo que ni la extraccion de variables ni la sustitucion los ven.

    Esta funcion abre el .docx (zip), modifica word/document.xml para sustituir
    cada `<w:sdt>` por sus hijos internos (`<w:sdtContent>`) y guarda el archivo.
    Idempotente: si no hay SDTs, no toca nada.

    Devuelve el numero de SDTs desenvueltos.
    """
    import shutil
    import zipfile
    from xml.etree import ElementTree as ET

    W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
    ET.register_namespace("w", W)

    try:
        with zipfile.ZipFile(file_path, "r") as zin:
            document_xml = zin.read("word/document.xml")
            styles_xml = zin.read("word/styles.xml") if "word/styles.xml" in zin.namelist() else b""
            other_files = {
                name: zin.read(name)
                for name in zin.namelist()
                if name not in ("word/document.xml", "word/styles.xml")
            }
    except (KeyError, zipfile.BadZipFile):
        return 0

    # Tamano objetivo uniforme para todo el cuerpo: 10pt (w:sz usa half-points -> 20)
    TARGET_SZ = "20"
    has_sdt = b"<w:sdt" in document_xml
    has_red_color = b'w:val="EE0000"' in document_xml or b'w:val="FF0000"' in document_xml
    has_nonstandard_size = bool(
        __import__("re").search(rb'<w:sz [^/]*w:val="(?!' + TARGET_SZ.encode() + rb'")', document_xml)
    )
    if not has_sdt and not has_red_color and not has_nonstandard_size:
        return 0

    backup = file_path.with_suffix(".pre_unwrap.docx")
    if not backup.exists():
        try:
            shutil.copy(file_path, backup)
        except OSError:
            pass

    try:
        root = ET.fromstring(document_xml)
    except ET.ParseError:
        return 0

    count = 0
    changed = True
    while changed:
        changed = False
        for parent in root.iter():
            children = list(parent)
            for idx, child in enumerate(children):
                if child.tag != f"{{{W}}}sdt":
                    continue
                content = child.find(f"{{{W}}}sdtContent")
                inner = list(content) if content is not None else []
                parent.remove(child)
                for i, sub in enumerate(inner):
                    parent.insert(idx + i, sub)
                count += 1
                changed = True
                break
            if changed:
                break

    # Limpia el color rojo (placeholder visual) de los runs que contienen un
    # token [VAR]: tras la sustitucion el dato real debe verse en negro.
    var_pattern = __import__("re").compile(r"\[[A-Z][A-Z0-9_]*\]")
    cleaned_colors = 0
    for run in root.iter(f"{{{W}}}r"):
        text_elems = [t for t in run.iter(f"{{{W}}}t")]
        joined = "".join((t.text or "") for t in text_elems)
        if not var_pattern.search(joined):
            continue
        rpr = run.find(f"{{{W}}}rPr")
        if rpr is None:
            continue
        color = rpr.find(f"{{{W}}}color")
        if color is not None:
            rpr.remove(color)
            cleaned_colors += 1

    # Normaliza el tamano de letra de todos los runs (w:sz / w:szCs) y tambien
    # los defaults de docDefaults a TARGET_SZ. Cualquier titulo/heading que
    # tuviera un tamano superior queda igualado a 10pt.
    resized_count = 0
    for sz in list(root.iter(f"{{{W}}}sz")) + list(root.iter(f"{{{W}}}szCs")):
        if sz.get(f"{{{W}}}val") != TARGET_SZ:
            sz.set(f"{{{W}}}val", TARGET_SZ)
            resized_count += 1

    if count == 0 and cleaned_colors == 0 and resized_count == 0:
        return 0

    body = ET.tostring(root, encoding="UTF-8")
    new_xml = (
        b'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + body
    )

    # Normaliza tambien styles.xml (docDefaults y styles individuales).
    new_styles_xml = styles_xml
    if styles_xml:
        try:
            styles_root = ET.fromstring(styles_xml)
            for sz in list(styles_root.iter(f"{{{W}}}sz")) + list(styles_root.iter(f"{{{W}}}szCs")):
                if sz.get(f"{{{W}}}val") != TARGET_SZ:
                    sz.set(f"{{{W}}}val", TARGET_SZ)
            new_styles_xml = (
                b'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
                + ET.tostring(styles_root, encoding="UTF-8")
            )
        except ET.ParseError:
            new_styles_xml = styles_xml

    try:
        with zipfile.ZipFile(file_path, "w", zipfile.ZIP_DEFLATED) as zout:
            for name, data in other_files.items():
                zout.writestr(name, data)
            zout.writestr("word/document.xml", new_xml)
            if styles_xml:
                zout.writestr("word/styles.xml", new_styles_xml)
    except OSError:
        return 0

    return count


def _extract_template_variables_safe(file_path: Path) -> list[str]:
    """Lee variables [NOMBRE] de un .docx. Devuelve lista vacia ante cualquier fallo.

    Antes de extraer, desenvuelve cualquier <w:sdt> que pudiera ocultar los
    tokens [VAR]. La operacion es idempotente: si no hay SDTs el archivo no
    se toca.
    """
    try:
        _unwrap_sdt_content_in_docx(file_path)
        from app.domains.procurement.contracts.templates_service import (
            extract_template_variables,
        )

        data = file_path.read_bytes()
        return extract_template_variables(data, "docx")
    except Exception:
        return []


def _resolve_universal_template_source(subtype: str) -> Path | None:
    fallback_names = _UNIVERSAL_TEMPLATE_FALLBACKS.get(subtype, ())
    if not fallback_names:
        return None

    candidate_dirs = [
        Path(__file__).resolve().parents[2] / "domains" / "procurement" / "contracts" / "templates",
        Path(__file__).resolve().parents[3] / "data" / "contracts" / "templates",
        Path(settings.contracts_storage_path) / "templates",
    ]

    for candidate_dir in candidate_dirs:
        for filename in fallback_names:
            candidate = candidate_dir / filename
            if candidate.is_file():
                return candidate
    return None


def _ensure_universal_template_files(base_dir: Path) -> None:
    base_dir.mkdir(parents=True, exist_ok=True)
    for subtype, filename, _display_name in _UNIVERSAL_TEMPLATES:
        target = base_dir / filename
        if target.is_file():
            continue
        source = _resolve_universal_template_source(subtype)
        if source is None:
            continue
        try:
            shutil.copy2(source, target)
        except OSError:
            continue


def _seed_universal_contract_templates(inspector, table_names):
    """Registra las 3 plantillas universales (subcontratacion/servicio/suministro)
    en `contract_template` para cada tenant existente.

    Idempotente por (tenant_id, subtype): si ya hay una plantilla activa para
    ese subtype no se duplica. Si los archivos canonicos no estan en disco
    (entorno minimo de tests) se omite silenciosamente.
    """
    if "contract_template" not in table_names or "tenant" not in table_names:
        return

    base_dir = Path(settings.contracts_storage_path) / "universal_templates"
    _ensure_universal_template_files(base_dir)
    if not base_dir.is_dir():
        return

    import json

    with engine.begin() as conn:
        tenant_ids = [row[0] for row in conn.execute(text("SELECT id FROM tenant")).all()]
        for tenant_id in tenant_ids:
            for subtype, filename, display_name in _UNIVERSAL_TEMPLATES:
                file_path = base_dir / filename
                if not file_path.is_file():
                    continue

                existing = conn.execute(
                    text(
                        "SELECT 1 FROM contract_template "
                        "WHERE tenant_id = :tenant_id "
                        "  AND subtype = :subtype "
                        "  AND is_active IS TRUE "
                        "LIMIT 1"
                    ),
                    {"tenant_id": tenant_id, "subtype": subtype},
                ).first()
                if existing:
                    continue

                variables = _extract_template_variables_safe(file_path)
                conn.execute(
                    text(
                        """
                        INSERT INTO contract_template (
                            tenant_id, created_by_id, name, subtype,
                            file_path, original_filename, file_format,
                            variables, is_active, created_at
                        )
                        VALUES (
                            :tenant_id, NULL, :name, :subtype,
                            :file_path, :original_filename, 'docx',
                            CAST(:variables AS JSONB), TRUE, CURRENT_TIMESTAMP
                        )
                        """
                    ),
                    {
                        "tenant_id": tenant_id,
                        "name": display_name,
                        "subtype": subtype,
                        "file_path": str(file_path),
                        "original_filename": filename,
                        "variables": json.dumps(variables),
                    },
                )


def _seed_positions(inspector, table_names):
    """Seed catálogo de posiciones por tenant, vinculadas a su dpto. Idempotente."""
    if not {"tenant", "position", "department"}.issubset(table_names):
        return

    with engine.begin() as conn:
        position_columns = {col["name"] for col in inspector.get_columns("position")}
        if "role_code" in position_columns:
            rows = conn.execute(text("SELECT id, name, role_code FROM position")).all()
            for position_id, name, role_code in rows:
                if (role_code or "").strip():
                    continue
                inferred_role_code = _infer_role_code_from_position_name(name)
                if not inferred_role_code:
                    continue
                conn.execute(
                    text("UPDATE position SET role_code = :role_code WHERE id = :position_id"),
                    {"role_code": inferred_role_code, "position_id": position_id},
                )

        for (
            name,
            dept_name,
            level,
            cr_comp,
            ed_comp,
            de_comp,
            ap_comp,
            rj_comp,
            vw_comp,
            cv_contract,
            ed_contract,
            rg_contract,
            ap_contract,
            rj_contract,
            vw_worksite,
            ed_worksite,
            vw_provider,
            ed_provider,
        ) in _DEFAULT_POSITIONS:
            # Cada cap depende solo del puesto: el gate runtime
            # `_has_comparative_cap` ignora las caps de departamento.
            cr = bool(cr_comp)
            ed = bool(ed_comp)
            de = bool(de_comp)
            ap = bool(ap_comp)
            rj = bool(rj_comp)
            vw = bool(vw_comp)
            cv = bool(cv_contract)
            ce = bool(ed_contract)
            cg = bool(rg_contract)
            ca = bool(ap_contract)
            cx = bool(rj_contract)
            wv = bool(vw_worksite)
            we = bool(ed_worksite)
            pv = bool(vw_provider)
            pe = bool(ed_provider)
            conn.execute(
                text(
                    """
                    INSERT INTO position (
                        tenant_id, department_id, name, level,
                        can_create_comparative, can_edit_comparative,
                        can_delete_comparative, can_approve_comparative,
                        can_reject_comparative, can_view_all_comparatives,
                        can_view_contract, can_edit_contract,
                        can_regenerate_contract, can_approve_contract,
                        can_reject_contract,
                        can_view_worksite, can_edit_worksite,
                        can_view_provider, can_edit_provider,
                        is_active, created_at
                    )
                    SELECT t.id,
                           (SELECT d.id FROM department d
                            WHERE d.tenant_id = t.id AND d.name = :dept_name
                            LIMIT 1),
                           :name, :level,
                           :cr, :ed, :de, :ap, :rj, :vw,
                           :cv, :ce, :cg, :ca, :cx,
                           :wv, :we, :pv, :pe,
                           true, CURRENT_TIMESTAMP
                    FROM tenant t
                    WHERE NOT EXISTS (
                        SELECT 1 FROM position p
                        WHERE p.tenant_id = t.id AND p.name = :name
                    )
                    """
                ),
                {
                    "name": name,
                    "dept_name": dept_name,
                    "level": level,
                    "cr": cr,
                    "ed": ed,
                    "de": de,
                    "ap": ap,
                    "rj": rj,
                    "vw": vw,
                    "cv": cv,
                    "ce": ce,
                    "cg": cg,
                    "ca": ca,
                    "cx": cx,
                    "wv": wv,
                    "we": we,
                    "pv": pv,
                    "pe": pe,
                },
            )
            inferred_role_code = _infer_role_code_from_position_name(name)
            conn.execute(
                text(
                    """
                    UPDATE position
                    SET
                        role_code = COALESCE(:role_code, role_code),
                        can_create_comparative = :cr,
                        can_edit_comparative = :ed,
                        can_delete_comparative = :de,
                        can_approve_comparative = :ap,
                        can_reject_comparative = :rj,
                        can_view_all_comparatives = :vw,
                        can_view_contract = :cv,
                        can_edit_contract = :ce,
                        can_regenerate_contract = :cg,
                        can_approve_contract = :ca,
                        can_reject_contract = :cx,
                        can_view_worksite = :wv,
                        can_edit_worksite = :we,
                        can_view_provider = :pv,
                        can_edit_provider = :pe
                    WHERE name = :name
                    """
                ),
                {
                    "name": name,
                    "role_code": inferred_role_code,
                    "cr": cr,
                    "ed": ed,
                    "de": de,
                    "ap": ap,
                    "rj": rj,
                    "vw": vw,
                    "cv": cv,
                    "ce": ce,
                    "cg": cg,
                    "ca": ca,
                    "cx": cx,
                    "wv": wv,
                    "we": we,
                    "pv": pv,
                    "pe": pe,
                },
            )
