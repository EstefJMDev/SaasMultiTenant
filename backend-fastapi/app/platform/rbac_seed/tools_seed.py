from __future__ import annotations

from sqlmodel import Session, select

from app.core.config import settings
from app.models.tenant import Tenant
from app.models.tenant_tool import TenantTool
from app.models.tool import Tool


def ensure_tools_catalog(session: Session) -> dict[str, Tool]:
    frontend_base = settings.frontend_base_url or ""
    erp_base_url = (
        f"{frontend_base.rstrip('/')}/erp/projects" if frontend_base else ""
    )

    tools_def = [
        {
            "slug": "moodle",
            "name": "Moodle LMS",
            "base_url": "https://moodle.mavico.shop",
            "description": "Plataforma de formaci?n online para tu organizacion.",
        },
        {
            "slug": "erp",
            "name": "ERP Interno",
            "base_url": erp_base_url,
            "description": "Modulo ERP integrado en el dashboard (FastAPI).",
        },
        {
            "slug": "procurement",
            "name": "Procurement",
            "base_url": f"{frontend_base.rstrip('/')}/contracts" if frontend_base else "",
            "description": "Compras y contratos (FastAPI).",
        },
        {
            "slug": "signatures",
            "name": "Signatures",
            "base_url": f"{frontend_base.rstrip('/')}/signatures" if frontend_base else "",
            "description": "Gestion de firmas y configuracion (FastAPI).",
        },
        {
            "slug": "org",
            "name": "Org",
            "base_url": f"{frontend_base.rstrip('/')}/hr" if frontend_base else "",
            "description": "Modulo de organizacion y RRHH (FastAPI).",
        },
        {
            "slug": "projects",
            "name": "Projects",
            "base_url": f"{frontend_base.rstrip('/')}/projects" if frontend_base else "",
            "description": "Gestion de proyectos y presupuestos (FastAPI).",
        },
        {
            "slug": "tickets",
            "name": "Support Tickets",
            "base_url": f"{frontend_base.rstrip('/')}/support" if frontend_base else "",
            "description": "Gestion de tickets de soporte (FastAPI).",
        },
    ]

    existing_tools = {
        t.slug: t for t in session.exec(select(Tool)).all()
    }

    for td in tools_def:
        existing = existing_tools.get(td["slug"])
        if existing:
            changed = False
            if existing.name != td["name"]:
                existing.name = td["name"]
                changed = True
            if existing.base_url != td["base_url"]:
                existing.base_url = td["base_url"]
                changed = True
            if existing.description != td["description"]:
                existing.description = td["description"]
                changed = True
            if changed:
                session.add(existing)
                session.commit()
                session.refresh(existing)
            continue
        tool = Tool(
            name=td["name"],
            slug=td["slug"],
            base_url=td["base_url"],
            description=td["description"],
        )
        session.add(tool)
        session.commit()
        session.refresh(tool)
        existing_tools[td["slug"]] = tool

    return existing_tools


def ensure_tenant_tools(
    session: Session,
    tenant: Tenant,
    tools: dict[str, Tool],
    *,
    force_enable: bool = False,
) -> None:
    existing_tenant_tools = session.exec(
        select(TenantTool).where(TenantTool.tenant_id == tenant.id),
    ).all()
    existing_pairs = {(tt.tenant_id, tt.tool_id) for tt in existing_tenant_tools}
    existing_by_tool: dict[int, TenantTool] = {
        tt.tool_id: tt for tt in existing_tenant_tools
    }

    to_add: list[TenantTool] = []
    changed = False
    for tool in tools.values():
        key = (tenant.id, tool.id)
        if key in existing_pairs:
            if force_enable:
                tenant_tool = existing_by_tool.get(tool.id)
                if tenant_tool and not tenant_tool.is_enabled:
                    tenant_tool.is_enabled = True
                    session.add(tenant_tool)
                    changed = True
            continue
        to_add.append(
            TenantTool(
                tenant_id=tenant.id,
                tool_id=tool.id,
                is_enabled=True,
            ),
        )

    if to_add:
        session.add_all(to_add)
        changed = True

    if changed:
        session.commit()


def ensure_default_tools_for_tenant(session: Session, tenant: Tenant) -> None:
    tools = ensure_tools_catalog(session)
    ensure_tenant_tools(session, tenant, tools, force_enable=True)


def ensure_default_tools_for_all_tenants(session: Session) -> None:
    tools = ensure_tools_catalog(session)
    tenants = session.exec(select(Tenant)).all()
    for tenant in tenants:
        ensure_tenant_tools(session, tenant, tools, force_enable=True)
