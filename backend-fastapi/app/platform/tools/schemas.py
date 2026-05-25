from pydantic import BaseModel, Field


class ToolEntitlementRead(BaseModel):
    id: int
    slug: str
    name: str
    enabled: bool = True
    category: str | None = None
    required_permissions: list[str] = Field(default_factory=list)
    ui_routes: list[str] = Field(default_factory=list)


class MeEntitlementsRead(BaseModel):
    tenantId: int | None = None
    departmentId: int | None = None
    role: str | None = None
    tools: list[ToolEntitlementRead] = Field(default_factory=list)
    permissions: list[str] = Field(default_factory=list)
