"""Enums del flujo nuevo de comparativos y contratos (Fase 1).

Todos los valores se almacenan como VARCHAR(32) en columnas SQL, no como
PostgreSQL ENUM nativo. Asi se evita tener que registrar nuevos tipos en
``_ensure_enum_values`` y se simplifica el bootstrap.
"""

from enum import Enum


class EstadoComparativo(str, Enum):
    BORRADOR = "BORRADOR"
    PENDIENTE_APROBACION = "PENDIENTE_APROBACION"
    NECESITA_CAMBIOS = "NECESITA_CAMBIOS"
    APROBADO = "APROBADO"
    RECHAZADO = "RECHAZADO"


class EstadoAprobacionComparativo(str, Enum):
    PENDIENTE = "PENDIENTE"
    APROBADO = "APROBADO"
    RECHAZADO = "RECHAZADO"
    OMITIDO = "OMITIDO"
    CADUCADO = "CADUCADO"


class AccionHistorialComparativo(str, Enum):
    CREACION = "CREACION"
    EDICION = "EDICION"
    ENVIO_APROBACION = "ENVIO_APROBACION"
    APROBACION = "APROBACION"
    RECHAZO = "RECHAZO"
    DEVOLUCION_CAMBIOS = "DEVOLUCION_CAMBIOS"
    GENERACION_CONTRATO = "GENERACION_CONTRATO"


class EstadoContrato(str, Enum):
    BORRADOR = "BORRADOR"
    PENDIENTE_FIRMA = "PENDIENTE_FIRMA"
    ENVIADO_FIRMA = "ENVIADO_FIRMA"
    FIRMADO = "FIRMADO"
    RECHAZADO = "RECHAZADO"


class AccionHistorialContrato(str, Enum):
    CREACION = "CREACION"
    EDICION = "EDICION"
    ENVIO_FIRMA = "ENVIO_FIRMA"
    FIRMA = "FIRMA"
    RECHAZO = "RECHAZO"
