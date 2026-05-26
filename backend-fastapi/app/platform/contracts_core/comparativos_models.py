"""Modelos SQLModel del flujo nuevo de comparativos y contratos (Fase 1).

Diseno:
- Todos los nombres de tablas y columnas en espanol.
- ``proveedor_id`` referencia ``proveedores.id`` (BIGINT). La tabla maestra
  ``proveedores`` no esta modelada en SQLModel: solo se accede via SQL raw
  desde otros modulos. La FK funciona porque SQLAlchemy admite FK por
  string aunque el target no este mapeado.
- ``cif`` y ``razon_social`` NO se guardan en comparativos: se resuelven
  en lectura via ``proveedor_id``.
- ``Supplier`` legacy NO interviene en este flujo.
- Todos los estados se almacenan como VARCHAR(32) (no PostgreSQL ENUM)
  para evitar registrar tipos nuevos en ``_ensure_enum_values``.
- Cada tabla tiene ``tenant_id`` por consistencia multitenancy del repo.
"""

from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Optional

from sqlalchemy import BigInteger, Column, ForeignKey, Index, Numeric, Table, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel

from app.platform.contracts_core.comparativos_enums import (
    AccionHistorialComparativo,
    AccionHistorialContrato,
    EstadoAprobacionComparativo,
    EstadoComparativo,
    EstadoContrato,
)


# ---------------------------------------------------------------------------
# Shell minimo de `proveedores` en el metadata SQLModel.
#
# La tabla `proveedores` es la maestra universal (BIGINT PK, no per-tenant)
# y NO esta modelada en SQLModel. El acceso real se hace via `text(...)`
# desde otros modulos. Pero `metadata.create_all()` necesita resolver el
# target en compile-time para ordenar el DDL topologicamente. Sin esto:
#   NoReferencedTableError: Foreign key associated with column
#   'comparativos.proveedor_id' could not find table 'proveedores'
#
# Declaramos solo la PK. `create_all(checkfirst=True)` (default) detecta
# que la tabla ya existe en PG y omite el CREATE. En entornos sin la
# tabla, el guard del bootstrap (`runner.init_db`) corta antes con un
# error claro.
# ---------------------------------------------------------------------------
_PROVEEDORES_SHELL = Table(
    "proveedores",
    SQLModel.metadata,
    Column("id", BigInteger, primary_key=True),
)


# ---------------------------------------------------------------------------
# Comparativo
# ---------------------------------------------------------------------------


class Comparativo(SQLModel, table=True):
    __tablename__ = "comparativos"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)

    # Snapshot de obra en texto para no depender de FK ni de cambios en ERP.
    numero_obra: Optional[str] = Field(default=None, max_length=64)
    nombre_obra: Optional[str] = Field(default=None, max_length=255)

    titulo: Optional[str] = Field(default=None, max_length=255)
    estado: str = Field(
        default=EstadoComparativo.BORRADOR.value,
        max_length=32,
        index=True,
    )
    tipo_contrato: Optional[str] = Field(default=None, max_length=32, index=True)

    # FK opcional a `proveedores` durante BORRADOR; se exige antes de enviar.
    proveedor_id: Optional[int] = Field(
        sa_column=Column(
            BigInteger,
            ForeignKey("proveedores.id"),
            nullable=True,
            index=True,
        ),
    )

    # Trazabilidad de usuarios
    usuario_creador_id: int = Field(foreign_key="user.id", index=True)
    usuario_actualizacion_id: Optional[int] = Field(
        default=None, foreign_key="user.id", index=True
    )

    # Contacto operativo del comparativo (no es snapshot del proveedor)
    nombre_contacto: Optional[str] = Field(default=None, max_length=255)
    telefono_contacto: Optional[str] = Field(default=None, max_length=64)
    email_contacto: Optional[str] = Field(default=None, max_length=255)

    # Plazos
    fecha_inicio: Optional[date] = Field(default=None)
    fecha_fin: Optional[date] = Field(default=None)
    duracion: Optional[str] = Field(default=None, max_length=128)

    # Descripcion y condiciones
    descripcion_unidades_contratadas: Optional[str] = Field(
        default=None, sa_column=Column(Text)
    )
    condicion_ejecucion: Optional[str] = Field(default=None, sa_column=Column(Text))

    # Pagos
    forma_pago: Optional[str] = Field(default=None, max_length=64)
    terminos_pago: Optional[str] = Field(default=None, max_length=128)
    descripcion_forma_pago_otros: Optional[str] = Field(
        default=None, sa_column=Column(Text)
    )

    # Recursos y garantias
    numero_trabajadores_obra: Optional[int] = Field(default=None)
    retencion_garantias: Optional[Decimal] = Field(
        default=None, sa_column=Column(Numeric(5, 2))
    )
    descripcion_garantias: Optional[str] = Field(default=None, sa_column=Column(Text))

    # Flujo
    fecha_aprobacion: Optional[datetime] = Field(default=None)
    fecha_rechazo: Optional[datetime] = Field(default=None)
    motivo_rechazo: Optional[str] = Field(default=None, sa_column=Column(Text))

    # Contrato generado a partir de este comparativo (FK nullable a contratos.id)
    contrato_id: Optional[int] = Field(
        default=None, foreign_key="contratos.id", index=True
    )

    fecha_creacion: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc), index=True
    )
    fecha_actualizacion: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
    eliminado_en: Optional[datetime] = Field(default=None, index=True)

    __table_args__ = (
        Index("ix_comparativos_tenant_estado", "tenant_id", "estado"),
        Index("ix_comparativos_tenant_creacion", "tenant_id", "fecha_creacion"),
    )


