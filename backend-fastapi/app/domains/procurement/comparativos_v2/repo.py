from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Iterable, Optional, Sequence

from sqlalchemy import delete, text
from sqlmodel import Session, select

from app.platform.contracts_core.comparativos_enums import (
    AccionHistorialContrato,
    EstadoAprobacionComparativo,
    EstadoContrato,
)
from app.platform.contracts_core.comparativos_models import (
    Comparativo,
    ComparativoAprobacion,
    ComparativoHistorialFlujo,
    ComparativoHito,
    ComparativoOfertaAdjudicada,
    ComparativoOfertaAdjudicadaPartida,
    ComparativoOfertaDescartada,
    ComparativoOfertaDescartadaPartida,
    Contrato,
    ContratoDatosProveedor,
    ContratoHistorialFlujo,
    ContratoHito,
)
from app.platform.contracts_core.comparativos_schemas import (
    ComparativoCreate,
    ComparativoHitoCreate,
    ComparativoOfertaAdjudicadaCreate,
    ComparativoOfertaAdjudicadaPartidaCreate,
    ComparativoOfertaDescartadaCreate,
    ComparativoOfertaDescartadaPartidaCreate,
    ComparativoUpdate,
)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _apply_updates(model: Any, values: dict[str, Any]) -> None:
    for key, value in values.items():
        setattr(model, key, value)


def obtener_proveedor_por_id(
    session: Session,
    *,
    proveedor_id: int,
) -> Optional[dict[str, Any]]:
    stmt = text(
        """
        SELECT
            id,
            cif,
            razon_social,
            empresa,
            nombre_gerente,
            nif_gerente,
            direccion_empresa,
            tipo_escritura,
            fecha_escritura,
            nombre_notario,
            numero_protocolo
        FROM proveedores
        WHERE id = :proveedor_id
        LIMIT 1
        """
    )
    row = session.exec(stmt, params={"proveedor_id": proveedor_id}).first()
    if row is None:
        return None
    return dict(row._mapping)


def obtener_proveedores_por_ids(
    session: Session,
    *,
    proveedor_ids: Iterable[int],
) -> dict[int, dict[str, Any]]:
    ids = sorted({int(pid) for pid in proveedor_ids if pid is not None})
    if not ids:
        return {}

    stmt = text(
        """
        SELECT
            id,
            cif,
            razon_social,
            empresa,
            nombre_gerente,
            nif_gerente,
            direccion_empresa,
            tipo_escritura,
            fecha_escritura,
            nombre_notario,
            numero_protocolo
        FROM proveedores
        WHERE id = ANY(:proveedor_ids)
        """
    )
    rows = session.exec(stmt, params={"proveedor_ids": ids}).all()
    return {int(row.id): dict(row._mapping) for row in rows}


def crear_comparativo(
    session: Session,
    *,
    payload: ComparativoCreate,
) -> Comparativo:
    comparativo = Comparativo(**payload.model_dump())
    session.add(comparativo)
    session.flush()
    return comparativo


def obtener_comparativo_por_id(
    session: Session,
    *,
    tenant_id: int,
    comparativo_id: int,
    incluir_eliminados: bool = False,
) -> Optional[Comparativo]:
    stmt = select(Comparativo).where(
        Comparativo.tenant_id == tenant_id,
        Comparativo.id == comparativo_id,
    )
    if not incluir_eliminados:
        stmt = stmt.where(Comparativo.eliminado_en.is_(None))
    return session.exec(stmt).one_or_none()


def listar_comparativos_por_tenant(
    session: Session,
    *,
    tenant_id: int,
    limit: int = 100,
    offset: int = 0,
) -> list[Comparativo]:
    stmt = (
        select(Comparativo)
        .where(
            Comparativo.tenant_id == tenant_id,
            Comparativo.eliminado_en.is_(None),
        )
        .order_by(Comparativo.fecha_creacion.desc(), Comparativo.id.desc())
        .offset(offset)
        .limit(limit)
    )
    return list(session.exec(stmt).all())


def actualizar_comparativo(
    session: Session,
    *,
    comparativo: Comparativo,
    payload: ComparativoUpdate,
) -> Comparativo:
    updates = payload.model_dump(exclude_unset=True)
    if updates:
        _apply_updates(comparativo, updates)
    comparativo.fecha_actualizacion = _utcnow()
    session.add(comparativo)
    session.flush()
    return comparativo


