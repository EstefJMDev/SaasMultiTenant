from pydantic import BaseModel


class ToolRead(BaseModel):
    """
    Esquema de lectura de herramienta.
    """

    id: int
    name: str
    slug: str
    base_url: str
    description: str | None = None


class ToolLaunchResponse(BaseModel):
    """
    Respuesta al lanzar una herramienta externa.
    """

    launch_url: str
    tool_id: int
    tool_name: str


class ToolEnableUpdate(BaseModel):
    """
    Payload para habilitar/deshabilitar una herramienta para un tenant.
    """

    is_enabled: bool