class ComparativoHito(SQLModel, table=True):
    __tablename__ = "comparativo_hitos"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    comparativo_id: int = Field(foreign_key="comparativos.id", index=True)

    fecha_inicio: Optional[date] = Field(default=None)
    fecha_fin: Optional[date] = Field(default=None)
    nombre_hito: Optional[str] = Field(default=None, max_length=255)
    descripcion_hito: Optional[str] = Field(default=None, sa_column=Column(Text))
    orden: int = Field(default=0)

    fecha_creacion: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    fecha_actualizacion: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )

    __table_args__ = (
        Index("ix_comparativo_hitos_comparativo_orden", "comparativo_id", "orden"),
    )


class ComparativoAprobacion(SQLModel, table=True):
    __tablename__ = "comparativo_aprobaciones"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    comparativo_id: int = Field(foreign_key="comparativos.id", index=True)

    orden_aprobacion: int = Field(default=0, index=True)
    usuario_aprobador_id: Optional[int] = Field(
        default=None, foreign_key="user.id", index=True
    )
    rol_aprobador: Optional[str] = Field(default=None, max_length=64, index=True)
    estado: str = Field(
        default=EstadoAprobacionComparativo.PENDIENTE.value,
        max_length=32,
        index=True,
    )

    fecha_asignacion: Optional[datetime] = Field(default=None)
    fecha_resolucion: Optional[datetime] = Field(default=None)
    comentario: Optional[str] = Field(default=None, sa_column=Column(Text))
    es_aprobacion_actual: bool = Field(default=False, index=True)

    fecha_creacion: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    fecha_actualizacion: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )

    __table_args__ = (
        Index(
            "ix_comparativo_aprobaciones_comparativo_orden",
            "comparativo_id",
            "orden_aprobacion",
        ),
    )


class ComparativoHistorialFlujo(SQLModel, table=True):
    __tablename__ = "comparativo_historial_flujo"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    comparativo_id: int = Field(foreign_key="comparativos.id", index=True)

    estado_anterior: Optional[str] = Field(default=None, max_length=32)
    estado_nuevo: Optional[str] = Field(default=None, max_length=32)
    accion: str = Field(
        default=AccionHistorialComparativo.CREACION.value,
        max_length=32,
        index=True,
    )
    usuario_id: Optional[int] = Field(default=None, foreign_key="user.id", index=True)
    comentario: Optional[str] = Field(default=None, sa_column=Column(Text))
    fecha_evento: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc), index=True
    )
    metadatos_json: Optional[dict] = Field(default=None, sa_column=Column(JSONB))