def borrar_hijos_por_filtro(
    session: Session,
    *,
    model: Any,
    tenant_id: int,
    filtro_columna: str,
    filtro_valor: int,
) -> int:
    filtro_attr = getattr(model, filtro_columna)
    result = session.exec(
        delete(model).where(
            model.tenant_id == tenant_id,
            filtro_attr == filtro_valor,
        )
    )
    return int(result.rowcount or 0)


def reemplazar_hitos(
    session: Session,
    *,
    tenant_id: int,
    comparativo_id: int,
    hitos: Sequence[ComparativoHitoCreate],
) -> list[ComparativoHito]:
    borrar_hijos_por_filtro(
        session,
        model=ComparativoHito,
        tenant_id=tenant_id,
        filtro_columna="comparativo_id",
        filtro_valor=comparativo_id,
    )
    nuevos: list[ComparativoHito] = []
    for idx, hito in enumerate(hitos):
        item = hito.model_copy(
            update={
                "tenant_id": tenant_id,
                "comparativo_id": comparativo_id,
                "orden": hito.orden if hito.orden is not None else idx,
            }
        )
        model = ComparativoHito(**item.model_dump())
        session.add(model)
        nuevos.append(model)
    session.flush()
    return nuevos


def obtener_hitos_por_comparativo(
    session: Session,
    *,
    tenant_id: int,
    comparativo_id: int,
) -> list[ComparativoHito]:
    stmt = (
        select(ComparativoHito)
        .where(
            ComparativoHito.tenant_id == tenant_id,
            ComparativoHito.comparativo_id == comparativo_id,
        )
        .order_by(ComparativoHito.orden.asc(), ComparativoHito.id.asc())
    )
    return list(session.exec(stmt).all())


def guardar_oferta_adjudicada(
    session: Session,
    *,
    tenant_id: int,
    comparativo_id: int,
    payload: ComparativoOfertaAdjudicadaCreate,
) -> ComparativoOfertaAdjudicada:
    existente = session.exec(
        select(ComparativoOfertaAdjudicada).where(
            ComparativoOfertaAdjudicada.tenant_id == tenant_id,
            ComparativoOfertaAdjudicada.comparativo_id == comparativo_id,
        )
    ).one_or_none()

    data = payload.model_copy(
        update={
            "tenant_id": tenant_id,
            "comparativo_id": comparativo_id,
        }
    )

    if existente is None:
        oferta = ComparativoOfertaAdjudicada(**data.model_dump())
        session.add(oferta)
        session.flush()
        return oferta

    updates = data.model_dump(exclude={"comparativo_id", "tenant_id"})
    _apply_updates(existente, updates)
    existente.fecha_actualizacion = _utcnow()
    session.add(existente)
    session.flush()
    return existente


def obtener_oferta_adjudicada_por_comparativo(
    session: Session,
    *,
    tenant_id: int,
    comparativo_id: int,
) -> Optional[ComparativoOfertaAdjudicada]:
    return session.exec(
        select(ComparativoOfertaAdjudicada).where(
            ComparativoOfertaAdjudicada.tenant_id == tenant_id,
            ComparativoOfertaAdjudicada.comparativo_id == comparativo_id,
        )
    ).one_or_none()


def reemplazar_partidas_oferta_adjudicada(
    session: Session,
    *,
    tenant_id: int,
    comparativo_oferta_adjudicada_id: int,
    partidas: Sequence[ComparativoOfertaAdjudicadaPartidaCreate],
) -> list[ComparativoOfertaAdjudicadaPartida]:
    borrar_hijos_por_filtro(
        session,
        model=ComparativoOfertaAdjudicadaPartida,
        tenant_id=tenant_id,
        filtro_columna="comparativo_oferta_adjudicada_id",
        filtro_valor=comparativo_oferta_adjudicada_id,
    )
    nuevas: list[ComparativoOfertaAdjudicadaPartida] = []
    for idx, partida in enumerate(partidas):
        item = partida.model_copy(
            update={
                "tenant_id": tenant_id,
                "comparativo_oferta_adjudicada_id": comparativo_oferta_adjudicada_id,
                "orden": partida.orden if partida.orden is not None else idx,
            }
        )
        model = ComparativoOfertaAdjudicadaPartida(**item.model_dump())
        session.add(model)
        nuevas.append(model)
    session.flush()
    return nuevas


def obtener_partidas_oferta_adjudicada(
    session: Session,
    *,
    tenant_id: int,
    comparativo_oferta_adjudicada_id: int,
) -> list[ComparativoOfertaAdjudicadaPartida]:
    stmt = (
        select(ComparativoOfertaAdjudicadaPartida)
        .where(
            ComparativoOfertaAdjudicadaPartida.tenant_id == tenant_id,
            ComparativoOfertaAdjudicadaPartida.comparativo_oferta_adjudicada_id
            == comparativo_oferta_adjudicada_id,
        )
        .order_by(
            ComparativoOfertaAdjudicadaPartida.orden.asc(),
            ComparativoOfertaAdjudicadaPartida.id.asc(),
        )
    )
    return list(session.exec(stmt).all())


