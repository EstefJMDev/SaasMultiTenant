from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from sqlmodel import Session, select

from app.platform.contracts_core.comparativos_models import (
    Comparativo,
    ComparativoOfertaAdjudicada,
    ComparativoOfertaAdjudicadaPartida,
    Contrato,
    ContratoDatosProveedor,
    ContratoHito,
    ContratoOfertaAdjudicada,
    ContratoOfertaAdjudicadaPartida,
)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


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


def obtener_contrato_por_comparativo_id(
    session: Session,
    *,
    tenant_id: int,
    comparativo_id: int,
) -> Optional[Contrato]:
    stmt = (
        select(Contrato)
        .where(
            Contrato.tenant_id == tenant_id,
            Contrato.comparativo_id == comparativo_id,
            Contrato.eliminado_en.is_(None),
        )
        .order_by(Contrato.id.asc())
    )
    return session.exec(stmt).first()


def obtener_comparativo_por_id(
    session: Session,
    *,
    tenant_id: int,
    comparativo_id: int,
) -> Optional[Comparativo]:
    stmt = select(Comparativo).where(
        Comparativo.tenant_id == tenant_id,
        Comparativo.id == comparativo_id,
        Comparativo.eliminado_en.is_(None),
    )
    return session.exec(stmt).one_or_none()


def obtener_datos_proveedor_por_contrato(
    session: Session,
    *,
    tenant_id: int,
    contrato_id: int,
) -> Optional[ContratoDatosProveedor]:
    stmt = select(ContratoDatosProveedor).where(
        ContratoDatosProveedor.tenant_id == tenant_id,
        ContratoDatosProveedor.contrato_id == contrato_id,
    )
    return session.exec(stmt).one_or_none()


def obtener_hitos_por_contrato(
    session: Session,
    *,
    tenant_id: int,
    contrato_id: int,
) -> list[ContratoHito]:
    stmt = (
        select(ContratoHito)
        .where(
            ContratoHito.tenant_id == tenant_id,
            ContratoHito.contrato_id == contrato_id,
        )
        .order_by(ContratoHito.orden.asc(), ContratoHito.id.asc())
    )
    return list(session.exec(stmt).all())


def obtener_oferta_adjudicada_snapshot_por_contrato(
    session: Session,
    *,
    tenant_id: int,
    contrato_id: int,
) -> Optional[ContratoOfertaAdjudicada]:
    stmt = select(ContratoOfertaAdjudicada).where(
        ContratoOfertaAdjudicada.tenant_id == tenant_id,
        ContratoOfertaAdjudicada.contrato_id == contrato_id,
    )
    return session.exec(stmt).one_or_none()


def obtener_partidas_adjudicadas_snapshot_por_contrato(
    session: Session,
    *,
    tenant_id: int,
    contrato_id: int,
) -> list[ContratoOfertaAdjudicadaPartida]:
    stmt = (
        select(ContratoOfertaAdjudicadaPartida)
        .where(
            ContratoOfertaAdjudicadaPartida.tenant_id == tenant_id,
            ContratoOfertaAdjudicadaPartida.contrato_id == contrato_id,
        )
        .order_by(
            ContratoOfertaAdjudicadaPartida.orden.asc(),
            ContratoOfertaAdjudicadaPartida.id.asc(),
        )
    )
    return list(session.exec(stmt).all())


def obtener_oferta_adjudicada_origen_por_comparativo(
    session: Session,
    *,
    tenant_id: int,
    comparativo_id: int,
) -> Optional[ComparativoOfertaAdjudicada]:
    stmt = select(ComparativoOfertaAdjudicada).where(
        ComparativoOfertaAdjudicada.tenant_id == tenant_id,
        ComparativoOfertaAdjudicada.comparativo_id == comparativo_id,
    )
    return session.exec(stmt).one_or_none()


def obtener_partidas_adjudicadas_origen_por_oferta(
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


def actualizar_contrato(
    session: Session,
    *,
    contrato: Contrato,
    updates: dict[str, Any],
) -> Contrato:
    for key, value in updates.items():
        setattr(contrato, key, value)
    contrato.fecha_actualizacion = _utcnow()
    session.add(contrato)
    session.flush()
    return contrato