# ---------------------------------------------------------------------------
# Ofertas del comparativo (adjudicada + descartada + partidas)
# ---------------------------------------------------------------------------


def _proveedor_id_column_nullable() -> Column:
    """FK opcional a proveedores.id (BIGINT). Para ofertas el proveedor
    puede no estar registrado todavia en la tabla maestra."""
    return Column(
        BigInteger,
        ForeignKey("proveedores.id"),
        nullable=True,
        index=True,
    )


class ComparativoOfertaAdjudicada(SQLModel, table=True):
    __tablename__ = "comparativo_oferta_adjudicada"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    comparativo_id: int = Field(foreign_key="comparativos.id", index=True, unique=True)
    proveedor_id: Optional[int] = Field(sa_column=_proveedor_id_column_nullable())

    numero_oferta: Optional[str] = Field(default=None, max_length=64)
    empresa: Optional[str] = Field(default=None, max_length=255)
    persona_contacto: Optional[str] = Field(default=None, max_length=255)
    telefono: Optional[str] = Field(default=None, max_length=64)
    email: Optional[str] = Field(default=None, max_length=255)

    total_ofertado: Optional[Decimal] = Field(
        default=None, sa_column=Column(Numeric(14, 2))
    )
    total_ofertas_homogeneas: Optional[Decimal] = Field(
        default=None, sa_column=Column(Numeric(14, 2))
    )
    porcentaje_oferta_homogenea: Optional[Decimal] = Field(
        default=None, sa_column=Column(Numeric(5, 2))
    )
    precio_neto: Optional[Decimal] = Field(
        default=None, sa_column=Column(Numeric(14, 2))
    )

    observaciones_oferta: Optional[str] = Field(default=None, sa_column=Column(Text))
    garantias: Optional[str] = Field(default=None, sa_column=Column(Text))
    retenciones: Optional[str] = Field(default=None, sa_column=Column(Text))
    plazos: Optional[str] = Field(default=None, sa_column=Column(Text))
    resumen_hitos: Optional[str] = Field(default=None, sa_column=Column(Text))
    proveedor_observaciones: Optional[str] = Field(default=None, sa_column=Column(Text))
    materiales_productos: Optional[str] = Field(default=None, sa_column=Column(Text))
    especificaciones_compra: Optional[str] = Field(default=None, sa_column=Column(Text))
    especificaciones_tecnicas: Optional[str] = Field(
        default=None, sa_column=Column(Text)
    )
    especificaciones_ejecucion: Optional[str] = Field(
        default=None, sa_column=Column(Text)
    )
    plazos_entrega_sistemas_periodos_suministro: Optional[str] = Field(
        default=None, sa_column=Column(Text)
    )
    documentacion_tecnica_proveedor: Optional[str] = Field(
        default=None, sa_column=Column(Text)
    )

    fecha_creacion: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    fecha_actualizacion: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )


class ComparativoOfertaAdjudicadaPartida(SQLModel, table=True):
    __tablename__ = "comparativo_oferta_adjudicada_partidas"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    comparativo_oferta_adjudicada_id: int = Field(
        foreign_key="comparativo_oferta_adjudicada.id", index=True
    )

    codigo_capitulo: Optional[str] = Field(default=None, max_length=64)
    medicion: Optional[Decimal] = Field(
        default=None, sa_column=Column(Numeric(14, 4))
    )
    unidad: Optional[str] = Field(default=None, max_length=32)
    descripcion: Optional[str] = Field(default=None, sa_column=Column(Text))
    precio: Optional[Decimal] = Field(
        default=None, sa_column=Column(Numeric(14, 4))
    )
    importe: Optional[Decimal] = Field(
        default=None, sa_column=Column(Numeric(14, 2))
    )
    orden: int = Field(default=0)