def guardar_oferta_descartada(
    session: Session,
    *,
    tenant_id: int,
    comparativo_id: int,
    payload: ComparativoOfertaDescartadaCreate,
) -> ComparativoOfertaDescartada:
    data = payload.model_copy(
        update={
            "tenant_id": tenant_id,
            "comparativo_id": comparativo_id,
        }
    )
    oferta = ComparativoOfertaDescartada(**data.model_dump())
    session.add(oferta)
    session.flush()
    return oferta


def obtener_oferta_descartada_por_comparativo(
    session: Session,
    *,
    tenant_id: int,
    comparativo_id: int,
) -> Optional[ComparativoOfertaDescartada]:
    ofertas = obtener_ofertas_descartadas_por_comparativo(
        session,
        tenant_id=tenant_id,
        comparativo_id=comparativo_id,
    )
    return ofertas[0] if ofertas else None


def obtener_ofertas_descartadas_por_comparativo(
    session: Session,
    *,
    tenant_id: int,
    comparativo_id: int,
) -> list[ComparativoOfertaDescartada]:
    stmt = (
        select(ComparativoOfertaDescartada)
        .where(
            ComparativoOfertaDescartada.tenant_id == tenant_id,
            ComparativoOfertaDescartada.comparativo_id == comparativo_id,
        )
        .order_by(ComparativoOfertaDescartada.id.asc())
    )
    return list(session.exec(stmt).all())


def reemplazar_ofertas_descartadas(
    session: Session,
    *,
    tenant_id: int,
    comparativo_id: int,
) -> int:
    existentes = obtener_ofertas_descartadas_por_comparativo(
        session,
        tenant_id=tenant_id,
        comparativo_id=comparativo_id,
    )
    for oferta in existentes:
        borrar_hijos_por_filtro(
            session,
            model=ComparativoOfertaDescartadaPartida,
            tenant_id=tenant_id,
            filtro_columna="comparativo_oferta_descartada_id",
            filtro_valor=oferta.id,
        )
    result = session.exec(
        delete(ComparativoOfertaDescartada).where(
            ComparativoOfertaDescartada.tenant_id == tenant_id,
            ComparativoOfertaDescartada.comparativo_id == comparativo_id,
        )
    )
    return int(result.rowcount or 0)


def reemplazar_partidas_oferta_descartada(
    session: Session,
    *,
    tenant_id: int,
    comparativo_oferta_descartada_id: int,
    partidas: Sequence[ComparativoOfertaDescartadaPartidaCreate],
) -> list[ComparativoOfertaDescartadaPartida]:
    borrar_hijos_por_filtro(
        session,
        model=ComparativoOfertaDescartadaPartida,
        tenant_id=tenant_id,
        filtro_columna="comparativo_oferta_descartada_id",
        filtro_valor=comparativo_oferta_descartada_id,
    )
    nuevas: list[ComparativoOfertaDescartadaPartida] = []
    for idx, partida in enumerate(partidas):
        item = partida.model_copy(
            update={
                "tenant_id": tenant_id,
                "comparativo_oferta_descartada_id": comparativo_oferta_descartada_id,
                "orden": partida.orden if partida.orden is not None else idx,
            }
        )
        model = ComparativoOfertaDescartadaPartida(**item.model_dump())
        session.add(model)
        nuevas.append(model)
    session.flush()
    return nuevas


def obtener_partidas_oferta_descartada(
    session: Session,
    *,
    tenant_id: int,
    comparativo_oferta_descartada_id: int,
) -> list[ComparativoOfertaDescartadaPartida]:
    stmt = (
        select(ComparativoOfertaDescartadaPartida)
        .where(
            ComparativoOfertaDescartadaPartida.tenant_id == tenant_id,
            ComparativoOfertaDescartadaPartida.comparativo_oferta_descartada_id
            == comparativo_oferta_descartada_id,
        )
        .order_by(
            ComparativoOfertaDescartadaPartida.orden.asc(),
            ComparativoOfertaDescartadaPartida.id.asc(),
        )
    )
    return list(session.exec(stmt).all())


