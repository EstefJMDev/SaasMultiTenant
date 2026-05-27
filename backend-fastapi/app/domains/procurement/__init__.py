"""Dominio procurement.

Superficie viva del paquete:
- ``comparativos_v2``: flujo canonico de comparativos.
- ``contratos_v2``: flujo canonico de contratos derivados.
- ``contracts``: capa legacy/adaptadora aun necesaria mientras existan rutas
  publicas, onboarding y partes del flujo antiguo en produccion.
- ``documents``: generacion, almacenamiento y firma.
- ``workflow``: aprobaciones y notificaciones de contratos.

Modulos compartidos en raiz:
- ``router``: entrada HTTP del dominio.
- ``deps``: dependencias FastAPI comunes.
- ``api``: facade legacy usada por adapters internos y rutas publicas antiguas.
- ``notifications``, ``suppliers``, ``rea_validator``: utilidades compartidas.
"""

from app.domains.procurement.router import router

__all__ = ["router"]