class ComparativoOfertaDescartada(SQLModel, table=True):
    __tablename__ = "comparativo_oferta_descartada"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    comparativo_id: int = Field(foreign_key="comparativos.id", index=True)
    proveedor_id: Optional[int] = Field(sa_column=_proveedor_id_column_nullable())

    numero_oferta: Optional[str] = Field(default=None, max_length=64)
    empresa: Optional[str] = Field(default=None, max_length=255)
    persona_contacto: Optional[str] = Field(default=None, max_length=255)
    telefono: Optional[str] = Field(default=None, max_length=64)
    email: Optional[str] = Field(default=None, max_length=255)

    total_ofertado: Optional[Decimal] = Field(
        default=None, sa_column=Column(Numeric(14, 2))
    )
    total_ofertas_homogeneas: Optional[Decimal] = Field(
        default=None, sa_column=Column(Numeric(14, 2))
    )
    porcentaje_oferta_homogenea: Optional[Decimal] = Field(
        default=None, sa_column=Column(Numeric(5, 2))
    )
    precio_neto: Optional[Decimal] = Field(
        default=None, sa_column=Column(Numeric(14, 2))
    )

    observaciones_oferta: Optional[str] = Field(default=None, sa_column=Column(Text))
    garantias: Optional[str] = Field(default=None, sa_column=Column(Text))
    retenciones: Optional[str] = Field(default=None, sa_column=Column(Text))
    plazos: Optional[str] = Field(default=None, sa_column=Column(Text))
    proveedor_observaciones: Optional[str] = Field(default=None, sa_column=Column(Text))
    materiales_productos: Optional[str] = Field(default=None, sa_column=Column(Text))
    especificaciones_compra: Optional[str] = Field(default=None, sa_column=Column(Text))
    especificaciones_tecnicas: Optional[str] = Field(
        default=None, sa_column=Column(Text)
    )
    especificaciones_ejecucion: Optional[str] = Field(
        default=None, sa_column=Column(Text)
    )
    plazos_entrega_sistemas_periodos_suministro: Optional[str] = Field(
        default=None, sa_column=Column(Text)
    )
    documentacion_tecnica_proveedor: Optional[str] = Field(
        default=None, sa_column=Column(Text)
    )
    motivo_descarte: Optional[str] = Field(default=None, sa_column=Column(Text))

    fecha_creacion: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    fecha_actualizacion: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )


class ComparativoOfertaDescartadaPartida(SQLModel, table=True):
    __tablename__ = "comparativo_oferta_descartada_partidas"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    comparativo_oferta_descartada_id: int = Field(
        foreign_key="comparativo_oferta_descartada.id", index=True
    )

    codigo_capitulo: Optional[str] = Field(default=None, max_length=64)
    medicion: Optional[Decimal] = Field(
        default=None, sa_column=Column(Numeric(14, 4))
    )
    unidad: Optional[str] = Field(default=None, max_length=32)
    descripcion: Optional[str] = Field(default=None, sa_column=Column(Text))
    precio: Optional[Decimal] = Field(
        default=None, sa_column=Column(Numeric(14, 4))
    )
    importe: Optional[Decimal] = Field(
        default=None, sa_column=Column(Numeric(14, 2))
    )
    orden: int = Field(default=0)


# ---------------------------------------------------------------------------
# Contrato generado desde comparativo aprobado
# ---------------------------------------------------------------------------


class Contrato(SQLModel, table=True):
    __tablename__ = "contratos"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)

    # FK al comparativo origen (nullable: por si algun dia se crean contratos
    # sin pasar por comparativo).
    comparativo_id: Optional[int] = Field(
        default=None, foreign_key="comparativos.id", index=True
    )

    numero_obra: Optional[str] = Field(default=None, max_length=64)
    nombre_obra: Optional[str] = Field(default=None, max_length=255)

    titulo: Optional[str] = Field(default=None, max_length=255)
    tipo_contrato: Optional[str] = Field(default=None, max_length=32, index=True)

    proveedor_id: int = Field(
        sa_column=Column(
            BigInteger,
            ForeignKey("proveedores.id"),
            nullable=False,
            index=True,
        ),
    )

    estado: str = Field(
        default=EstadoContrato.BORRADOR.value,
        max_length=32,
        index=True,
    )

    usuario_creador_id: int = Field(foreign_key="user.id", index=True)

    fecha_creacion: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc), index=True
    )
    fecha_actualizacion: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
    fecha_aprobacion: Optional[datetime] = Field(default=None)
    fecha_envio_firma: Optional[datetime] = Field(default=None)
    fecha_firma: Optional[datetime] = Field(default=None)
    fecha_rechazo: Optional[datetime] = Field(default=None)
    motivo_rechazo: Optional[str] = Field(default=None, sa_column=Column(Text))
    eliminado_en: Optional[datetime] = Field(default=None, index=True)

    __table_args__ = (
        Index("ix_contratos_tenant_estado", "tenant_id", "estado"),
        Index("ix_contratos_tenant_creacion", "tenant_id", "fecha_creacion"),
    )