def obtener_aprobaciones_por_comparativo(
    session: Session,
    *,
    tenant_id: int,
    comparativo_id: int,
) -> list[ComparativoAprobacion]:
    stmt = (
        select(ComparativoAprobacion)
        .where(
            ComparativoAprobacion.tenant_id == tenant_id,
            ComparativoAprobacion.comparativo_id == comparativo_id,
        )
        .order_by(
            ComparativoAprobacion.orden_aprobacion.asc(),
            ComparativoAprobacion.id.asc(),
        )
    )
    return list(session.exec(stmt).all())


def crear_aprobaciones_iniciales_si_no_existen(
    session: Session,
    *,
    tenant_id: int,
    comparativo_id: int,
    aprobadores: Optional[Sequence[dict[str, Any]]] = None,
) -> list[ComparativoAprobacion]:
    actuales = obtener_aprobaciones_por_comparativo(
        session,
        tenant_id=tenant_id,
        comparativo_id=comparativo_id,
    )
    # Si se pasan aprobadores explícitos, reemplazar siempre para que un reenvío
    # tras devolución/rechazo no quede bloqueado con el placeholder anterior.
    if actuales and not aprobadores:
        return actuales
    if actuales and aprobadores:
        session.exec(
            delete(ComparativoAprobacion).where(
                ComparativoAprobacion.tenant_id == tenant_id,
                ComparativoAprobacion.comparativo_id == comparativo_id,
            )
        )
        session.flush()

    base_rows: list[dict[str, Any]] = []
    if aprobadores:
        for idx, aprob in enumerate(aprobadores):
            base_rows.append(
                {
                    "orden_aprobacion": aprob.get("orden_aprobacion")
                    if aprob.get("orden_aprobacion") is not None
                    else idx,
                    "usuario_aprobador_id": aprob.get("usuario_aprobador_id"),
                    "rol_aprobador": aprob.get("rol_aprobador"),
                }
            )

    if not base_rows:
        base_rows.append(
            {
                "orden_aprobacion": 0,
                "usuario_aprobador_id": None,
                "rol_aprobador": "PENDIENTE_DEFINIR",
            }
        )

    nuevos: list[ComparativoAprobacion] = []
    for idx, row in enumerate(base_rows):
        aprobacion = ComparativoAprobacion(
            tenant_id=tenant_id,
            comparativo_id=comparativo_id,
            orden_aprobacion=row["orden_aprobacion"] if row["orden_aprobacion"] is not None else idx,
            usuario_aprobador_id=row.get("usuario_aprobador_id"),
            rol_aprobador=row.get("rol_aprobador"),
            estado=EstadoAprobacionComparativo.PENDIENTE.value,
            fecha_asignacion=_utcnow(),
            es_aprobacion_actual=idx == 0,
        )
        session.add(aprobacion)
        nuevos.append(aprobacion)

    session.flush()
    return nuevos


def actualizar_aprobacion(
    session: Session,
    *,
    aprobacion: ComparativoAprobacion,
    estado: EstadoAprobacionComparativo,
    comentario: Optional[str],
    usuario_resolucion_id: Optional[int] = None,
) -> ComparativoAprobacion:
    aprobacion.estado = estado.value
    aprobacion.fecha_resolucion = _utcnow()
    aprobacion.comentario = comentario
    if usuario_resolucion_id is not None:
        aprobacion.usuario_aprobador_id = usuario_resolucion_id
    aprobacion.fecha_actualizacion = _utcnow()
    session.add(aprobacion)
    session.flush()
    return aprobacion


def obtener_historial_por_comparativo(
    session: Session,
    *,
    tenant_id: int,
    comparativo_id: int,
) -> list[ComparativoHistorialFlujo]:
    stmt = (
        select(ComparativoHistorialFlujo)
        .where(
            ComparativoHistorialFlujo.tenant_id == tenant_id,
            ComparativoHistorialFlujo.comparativo_id == comparativo_id,
        )
        .order_by(
            ComparativoHistorialFlujo.fecha_evento.asc(),
            ComparativoHistorialFlujo.id.asc(),
        )
    )
    return list(session.exec(stmt).all())


def registrar_evento_historial(
    session: Session,
    *,
    tenant_id: int,
    comparativo_id: int,
    estado_anterior: Optional[str],
    estado_nuevo: Optional[str],
    accion: str,
    usuario_id: Optional[int],
    comentario: Optional[str] = None,
    metadatos_json: Optional[dict[str, Any]] = None,
) -> ComparativoHistorialFlujo:
    item = ComparativoHistorialFlujo(
        tenant_id=tenant_id,
        comparativo_id=comparativo_id,
        estado_anterior=estado_anterior,
        estado_nuevo=estado_nuevo,
        accion=accion,
        usuario_id=usuario_id,
        comentario=comentario,
        fecha_evento=_utcnow(),
        metadatos_json=metadatos_json,
    )
    session.add(item)
    session.flush()
    return item


