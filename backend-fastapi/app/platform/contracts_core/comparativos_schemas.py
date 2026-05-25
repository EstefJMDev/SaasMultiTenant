"""Schemas Pydantic del flujo nuevo de comparativos (Fase 2)."""

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict

from app.platform.contracts_core.comparativos_enums import (
    AccionHistorialComparativo,
    EstadoAprobacionComparativo,
    EstadoComparativo,
)


class _ReadSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class ComparativoCreate(BaseModel):
    tenant_id: int
    obra_id: Optional[int] = None
    numero_obra: Optional[str] = None
    nombre_obra: Optional[str] = None
    titulo: Optional[str] = None
    estado: EstadoComparativo = EstadoComparativo.BORRADOR
    tipo_contrato: Optional[str] = None
    proveedor_id: int
    usuario_creador_id: int
    usuario_actualizacion_id: Optional[int] = None
    nombre_contacto: Optional[str] = None
    telefono_contacto: Optional[str] = None
    email_contacto: Optional[str] = None
    fecha_inicio: Optional[date] = None
    fecha_fin: Optional[date] = None
    duracion: Optional[str] = None
    descripcion_unidades_contratadas: Optional[str] = None
    condicion_ejecucion: Optional[str] = None
    forma_pago: Optional[str] = None
    terminos_pago: Optional[str] = None
    descripcion_forma_pago_otros: Optional[str] = None
    numero_trabajadores_obra: Optional[int] = None
    retencion_garantias: Optional[Decimal] = None
    descripcion_garantias: Optional[str] = None


class ComparativoUpdate(BaseModel):
    obra_id: Optional[int] = None
    numero_obra: Optional[str] = None
    nombre_obra: Optional[str] = None
    titulo: Optional[str] = None
    estado: Optional[EstadoComparativo] = None
    tipo_contrato: Optional[str] = None
    proveedor_id: Optional[int] = None
    usuario_actualizacion_id: Optional[int] = None
    nombre_contacto: Optional[str] = None
    telefono_contacto: Optional[str] = None
    email_contacto: Optional[str] = None
    fecha_inicio: Optional[date] = None
    fecha_fin: Optional[date] = None
    duracion: Optional[str] = None
    descripcion_unidades_contratadas: Optional[str] = None
    condicion_ejecucion: Optional[str] = None
    forma_pago: Optional[str] = None
    terminos_pago: Optional[str] = None
    descripcion_forma_pago_otros: Optional[str] = None
    numero_trabajadores_obra: Optional[int] = None
    retencion_garantias: Optional[Decimal] = None
    descripcion_garantias: Optional[str] = None
    fecha_aprobacion: Optional[datetime] = None
    fecha_rechazo: Optional[datetime] = None
    motivo_rechazo: Optional[str] = None
    contrato_id: Optional[int] = None


class ComparativoRead(_ReadSchema):
    id: int
    tenant_id: int
    obra_id: Optional[int] = None
    numero_obra: Optional[str] = None
    nombre_obra: Optional[str] = None
    titulo: Optional[str] = None
    estado: EstadoComparativo
    tipo_contrato: Optional[str] = None
    proveedor_id: int
    cif: Optional[str] = None
    razon_social: Optional[str] = None
    usuario_creador_id: int
    usuario_actualizacion_id: Optional[int] = None
    nombre_contacto: Optional[str] = None
    telefono_contacto: Optional[str] = None
    email_contacto: Optional[str] = None
    fecha_inicio: Optional[date] = None
    fecha_fin: Optional[date] = None
    duracion: Optional[str] = None
    descripcion_unidades_contratadas: Optional[str] = None
    condicion_ejecucion: Optional[str] = None
    forma_pago: Optional[str] = None
    terminos_pago: Optional[str] = None
    descripcion_forma_pago_otros: Optional[str] = None
    numero_trabajadores_obra: Optional[int] = None
    retencion_garantias: Optional[Decimal] = None
    descripcion_garantias: Optional[str] = None
    fecha_aprobacion: Optional[datetime] = None
    fecha_rechazo: Optional[datetime] = None
    motivo_rechazo: Optional[str] = None
    contrato_id: Optional[int] = None
    fecha_creacion: datetime
    fecha_actualizacion: datetime
    eliminado_en: Optional[datetime] = None


