from __future__ import annotations

from typing import Optional

from fastapi import status
from sqlmodel import Session

from app.core.errors import DomainError
from app.platform.contracts_core.comparativos_enums import EstadoContrato
from app.platform.contracts_core.comparativos_models import Contrato

from . import repo
from .schemas import (
    ComparativoOrigenResumenRead,
    ContratoDatosProveedorV2Read,
    ContratoHitoV2Read,
    ContratoOfertaAdjudicadaDetalleRead,
    ContratoOfertaAdjudicadaPartidaV2Read,
    ContratoOfertaAdjudicadaV2Read,
    ContratoV2DetalleRead,
    ContratoV2FlagsRead,
    ContratoV2Update,
)


class ContratosV2Service:
    def __init__(self, session: Session) -> None:
        self.session = session

    def _rollback(self) -> None:
        try:
            self.session.rollback()
        except Exception:
            pass

    def _commit(self) -> None:
        try:
            self.session.commit()
        except Exception as exc:
            self._rollback()
            raise DomainError(
                "No se pudo persistir el contrato v2.",
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            ) from exc

    def _obtener_contrato_o_error(self, *, tenant_id: int, contrato_id: int) -> Contrato:
        contrato = repo.obtener_contrato_por_id(
            self.session,
            tenant_id=tenant_id,
            contrato_id=contrato_id,
        )
        if contrato is None:
            raise DomainError(
                "Contrato v2 no encontrado.",
                status_code=status.HTTP_404_NOT_FOUND,
            )
        return contrato

    def _resolver_oferta_adjudicada(
        self,
        *,
        tenant_id: int,
        contrato: Contrato,
    ) -> tuple[
        Optional[ContratoOfertaAdjudicadaV2Read],
        list[ContratoOfertaAdjudicadaPartidaV2Read],
        str,
        Optional[str],
    ]:
        oferta_snapshot = repo.obtener_oferta_adjudicada_snapshot_por_contrato(
            self.session,
            tenant_id=tenant_id,
            contrato_id=contrato.id,
        )
        if oferta_snapshot is not None:
            partidas_snapshot = repo.obtener_partidas_adjudicadas_snapshot_por_contrato(
                self.session,
                tenant_id=tenant_id,
                contrato_id=contrato.id,
            )
            return (
                ContratoOfertaAdjudicadaV2Read.model_validate(oferta_snapshot),
                [
                    ContratoOfertaAdjudicadaPartidaV2Read.model_validate(item)
                    for item in partidas_snapshot
                ],
                "contract_snapshot",
                None,
            )

        if contrato.comparativo_id is None:
            return (
                None,
                [],
                "missing",
                "No existe snapshot de oferta adjudicada en tablas de contrato v2.",
            )

        oferta_origen = repo.obtener_oferta_adjudicada_origen_por_comparativo(
            self.session,
            tenant_id=tenant_id,
            comparativo_id=contrato.comparativo_id,
        )
        if oferta_origen is None:
            return (
                None,
                [],
                "missing",
                "No existe snapshot de oferta en contrato ni origen de comparativo.",
            )

        partidas_origen = repo.obtener_partidas_adjudicadas_origen_por_oferta(
            self.session,
            tenant_id=tenant_id,
            comparativo_oferta_adjudicada_id=oferta_origen.id,
        )
        oferta_fallback = ContratoOfertaAdjudicadaV2Read.model_validate(
            {
                "id": oferta_origen.id,
                "tenant_id": oferta_origen.tenant_id,
                "contrato_id": contrato.id,
                "comparativo_oferta_adjudicada_id": oferta_origen.id,
                "proveedor_id": oferta_origen.proveedor_id or contrato.proveedor_id,
                "proveedor_nombre_snapshot": oferta_origen.empresa,
                "numero_oferta": oferta_origen.numero_oferta,
                "total_ofertado": oferta_origen.total_ofertado,
                "total_ofertas_homogeneas": oferta_origen.total_ofertas_homogeneas,
                "precio_neto": oferta_origen.precio_neto,
                "forma_pago": None,
                "plazo": oferta_origen.plazos,
                "observaciones": oferta_origen.observaciones_oferta,
                "condiciones_json": {
                    "fallback_source": "comparativo_oferta_adjudicada",
                    "garantias": oferta_origen.garantias,
                    "retenciones": oferta_origen.retenciones,
                },
                "fecha_creacion": oferta_origen.fecha_creacion,
                "fecha_actualizacion": oferta_origen.fecha_actualizacion,
            }
        )
        partidas_fallback = [
            ContratoOfertaAdjudicadaPartidaV2Read.model_validate(
                {
                    "id": item.id,
                    "tenant_id": item.tenant_id,
                    "contrato_id": contrato.id,
                    "contrato_oferta_adjudicada_id": oferta_origen.id,
                    "comparativo_partida_adjudicada_id": item.id,
                    "codigo": item.codigo_capitulo,
                    "descripcion": item.descripcion,
                    "unidad": item.unidad,
                    "cantidad": item.medicion,
                    "precio_unitario": item.precio,
                    "importe": item.importe,
                    "orden": item.orden,
                    "metadata_json": {"fallback_source": "comparativo_oferta_adjudicada_partidas"},
                    "fecha_creacion": None,
                    "fecha_actualizacion": None,
                }
            )
            for item in partidas_origen
        ]
        return (
            oferta_fallback,
            partidas_fallback,
            "comparativo_fallback",
            "Fallback temporal: falta snapshot de oferta en tablas de contrato v2.",
        )

    def _armar_detalle(self, *, tenant_id: int, contrato: Contrato) -> ContratoV2DetalleRead:
        datos_proveedor = repo.obtener_datos_proveedor_por_contrato(
            self.session,
            tenant_id=tenant_id,
            contrato_id=contrato.id,
        )
        hitos = repo.obtener_hitos_por_contrato(
            self.session,
            tenant_id=tenant_id,
            contrato_id=contrato.id,
        )
        oferta, partidas, oferta_source, oferta_source_note = self._resolver_oferta_adjudicada(
            tenant_id=tenant_id,
            contrato=contrato,
        )
        comparativo_origen = None
        if contrato.comparativo_id is not None:
            comparativo = repo.obtener_comparativo_por_id(
                self.session,
                tenant_id=tenant_id,
                comparativo_id=contrato.comparativo_id,
            )
            if comparativo is not None:
                comparativo_origen = ComparativoOrigenResumenRead.model_validate(comparativo)

        return ContratoV2DetalleRead(
            id=contrato.id,
            tenant_id=contrato.tenant_id,
            comparativo_id=contrato.comparativo_id,
            numero_obra=contrato.numero_obra,
            nombre_obra=contrato.nombre_obra,
            titulo=contrato.titulo,
            tipo_contrato=contrato.tipo_contrato,
            proveedor_id=contrato.proveedor_id,
            estado=contrato.estado,
            usuario_creador_id=contrato.usuario_creador_id,
            fecha_creacion=contrato.fecha_creacion,
            fecha_actualizacion=contrato.fecha_actualizacion,
            fecha_aprobacion=contrato.fecha_aprobacion,
            fecha_envio_firma=contrato.fecha_envio_firma,
            fecha_firma=contrato.fecha_firma,
            fecha_rechazo=contrato.fecha_rechazo,
            motivo_rechazo=contrato.motivo_rechazo,
            datos_proveedor=(
                ContratoDatosProveedorV2Read.model_validate(datos_proveedor)
                if datos_proveedor is not None
                else None
            ),
            hitos=[ContratoHitoV2Read.model_validate(item) for item in hitos],
            oferta_adjudicada=oferta,
            oferta_adjudicada_partidas=partidas,
            comparativo_origen=comparativo_origen,
            oferta_source=oferta_source,
            oferta_source_note=oferta_source_note,
            flags=ContratoV2FlagsRead(
                tiene_datos_proveedor=datos_proveedor is not None,
                tiene_hitos=bool(hitos),
                tiene_oferta_adjudicada=oferta is not None,
                tiene_partidas_adjudicadas=bool(partidas),
            ),
        )

    def obtener_contrato(self, *, tenant_id: int, contrato_id: int) -> ContratoV2DetalleRead:
        contrato = self._obtener_contrato_o_error(tenant_id=tenant_id, contrato_id=contrato_id)
        return self._armar_detalle(tenant_id=tenant_id, contrato=contrato)

    def obtener_contrato_por_comparativo(
        self,
        *,
        tenant_id: int,
        comparativo_id: int,
    ) -> ContratoV2DetalleRead:
        contrato = repo.obtener_contrato_por_comparativo_id(
            self.session,
            tenant_id=tenant_id,
            comparativo_id=comparativo_id,
        )
        if contrato is None:
            comparativo = repo.obtener_comparativo_por_id(
                self.session,
                tenant_id=tenant_id,
                comparativo_id=comparativo_id,
            )
            if comparativo is not None and comparativo.contrato_id is not None:
                contrato = repo.obtener_contrato_por_id(
                    self.session,
                    tenant_id=tenant_id,
                    contrato_id=int(comparativo.contrato_id),
                )
        if contrato is None:
            raise DomainError(
                "No existe contrato v2 para el comparativo indicado.",
                status_code=status.HTTP_404_NOT_FOUND,
            )
        return self._armar_detalle(tenant_id=tenant_id, contrato=contrato)

    def obtener_datos_proveedor(
        self,
        *,
        tenant_id: int,
        contrato_id: int,
    ) -> Optional[ContratoDatosProveedorV2Read]:
        self._obtener_contrato_o_error(tenant_id=tenant_id, contrato_id=contrato_id)
        item = repo.obtener_datos_proveedor_por_contrato(
            self.session,
            tenant_id=tenant_id,
            contrato_id=contrato_id,
        )
        return ContratoDatosProveedorV2Read.model_validate(item) if item is not None else None

    def obtener_hitos(
        self,
        *,
        tenant_id: int,
        contrato_id: int,
    ) -> list[ContratoHitoV2Read]:
        self._obtener_contrato_o_error(tenant_id=tenant_id, contrato_id=contrato_id)
        rows = repo.obtener_hitos_por_contrato(
            self.session,
            tenant_id=tenant_id,
            contrato_id=contrato_id,
        )
        return [ContratoHitoV2Read.model_validate(item) for item in rows]

    def obtener_oferta_adjudicada(
        self,
        *,
        tenant_id: int,
        contrato_id: int,
    ) -> ContratoOfertaAdjudicadaDetalleRead:
        contrato = self._obtener_contrato_o_error(tenant_id=tenant_id, contrato_id=contrato_id)
        oferta, partidas, source, source_note = self._resolver_oferta_adjudicada(
            tenant_id=tenant_id,
            contrato=contrato,
        )
        return ContratoOfertaAdjudicadaDetalleRead(
            source=source,
            source_note=source_note,
            oferta_adjudicada=oferta,
            partidas_adjudicadas=partidas,
        )

    def actualizar_contrato(
        self,
        *,
        tenant_id: int,
        contrato_id: int,
        payload: ContratoV2Update,
    ) -> ContratoV2DetalleRead:
        contrato = self._obtener_contrato_o_error(tenant_id=tenant_id, contrato_id=contrato_id)
        updates = payload.model_dump(exclude_unset=True)
        if not updates:
            return self._armar_detalle(tenant_id=tenant_id, contrato=contrato)

        if contrato.estado != EstadoContrato.BORRADOR.value:
            raise DomainError(
                "Solo se permite edicion controlada cuando el contrato v2 esta en BORRADOR.",
                status_code=status.HTTP_409_CONFLICT,
            )

        try:
            repo.actualizar_contrato(
                self.session,
                contrato=contrato,
                updates=updates,
            )
            self._commit()
            self.session.refresh(contrato)
            return self._armar_detalle(tenant_id=tenant_id, contrato=contrato)
        except DomainError:
            self._rollback()
            raise
        except Exception as exc:
            self._rollback()
            raise DomainError(
                "No se pudo actualizar el contrato v2.",
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            ) from exc