# ---------------------------------------------------------------------------
# Contratos (Camino I — generacion desde comparativo aprobado)
# ---------------------------------------------------------------------------


def obtener_contrato_por_id(
    session: Session,
    *,
    tenant_id: int,
    contrato_id: int,
) -> Optional[Contrato]:
    stmt = select(Contrato).where(
        Contrato.tenant_id == tenant_id,
        Contrato.id == contrato_id,
        Contrato.eliminado_en.is_(None),
    )
    return session.exec(stmt).one_or_none()


def crear_contrato_desde_comparativo(
    session: Session,
    *,
    comparativo: Comparativo,
    usuario_id: int,
) -> Contrato:
    """Crea Contrato copiando los snapshots relevantes del comparativo.

    No copia hitos ni datos de proveedor: para eso ver funciones separadas.
    """
    contrato = Contrato(
        tenant_id=comparativo.tenant_id,
        comparativo_id=comparativo.id,
        numero_obra=comparativo.numero_obra,
        nombre_obra=comparativo.nombre_obra,
        titulo=comparativo.titulo,
        tipo_contrato=comparativo.tipo_contrato,
        proveedor_id=comparativo.proveedor_id,
        estado=EstadoContrato.BORRADOR.value,
        usuario_creador_id=usuario_id,
    )
    session.add(contrato)
    session.flush()
    return contrato


def crear_datos_proveedor_snapshot(
    session: Session,
    *,
    tenant_id: int,
    contrato_id: int,
    proveedor_id: int,
    proveedor_data: dict[str, Any],
) -> ContratoDatosProveedor:
    """Snapshot inmutable de los datos del proveedor en `proveedores` al
    momento de generar el contrato. `proveedor_data` viene del helper
    `obtener_proveedor_por_id` que ya devuelve los campos de la tabla
    maestra (cif, razon_social, gerente, escritura, notario...).
    """
    snapshot = ContratoDatosProveedor(
        tenant_id=tenant_id,
        contrato_id=contrato_id,
        proveedor_id=proveedor_id,
        cif=proveedor_data.get("cif"),
        razon_social=proveedor_data.get("razon_social"),
        empresa=proveedor_data.get("empresa"),
        nombre_gerente=proveedor_data.get("nombre_gerente"),
        nif_gerente=proveedor_data.get("nif_gerente"),
        direccion_empresa=proveedor_data.get("direccion_empresa"),
        tipo_escritura=proveedor_data.get("tipo_escritura"),
        fecha_escritura=proveedor_data.get("fecha_escritura"),
        nombre_notario=proveedor_data.get("nombre_notario"),
        numero_protocolo=proveedor_data.get("numero_protocolo"),
    )
    session.add(snapshot)
    session.flush()
    return snapshot


def copiar_hitos_comparativo_a_contrato(
    session: Session,
    *,
    tenant_id: int,
    contrato_id: int,
    hitos_origen: Sequence[ComparativoHito],
) -> list[ContratoHito]:
    """Copia los hitos del comparativo a `contrato_hitos` preservando orden
    y datos. Cada hito es una fila nueva (snapshot, no referencia)."""
    nuevos: list[ContratoHito] = []
    for idx, h in enumerate(hitos_origen):
        item = ContratoHito(
            tenant_id=tenant_id,
            contrato_id=contrato_id,
            fecha_inicio=h.fecha_inicio,
            fecha_fin=h.fecha_fin,
            nombre_hito=h.nombre_hito,
            descripcion_hito=h.descripcion_hito,
            orden=h.orden if h.orden is not None else idx,
        )
        session.add(item)
        nuevos.append(item)
    session.flush()
    return nuevos


def registrar_evento_historial_contrato(
    session: Session,
    *,
    tenant_id: int,
    contrato_id: int,
    accion: str,
    usuario_id: Optional[int],
    estado_anterior: Optional[str] = None,
    estado_nuevo: Optional[str] = None,
    comentario: Optional[str] = None,
    metadatos_json: Optional[dict[str, Any]] = None,
) -> ContratoHistorialFlujo:
    item = ContratoHistorialFlujo(
        tenant_id=tenant_id,
        contrato_id=contrato_id,
        estado_anterior=estado_anterior,
        estado_nuevo=estado_nuevo,
        accion=accion,
        usuario_id=usuario_id,
        comentario=comentario,
        fecha_evento=_utcnow(),
        metadatos_json=metadatos_json,
    )
    session.add(item)
    session.flush()
    return item