class ComparativoResumenRead(_ReadSchema):
    id: int
    tenant_id: int
    obra_id: Optional[int] = None
    numero_obra: Optional[str] = None
    nombre_obra: Optional[str] = None
    titulo: Optional[str] = None
    estado: EstadoComparativo
    tipo_contrato: Optional[str] = None
    proveedor_id: int
    cif: Optional[str] = None
    razon_social: Optional[str] = None
    fecha_creacion: datetime
    fecha_actualizacion: datetime
    fecha_aprobacion: Optional[datetime] = None
    fecha_rechazo: Optional[datetime] = None
    contrato_id: Optional[int] = None


class ComparativoHitoCreate(BaseModel):
    tenant_id: int
    comparativo_id: int
    fecha_inicio: Optional[date] = None
    fecha_fin: Optional[date] = None
    nombre_hito: Optional[str] = None
    descripcion_hito: Optional[str] = None
    orden: int = 0


class ComparativoHitoUpdate(BaseModel):
    fecha_inicio: Optional[date] = None
    fecha_fin: Optional[date] = None
    nombre_hito: Optional[str] = None
    descripcion_hito: Optional[str] = None
    orden: Optional[int] = None


class ComparativoHitoRead(_ReadSchema):
    id: int
    tenant_id: int
    comparativo_id: int
    fecha_inicio: Optional[date] = None
    fecha_fin: Optional[date] = None
    nombre_hito: Optional[str] = None
    descripcion_hito: Optional[str] = None
    orden: int
    fecha_creacion: datetime
    fecha_actualizacion: datetime


class ComparativoOfertaAdjudicadaCreate(BaseModel):
    tenant_id: int
    comparativo_id: int
    proveedor_id: Optional[int] = None
    numero_oferta: Optional[str] = None
    empresa: Optional[str] = None
    persona_contacto: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None
    total_ofertado: Optional[Decimal] = None
    total_ofertas_homogeneas: Optional[Decimal] = None
    porcentaje_oferta_homogenea: Optional[Decimal] = None
    precio_neto: Optional[Decimal] = None
    observaciones_oferta: Optional[str] = None
    garantias: Optional[str] = None
    retenciones: Optional[str] = None
    plazos: Optional[str] = None
    resumen_hitos: Optional[str] = None
    proveedor_observaciones: Optional[str] = None
    materiales_productos: Optional[str] = None
    especificaciones_compra: Optional[str] = None
    especificaciones_tecnicas: Optional[str] = None
    especificaciones_ejecucion: Optional[str] = None
    plazos_entrega_sistemas_periodos_suministro: Optional[str] = None
    documentacion_tecnica_proveedor: Optional[str] = None


class ComparativoOfertaAdjudicadaUpdate(BaseModel):
    proveedor_id: Optional[int] = None
    numero_oferta: Optional[str] = None
    empresa: Optional[str] = None
    persona_contacto: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None
    total_ofertado: Optional[Decimal] = None
    total_ofertas_homogeneas: Optional[Decimal] = None
    porcentaje_oferta_homogenea: Optional[Decimal] = None
    precio_neto: Optional[Decimal] = None
    observaciones_oferta: Optional[str] = None
    garantias: Optional[str] = None
    retenciones: Optional[str] = None
    plazos: Optional[str] = None
    resumen_hitos: Optional[str] = None
    proveedor_observaciones: Optional[str] = None
    materiales_productos: Optional[str] = None
    especificaciones_compra: Optional[str] = None
    especificaciones_tecnicas: Optional[str] = None
    especificaciones_ejecucion: Optional[str] = None
    plazos_entrega_sistemas_periodos_suministro: Optional[str] = None
    documentacion_tecnica_proveedor: Optional[str] = None


