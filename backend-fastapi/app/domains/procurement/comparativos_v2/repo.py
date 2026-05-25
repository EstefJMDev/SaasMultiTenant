from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Iterable, Optional, Sequence

from sqlalchemy import delete, text
from sqlmodel import Session, select

from app.platform.contracts_core.comparativos_enums import EstadoAprobacionComparativo
from app.platform.contracts_core.comparativos_models import (
    Comparativo,
    ComparativoAprobacion,
    ComparativoHistorialFlujo,
    ComparativoHito,
    ComparativoOfertaAdjudicada,
    ComparativoOfertaAdjudicadaPartida,
    ComparativoOfertaDescartada,
    ComparativoOfertaDescartadaPartida,
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
    existentes = list(
        session.exec(
            select(ComparativoOfertaDescartada).where(
                ComparativoOfertaDescartada.tenant_id == tenant_id,
                ComparativoOfertaDescartada.comparativo_id == comparativo_id,
            )
        ).all()
    )

    if existentes:
        for oferta in existentes:
            borrar_hijos_por_filtro(
                session,
                model=ComparativoOfertaDescartadaPartida,
                tenant_id=tenant_id,
                filtro_columna="comparativo_oferta_descartada_id",
                filtro_valor=oferta.id,
            )
        session.exec(
            delete(ComparativoOfertaDescartada).where(
                ComparativoOfertaDescartada.tenant_id == tenant_id,
                ComparativoOfertaDescartada.comparativo_id == comparativo_id,
            )
        )

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
    stmt = (
        select(ComparativoOfertaDescartada)
        .where(
            ComparativoOfertaDescartada.tenant_id == tenant_id,
            ComparativoOfertaDescartada.comparativo_id == comparativo_id,
        )
        .order_by(ComparativoOfertaDescartada.id.desc())
    )
    return session.exec(stmt).first()


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
    if actuales:
        return actuales

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