class ContratoDatosProveedor(SQLModel, table=True):
    """Snapshot inmutable del proveedor en el momento de generar el contrato.

    Una fila por contrato. Datos copiados desde la tabla maestra
    ``proveedores`` para que el contrato no dependa en vivo de cambios
    posteriores en el catalogo de proveedores.
    """

    __tablename__ = "contrato_datos_proveedor"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    contrato_id: int = Field(foreign_key="contratos.id", index=True, unique=True)
    proveedor_id: int = Field(
        sa_column=Column(
            BigInteger,
            ForeignKey("proveedores.id"),
            nullable=False,
            index=True,
        ),
    )

    cif: Optional[str] = Field(default=None, max_length=64)
    razon_social: Optional[str] = Field(default=None, max_length=255)
    empresa: Optional[str] = Field(default=None, max_length=255)
    nombre_gerente: Optional[str] = Field(default=None, max_length=255)
    nif_gerente: Optional[str] = Field(default=None, max_length=64)
    direccion_empresa: Optional[str] = Field(default=None, sa_column=Column(Text))
    tipo_escritura: Optional[str] = Field(default=None, max_length=128)
    fecha_escritura: Optional[date] = Field(default=None)
    nombre_notario: Optional[str] = Field(default=None, max_length=255)
    numero_protocolo: Optional[str] = Field(default=None, max_length=64)
    telefono: Optional[str] = Field(default=None, max_length=64)
    email: Optional[str] = Field(default=None, max_length=255)

    fecha_creacion: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ContratoHito(SQLModel, table=True):
    __tablename__ = "contrato_hitos"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    contrato_id: int = Field(foreign_key="contratos.id", index=True)

    fecha_inicio: Optional[date] = Field(default=None)
    fecha_fin: Optional[date] = Field(default=None)
    nombre_hito: Optional[str] = Field(default=None, max_length=255)
    descripcion_hito: Optional[str] = Field(default=None, sa_column=Column(Text))
    orden: int = Field(default=0)

    fecha_creacion: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    fecha_actualizacion: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )

    __table_args__ = (
        Index("ix_contrato_hitos_contrato_orden", "contrato_id", "orden"),
    )


class ContratoHistorialFlujo(SQLModel, table=True):
    __tablename__ = "contrato_historial_flujo"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    contrato_id: int = Field(foreign_key="contratos.id", index=True)

    estado_anterior: Optional[str] = Field(default=None, max_length=32)
    estado_nuevo: Optional[str] = Field(default=None, max_length=32)
    accion: str = Field(
        default=AccionHistorialContrato.CREACION.value,
        max_length=32,
        index=True,
    )
    usuario_id: Optional[int] = Field(default=None, foreign_key="user.id", index=True)
    comentario: Optional[str] = Field(default=None, sa_column=Column(Text))
    fecha_evento: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc), index=True
    )
    metadatos_json: Optional[dict] = Field(default=None, sa_column=Column(JSONB))


__all__ = [
    "Comparativo",
    "ComparativoHito",
    "ComparativoAprobacion",
    "ComparativoHistorialFlujo",
    "ComparativoOfertaAdjudicada",
    "ComparativoOfertaAdjudicadaPartida",
    "ComparativoOfertaDescartada",
    "ComparativoOfertaDescartadaPartida",
    "Contrato",
    "ContratoDatosProveedor",
    "ContratoHito",
    "ContratoHistorialFlujo",
]