class ComparativoOfertaAdjudicadaRead(_ReadSchema):
    id: int
    tenant_id: int
    comparativo_id: int
    proveedor_id: Optional[int] = None
    numero_oferta: Optional[str] = None
    empresa: Optional[str] = None
    persona_contacto: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None
    total_ofertado: Optional[Decimal] = None
    total_ofertas_homogeneas: Optional[Decimal] = None
    porcentaje_oferta_homogenea: Optional[Decimal] = None
    precio_neto: Optional[Decimal] = None
    observaciones_oferta: Optional[str] = None
    garantias: Optional[str] = None
    retenciones: Optional[str] = None
    plazos: Optional[str] = None
    resumen_hitos: Optional[str] = None
    proveedor_observaciones: Optional[str] = None
    materiales_productos: Optional[str] = None
    especificaciones_compra: Optional[str] = None
    especificaciones_tecnicas: Optional[str] = None
    especificaciones_ejecucion: Optional[str] = None
    plazos_entrega_sistemas_periodos_suministro: Optional[str] = None
    documentacion_tecnica_proveedor: Optional[str] = None
    fecha_creacion: datetime
    fecha_actualizacion: datetime


class ComparativoOfertaAdjudicadaPartidaCreate(BaseModel):
    tenant_id: int
    comparativo_oferta_adjudicada_id: int
    codigo_capitulo: Optional[str] = None
    medicion: Optional[Decimal] = None
    unidad: Optional[str] = None
    descripcion: Optional[str] = None
    precio: Optional[Decimal] = None
    importe: Optional[Decimal] = None
    orden: int = 0


class ComparativoOfertaAdjudicadaPartidaUpdate(BaseModel):
    codigo_capitulo: Optional[str] = None
    medicion: Optional[Decimal] = None
    unidad: Optional[str] = None
    descripcion: Optional[str] = None
    precio: Optional[Decimal] = None
    importe: Optional[Decimal] = None
    orden: Optional[int] = None


class ComparativoOfertaAdjudicadaPartidaRead(_ReadSchema):
    id: int
    tenant_id: int
    comparativo_oferta_adjudicada_id: int
    codigo_capitulo: Optional[str] = None
    medicion: Optional[Decimal] = None
    unidad: Optional[str] = None
    descripcion: Optional[str] = None
    precio: Optional[Decimal] = None
    importe: Optional[Decimal] = None
    orden: int


class ComparativoOfertaDescartadaCreate(BaseModel):
    tenant_id: int
    comparativo_id: int
    proveedor_id: Optional[int] = None
    numero_oferta: Optional[str] = None
    empresa: Optional[str] = None
    persona_contacto: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None
    total_ofertado: Optional[Decimal] = None
    total_ofertas_homogeneas: Optional[Decimal] = None
    porcentaje_oferta_homogenea: Optional[Decimal] = None
    precio_neto: Optional[Decimal] = None
    observaciones_oferta: Optional[str] = None
    garantias: Optional[str] = None
    retenciones: Optional[str] = None
    plazos: Optional[str] = None
    proveedor_observaciones: Optional[str] = None
    materiales_productos: Optional[str] = None
    especificaciones_compra: Optional[str] = None
    especificaciones_tecnicas: Optional[str] = None
    especificaciones_ejecucion: Optional[str] = None
    plazos_entrega_sistemas_periodos_suministro: Optional[str] = None
    documentacion_tecnica_proveedor: Optional[str] = None
    motivo_descarte: Optional[str] = None


class ComparativoOfertaDescartadaUpdate(BaseModel):
    proveedor_id: Optional[int] = None
    numero_oferta: Optional[str] = None
    empresa: Optional[str] = None
    persona_contacto: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None
    total_ofertado: Optional[Decimal] = None
    total_ofertas_homogeneas: Optional[Decimal] = None
    porcentaje_oferta_homogenea: Optional[Decimal] = None
    precio_neto: Optional[Decimal] = None
    observaciones_oferta: Optional[str] = None
    garantias: Optional[str] = None
    retenciones: Optional[str] = None
    plazos: Optional[str] = None
    proveedor_observaciones: Optional[str] = None
    materiales_productos: Optional[str] = None
    especificaciones_compra: Optional[str] = None
    especificaciones_tecnicas: Optional[str] = None
    especificaciones_ejecucion: Optional[str] = None
    plazos_entrega_sistemas_periodos_suministro: Optional[str] = None
    documentacion_tecnica_proveedor: Optional[str] = None
    motivo_descarte: Optional[str] = None


