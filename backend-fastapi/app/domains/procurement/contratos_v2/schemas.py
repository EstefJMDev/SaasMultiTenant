from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class _ReadSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class ComparativoOrigenResumenRead(_ReadSchema):
    id: int
    tenant_id: int
    estado: str
    numero_obra: Optional[str] = None
    nombre_obra: Optional[str] = None
    titulo: Optional[str] = None
    tipo_contrato: Optional[str] = None
    proveedor_id: Optional[int] = None
    contrato_id: Optional[int] = None
    fecha_aprobacion: Optional[datetime] = None


class ContratoDatosProveedorV2Read(_ReadSchema):
    id: int
    tenant_id: int
    contrato_id: int
    proveedor_id: int
    cif: Optional[str] = None
    razon_social: Optional[str] = None
    empresa: Optional[str] = None
    nombre_gerente: Optional[str] = None
    nif_gerente: Optional[str] = None
    direccion_empresa: Optional[str] = None
    tipo_escritura: Optional[str] = None
    fecha_escritura: Optional[date] = None
    nombre_notario: Optional[str] = None
    numero_protocolo: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None
    fecha_creacion: datetime


class ContratoHitoV2Read(_ReadSchema):
    id: int
    tenant_id: int
    contrato_id: int
    fecha_inicio: Optional[date] = None
    fecha_fin: Optional[date] = None
    nombre_hito: Optional[str] = None
    descripcion_hito: Optional[str] = None
    orden: int
    fecha_creacion: datetime
    fecha_actualizacion: datetime


class ContratoOfertaAdjudicadaV2Read(_ReadSchema):
    id: int
    tenant_id: int
    contrato_id: int
    comparativo_oferta_adjudicada_id: Optional[int] = None
    proveedor_id: Optional[int] = None
    proveedor_nombre_snapshot: Optional[str] = None
    numero_oferta: Optional[str] = None
    total_ofertado: Optional[Decimal] = None
    total_ofertas_homogeneas: Optional[Decimal] = None
    precio_neto: Optional[Decimal] = None
    forma_pago: Optional[str] = None
    plazo: Optional[str] = None
    observaciones: Optional[str] = None
    condiciones_json: Optional[dict] = None
    fecha_creacion: datetime
    fecha_actualizacion: datetime


class ContratoOfertaAdjudicadaPartidaV2Read(_ReadSchema):
    id: int
    tenant_id: int
    contrato_id: int
    contrato_oferta_adjudicada_id: int
    comparativo_partida_adjudicada_id: Optional[int] = None
    codigo: Optional[str] = None
    descripcion: Optional[str] = None
    unidad: Optional[str] = None
    cantidad: Optional[Decimal] = None
    precio_unitario: Optional[Decimal] = None
    importe: Optional[Decimal] = None
    orden: int
    metadata_json: Optional[dict] = None
    fecha_creacion: Optional[datetime] = None
    fecha_actualizacion: Optional[datetime] = None


class ContratoOfertaAdjudicadaDetalleRead(BaseModel):
    source: str
    source_note: Optional[str] = None
    oferta_adjudicada: Optional[ContratoOfertaAdjudicadaV2Read] = None
    partidas_adjudicadas: list[ContratoOfertaAdjudicadaPartidaV2Read] = Field(
        default_factory=list
    )


class ContratoV2FlagsRead(BaseModel):
    tiene_datos_proveedor: bool = False
    tiene_hitos: bool = False
    tiene_oferta_adjudicada: bool = False
    tiene_partidas_adjudicadas: bool = False


class ContratoV2DetalleRead(BaseModel):
    id: int
    tenant_id: int
    comparativo_id: Optional[int] = None
    numero_obra: Optional[str] = None
    nombre_obra: Optional[str] = None
    titulo: Optional[str] = None
    tipo_contrato: Optional[str] = None
    proveedor_id: int
    estado: str
    usuario_creador_id: int
    fecha_creacion: datetime
    fecha_actualizacion: datetime
    fecha_aprobacion: Optional[datetime] = None
    fecha_envio_firma: Optional[datetime] = None
    fecha_firma: Optional[datetime] = None
    fecha_rechazo: Optional[datetime] = None
    motivo_rechazo: Optional[str] = None
    datos_proveedor: Optional[ContratoDatosProveedorV2Read] = None
    hitos: list[ContratoHitoV2Read] = Field(default_factory=list)
    oferta_adjudicada: Optional[ContratoOfertaAdjudicadaV2Read] = None
    oferta_adjudicada_partidas: list[ContratoOfertaAdjudicadaPartidaV2Read] = Field(
        default_factory=list
    )
    comparativo_origen: Optional[ComparativoOrigenResumenRead] = None
    oferta_source: str = "contract_snapshot"
    oferta_source_note: Optional[str] = None
    flags: ContratoV2FlagsRead = Field(default_factory=ContratoV2FlagsRead)


class ContratoV2Update(BaseModel):
    numero_obra: Optional[str] = None
    nombre_obra: Optional[str] = None
    titulo: Optional[str] = None
    tipo_contrato: Optional[str] = None