class ComparativoOfertaDescartadaRead(_ReadSchema):
    id: int
    tenant_id: int
    comparativo_id: int
    proveedor_id: Optional[int] = None
    numero_oferta: Optional[str] = None
    empresa: Optional[str] = None
    persona_contacto: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None
    total_ofertado: Optional[Decimal] = None
    total_ofertas_homogeneas: Optional[Decimal] = None
    porcentaje_oferta_homogenea: Optional[Decimal] = None
    precio_neto: Optional[Decimal] = None
    observaciones_oferta: Optional[str] = None
    garantias: Optional[str] = None
    retenciones: Optional[str] = None
    plazos: Optional[str] = None
    proveedor_observaciones: Optional[str] = None
    materiales_productos: Optional[str] = None
    especificaciones_compra: Optional[str] = None
    especificaciones_tecnicas: Optional[str] = None
    especificaciones_ejecucion: Optional[str] = None
    plazos_entrega_sistemas_periodos_suministro: Optional[str] = None
    documentacion_tecnica_proveedor: Optional[str] = None
    motivo_descarte: Optional[str] = None
    fecha_creacion: datetime
    fecha_actualizacion: datetime


class ComparativoOfertaDescartadaPartidaCreate(BaseModel):
    tenant_id: int
    comparativo_oferta_descartada_id: int
    codigo_capitulo: Optional[str] = None
    medicion: Optional[Decimal] = None
    unidad: Optional[str] = None
    descripcion: Optional[str] = None
    precio: Optional[Decimal] = None
    importe: Optional[Decimal] = None
    orden: int = 0


class ComparativoOfertaDescartadaPartidaUpdate(BaseModel):
    codigo_capitulo: Optional[str] = None
    medicion: Optional[Decimal] = None
    unidad: Optional[str] = None
    descripcion: Optional[str] = None
    precio: Optional[Decimal] = None
    importe: Optional[Decimal] = None
    orden: Optional[int] = None


class ComparativoOfertaDescartadaPartidaRead(_ReadSchema):
    id: int
    tenant_id: int
    comparativo_oferta_descartada_id: int
    codigo_capitulo: Optional[str] = None
    medicion: Optional[Decimal] = None
    unidad: Optional[str] = None
    descripcion: Optional[str] = None
    precio: Optional[Decimal] = None
    importe: Optional[Decimal] = None
    orden: int


class ComparativoAprobacionRead(_ReadSchema):
    id: int
    tenant_id: int
    comparativo_id: int
    orden_aprobacion: int
    usuario_aprobador_id: Optional[int] = None
    rol_aprobador: Optional[str] = None
    estado: EstadoAprobacionComparativo
    fecha_asignacion: Optional[datetime] = None
    fecha_resolucion: Optional[datetime] = None
    comentario: Optional[str] = None
    es_aprobacion_actual: bool
    fecha_creacion: datetime
    fecha_actualizacion: datetime


class ComparativoHistorialFlujoRead(_ReadSchema):
    id: int
    tenant_id: int
    comparativo_id: int
    estado_anterior: Optional[EstadoComparativo] = None
    estado_nuevo: Optional[EstadoComparativo] = None
    accion: AccionHistorialComparativo
    usuario_id: Optional[int] = None
    comentario: Optional[str] = None
    fecha_evento: datetime
    metadatos_json: Optional[dict[str, Any]] = None


__all__ = [
    "ComparativoCreate",
    "ComparativoUpdate",
    "ComparativoRead",
    "ComparativoResumenRead",
    "ComparativoHitoCreate",
    "ComparativoHitoUpdate",
    "ComparativoHitoRead",
    "ComparativoOfertaAdjudicadaCreate",
    "ComparativoOfertaAdjudicadaUpdate",
    "ComparativoOfertaAdjudicadaRead",
    "ComparativoOfertaAdjudicadaPartidaCreate",
    "ComparativoOfertaAdjudicadaPartidaUpdate",
    "ComparativoOfertaAdjudicadaPartidaRead",
    "ComparativoOfertaDescartadaCreate",
    "ComparativoOfertaDescartadaUpdate",
    "ComparativoOfertaDescartadaRead",
    "ComparativoOfertaDescartadaPartidaCreate",
    "ComparativoOfertaDescartadaPartidaUpdate",
    "ComparativoOfertaDescartadaPartidaRead",
    "ComparativoAprobacionRead",
    "ComparativoHistorialFlujoRead",
]
