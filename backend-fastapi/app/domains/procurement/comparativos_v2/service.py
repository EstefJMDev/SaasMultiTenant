from __future__ import annotations

from datetime import datetime, timezone
import logging
import unicodedata
from typing import Any, Optional, Sequence

from fastapi import status
from pydantic import BaseModel, ConfigDict, Field
from sqlmodel import Session

from app.core.errors import DomainError
from app.platform.contracts_core.comparativos_enums import (
    AccionHistorialComparativo,
    EstadoAprobacionComparativo,
    EstadoComparativo,
)
from app.platform.contracts_core.comparativos_models import Comparativo, ComparativoAprobacion
from app.platform.contracts_core.comparativos_schemas import (
    ComparativoAprobacionRead,
    ComparativoCreate,
    ComparativoHistorialFlujoRead,
    ComparativoHitoCreate,
    ComparativoHitoRead,
    ComparativoOfertaAdjudicadaCreate,
    ComparativoOfertaAdjudicadaPartidaCreate,
    ComparativoOfertaAdjudicadaPartidaRead,
    ComparativoOfertaAdjudicadaRead,
    ComparativoOfertaDescartadaConPartidasRead,
    ComparativoOfertaDescartadaCreate,
    ComparativoOfertaDescartadaPartidaCreate,
    ComparativoOfertaDescartadaPartidaRead,
    ComparativoOfertaDescartadaRead,
    ComparativoRead,
    ComparativoResumenRead,
    ComparativoUpdate,
)

from . import repo


_ESTADOS_EDITABLES = {
    EstadoComparativo.BORRADOR.value,
    EstadoComparativo.NECESITA_CAMBIOS.value,
    EstadoComparativo.RECHAZADO.value,
}
_ESTADOS_ENVIABLES = {
    EstadoComparativo.BORRADOR.value,
    EstadoComparativo.NECESITA_CAMBIOS.value,
}
_ESTADOS_RETORNABLES = {
    EstadoComparativo.PENDIENTE_APROBACION.value,
    EstadoComparativo.RECHAZADO.value,
}
_TIPOS_CONTRATO_REQUIEREN_PARTIDAS = {
    "SUMINISTRO",
    "SUBCONTRATACION",
}


logger = logging.getLogger("app.procurement.comparativos_v2.service")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _estado_value(value: EstadoComparativo | str | None) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, EstadoComparativo):
        return value.value
    return value


class ComparativoDetalleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    comparativo: ComparativoRead
    hitos: list[ComparativoHitoRead] = Field(default_factory=list)
    oferta_adjudicada: Optional[ComparativoOfertaAdjudicadaRead] = None
    oferta_adjudicada_partidas: list[ComparativoOfertaAdjudicadaPartidaRead] = Field(
        default_factory=list
    )
    ofertas_descartadas: list[ComparativoOfertaDescartadaRead] = Field(
        default_factory=list
    )
    ofertas_descartadas_partidas: list[ComparativoOfertaDescartadaPartidaRead] = Field(
        default_factory=list
    )
    ofertas_descartadas_con_partidas: list[ComparativoOfertaDescartadaConPartidasRead] = Field(
        default_factory=list
    )
    aprobaciones: list[ComparativoAprobacionRead] = Field(default_factory=list)
    historial: list[ComparativoHistorialFlujoRead] = Field(default_factory=list)


class ComparativosV2Service:
    """Capa de negocio del flujo nuevo de comparativos (aislada de legacy)."""

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
                "No se pudo persistir el comparativo por un error interno.",
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            ) from exc

    def _activar_legacy_pending_template_desde_v2(
        self,
        *,
        comparativo: Comparativo,
        contrato_id: int,
        usuario_id: Optional[int],
    ) -> None:
        resultado = repo.activar_legacy_pending_template_desde_v2(
            self.session,
            tenant_id=comparativo.tenant_id,
            comparativo_id=int(comparativo.id),
            contrato_id=int(contrato_id),
            usuario_id=usuario_id,
        )
        logger.info(
            "comparativos_v2 op=activate_legacy_pending_template_from_v2 "
            "legacy_contract_id=%s comparativo_id=%s contrato_id=%s old_status=%s "
            "new_status=%s skipped_reason=%s",
            resultado.get("legacy_contract_id"),
            comparativo.id,
            contrato_id,
            resultado.get("old_status"),
            resultado.get("new_status"),
            resultado.get("skipped_reason"),
        )

    def _validar_proveedor_existe(self, proveedor_id: int) -> dict[str, Any]:
        proveedor = repo.obtener_proveedor_por_id(
            self.session,
            proveedor_id=proveedor_id,
        )
        if proveedor is None:
            raise DomainError(
                "Proveedor no encontrado en tabla proveedores.",
                status_code=status.HTTP_404_NOT_FOUND,
            )
        return proveedor

    def _obtener_comparativo_o_error(
        self,
        *,
        tenant_id: int,
        comparativo_id: int,
    ) -> Comparativo:
        comparativo = repo.obtener_comparativo_por_id(
            self.session,
            tenant_id=tenant_id,
            comparativo_id=comparativo_id,
        )
        if comparativo is None:
            raise DomainError(
                "Comparativo no encontrado.",
                status_code=status.HTTP_404_NOT_FOUND,
            )
        return comparativo

    def _validar_hitos(self, hitos: Sequence[ComparativoHitoCreate]) -> None:
        for idx, hito in enumerate(hitos):
            if hito.orden is not None and hito.orden < 0:
                raise DomainError(f"Hito {idx}: orden no puede ser negativo.")
            if (
                hito.fecha_inicio is not None
                and hito.fecha_fin is not None
                and hito.fecha_inicio > hito.fecha_fin
            ):
                raise DomainError(f"Hito {idx}: fecha_inicio no puede ser mayor que fecha_fin.")

    def _validar_partidas(
        self,
        partidas: Sequence[ComparativoOfertaAdjudicadaPartidaCreate]
        | Sequence[ComparativoOfertaDescartadaPartidaCreate],
    ) -> None:
        for idx, partida in enumerate(partidas):
            if partida.orden is not None and partida.orden < 0:
                raise DomainError(f"Partida {idx}: orden no puede ser negativo.")
            if partida.medicion is not None and partida.medicion < 0:
                raise DomainError(f"Partida {idx}: medicion no puede ser negativa.")
            if partida.precio is not None and partida.precio < 0:
                raise DomainError(f"Partida {idx}: precio no puede ser negativo.")
            if partida.importe is not None and partida.importe < 0:
                raise DomainError(f"Partida {idx}: importe no puede ser negativo.")

    def _validar_datos_basicos_envio(self, comparativo: Comparativo) -> None:
        if not comparativo.titulo:
            raise DomainError("No se puede enviar a aprobacion sin titulo.")
        if not comparativo.numero_obra or not comparativo.nombre_obra:
            raise DomainError(
                "No se puede enviar a aprobacion sin snapshot de obra (numero_obra, nombre_obra)."
            )
        if not comparativo.tipo_contrato:
            raise DomainError("No se puede enviar a aprobacion sin tipo_contrato.")
        if comparativo.proveedor_id is None:
            raise DomainError("No se puede enviar a aprobacion sin proveedor_id.")
        self._validar_proveedor_existe(comparativo.proveedor_id)

    def _comparativo_read_con_proveedor(
        self,
        comparativo: Comparativo,
    ) -> ComparativoRead:
        proveedor = (
            repo.obtener_proveedor_por_id(
                self.session,
                proveedor_id=comparativo.proveedor_id,
            )
            if comparativo.proveedor_id is not None
            else None
        )
        base = ComparativoRead.model_validate(comparativo)
        return base.model_copy(
            update={
                "cif": proveedor.get("cif") if proveedor else None,
                "razon_social": proveedor.get("razon_social") if proveedor else None,
            }
        )

    def _armar_detalle(self, comparativo: Comparativo) -> ComparativoDetalleRead:
        hitos = [
            ComparativoHitoRead.model_validate(item)
            for item in repo.obtener_hitos_por_comparativo(
                self.session,
                tenant_id=comparativo.tenant_id,
                comparativo_id=comparativo.id,
            )
        ]

        oferta_adjudicada_model = repo.obtener_oferta_adjudicada_por_comparativo(
            self.session,
            tenant_id=comparativo.tenant_id,
            comparativo_id=comparativo.id,
        )
        oferta_adjudicada = (
            ComparativoOfertaAdjudicadaRead.model_validate(oferta_adjudicada_model)
            if oferta_adjudicada_model
            else None
        )
        oferta_adjudicada_partidas = (
            [
                ComparativoOfertaAdjudicadaPartidaRead.model_validate(item)
                for item in repo.obtener_partidas_oferta_adjudicada(
                    self.session,
                    tenant_id=comparativo.tenant_id,
                    comparativo_oferta_adjudicada_id=oferta_adjudicada_model.id,
                )
            ]
            if oferta_adjudicada_model
            else []
        )

        oferta_descartada_models = repo.obtener_ofertas_descartadas_por_comparativo(
            self.session,
            tenant_id=comparativo.tenant_id,
            comparativo_id=comparativo.id,
        )
        ofertas_descartadas: list[ComparativoOfertaDescartadaRead] = []
        ofertas_descartadas_partidas: list[ComparativoOfertaDescartadaPartidaRead] = []
        ofertas_descartadas_con_partidas: list[ComparativoOfertaDescartadaConPartidasRead] = []
        for oferta_descartada_model in oferta_descartada_models:
            oferta_read = ComparativoOfertaDescartadaRead.model_validate(oferta_descartada_model)
            partidas_read = [
                ComparativoOfertaDescartadaPartidaRead.model_validate(item)
                for item in repo.obtener_partidas_oferta_descartada(
                    self.session,
                    tenant_id=comparativo.tenant_id,
                    comparativo_oferta_descartada_id=oferta_descartada_model.id,
                )
            ]
            ofertas_descartadas.append(oferta_read)
            ofertas_descartadas_partidas.extend(partidas_read)
            ofertas_descartadas_con_partidas.append(
                ComparativoOfertaDescartadaConPartidasRead(
                    oferta=oferta_read,
                    partidas=partidas_read,
                )
            )

        aprobaciones = [
            ComparativoAprobacionRead.model_validate(item)
            for item in repo.obtener_aprobaciones_por_comparativo(
                self.session,
                tenant_id=comparativo.tenant_id,
                comparativo_id=comparativo.id,
            )
        ]
        historial = [
            ComparativoHistorialFlujoRead.model_validate(item)
            for item in repo.obtener_historial_por_comparativo(
                self.session,
                tenant_id=comparativo.tenant_id,
                comparativo_id=comparativo.id,
            )
        ]

        return ComparativoDetalleRead(
            comparativo=self._comparativo_read_con_proveedor(comparativo),
            hitos=hitos,
            oferta_adjudicada=oferta_adjudicada,
            oferta_adjudicada_partidas=oferta_adjudicada_partidas,
            ofertas_descartadas=ofertas_descartadas,
            ofertas_descartadas_partidas=ofertas_descartadas_partidas,
            ofertas_descartadas_con_partidas=ofertas_descartadas_con_partidas,
            aprobaciones=aprobaciones,
            historial=historial,
        )

    def _normalizar_hitos(
        self,
        *,
        tenant_id: int,
        comparativo_id: int,
        hitos: Sequence[ComparativoHitoCreate],
    ) -> list[ComparativoHitoCreate]:
        return [
            hito.model_copy(
                update={
                    "tenant_id": tenant_id,
                    "comparativo_id": comparativo_id,
                }
            )
            for hito in hitos
        ]

    def _normalizar_oferta_adjudicada(
        self,
        *,
        tenant_id: int,
        comparativo_id: int,
        payload: ComparativoOfertaAdjudicadaCreate,
    ) -> ComparativoOfertaAdjudicadaCreate:
        return payload.model_copy(
            update={
                "tenant_id": tenant_id,
                "comparativo_id": comparativo_id,
            }
        )

    def _normalizar_partidas_oferta_adjudicada(
        self,
        *,
        tenant_id: int,
        comparativo_oferta_adjudicada_id: int,
        partidas: Sequence[ComparativoOfertaAdjudicadaPartidaCreate],
    ) -> list[ComparativoOfertaAdjudicadaPartidaCreate]:
        return [
            partida.model_copy(
                update={
                    "tenant_id": tenant_id,
                    "comparativo_oferta_adjudicada_id": comparativo_oferta_adjudicada_id,
                }
            )
            for partida in partidas
        ]

    def _normalizar_oferta_descartada(
        self,
        *,
        tenant_id: int,
        comparativo_id: int,
        payload: ComparativoOfertaDescartadaCreate,
    ) -> ComparativoOfertaDescartadaCreate:
        return payload.model_copy(
            update={
                "tenant_id": tenant_id,
                "comparativo_id": comparativo_id,
            }
        )

    def _normalizar_partidas_oferta_descartada(
        self,
        *,
        tenant_id: int,
        comparativo_oferta_descartada_id: int,
        partidas: Sequence[ComparativoOfertaDescartadaPartidaCreate],
    ) -> list[ComparativoOfertaDescartadaPartidaCreate]:
        return [
            partida.model_copy(
                update={
                    "tenant_id": tenant_id,
                    "comparativo_oferta_descartada_id": comparativo_oferta_descartada_id,
                }
            )
            for partida in partidas
        ]

    def crear_comparativo(
        self,
        *,
        tenant_id: int,
        payload: ComparativoCreate,
        hitos: Optional[Sequence[ComparativoHitoCreate]] = None,
        oferta_adjudicada: Optional[ComparativoOfertaAdjudicadaCreate] = None,
        oferta_adjudicada_partidas: Optional[
            Sequence[ComparativoOfertaAdjudicadaPartidaCreate]
        ] = None,
        oferta_descartada: Optional[ComparativoOfertaDescartadaCreate] = None,
        oferta_descartada_partidas: Optional[
            Sequence[ComparativoOfertaDescartadaPartidaCreate]
        ] = None,
        usuario_id: Optional[int] = None,
        aprobadores_iniciales: Optional[Sequence[dict[str, Any]]] = None,
        comentario_historial: Optional[str] = None,
    ) -> ComparativoDetalleRead:
        if payload.tenant_id != tenant_id:
            raise DomainError("tenant_id del payload no coincide con el tenant de la operacion.")
        if payload.proveedor_id is not None:
            self._validar_proveedor_existe(payload.proveedor_id)

        hitos = list(hitos or [])
        oferta_adjudicada_partidas_provided = oferta_adjudicada_partidas is not None
        oferta_adjudicada_partidas = list(oferta_adjudicada_partidas or [])
        oferta_descartada_partidas_provided = oferta_descartada_partidas is not None
        oferta_descartada_partidas = list(oferta_descartada_partidas or [])

        self._validar_hitos(hitos)
        self._validar_partidas(oferta_adjudicada_partidas)
        self._validar_partidas(oferta_descartada_partidas)

        if oferta_adjudicada is None and oferta_adjudicada_partidas:
            raise DomainError("No se pueden guardar partidas adjudicadas sin oferta adjudicada.")
        if oferta_descartada is None and oferta_descartada_partidas:
            raise DomainError("No se pueden guardar partidas descartadas sin oferta descartada.")
        if oferta_adjudicada and oferta_adjudicada.proveedor_id is not None:
            self._validar_proveedor_existe(oferta_adjudicada.proveedor_id)
        if oferta_descartada and oferta_descartada.proveedor_id is not None:
            self._validar_proveedor_existe(oferta_descartada.proveedor_id)

        try:
            comparativo = repo.crear_comparativo(self.session, payload=payload)

            if hitos:
                repo.reemplazar_hitos(
                    self.session,
                    tenant_id=tenant_id,
                    comparativo_id=comparativo.id,
                    hitos=self._normalizar_hitos(
                        tenant_id=tenant_id,
                        comparativo_id=comparativo.id,
                        hitos=hitos,
                    ),
                )

            if oferta_adjudicada:
                oferta_model = repo.guardar_oferta_adjudicada(
                    self.session,
                    tenant_id=tenant_id,
                    comparativo_id=comparativo.id,
                    payload=self._normalizar_oferta_adjudicada(
                        tenant_id=tenant_id,
                        comparativo_id=comparativo.id,
                        payload=oferta_adjudicada,
                    ),
                )
                if oferta_adjudicada_partidas_provided:
                    repo.reemplazar_partidas_oferta_adjudicada(
                        self.session,
                        tenant_id=tenant_id,
                        comparativo_oferta_adjudicada_id=oferta_model.id,
                        partidas=self._normalizar_partidas_oferta_adjudicada(
                            tenant_id=tenant_id,
                            comparativo_oferta_adjudicada_id=oferta_model.id,
                            partidas=oferta_adjudicada_partidas,
                        ),
                    )

            if oferta_descartada:
                oferta_desc_model = repo.guardar_oferta_descartada(
                    self.session,
                    tenant_id=tenant_id,
                    comparativo_id=comparativo.id,
                    payload=self._normalizar_oferta_descartada(
                        tenant_id=tenant_id,
                        comparativo_id=comparativo.id,
                        payload=oferta_descartada,
                    ),
                )
                if oferta_descartada_partidas_provided:
                    repo.reemplazar_partidas_oferta_descartada(
                        self.session,
                        tenant_id=tenant_id,
                        comparativo_oferta_descartada_id=oferta_desc_model.id,
                        partidas=self._normalizar_partidas_oferta_descartada(
                            tenant_id=tenant_id,
                            comparativo_oferta_descartada_id=oferta_desc_model.id,
                            partidas=oferta_descartada_partidas,
                        ),
                    )

            if aprobadores_iniciales is not None:
                repo.crear_aprobaciones_iniciales_si_no_existen(
                    self.session,
                    tenant_id=tenant_id,
                    comparativo_id=comparativo.id,
                    aprobadores=aprobadores_iniciales,
                )

            repo.registrar_evento_historial(
                self.session,
                tenant_id=tenant_id,
                comparativo_id=comparativo.id,
                estado_anterior=None,
                estado_nuevo=comparativo.estado,
                accion=AccionHistorialComparativo.CREACION.value,
                usuario_id=usuario_id or payload.usuario_creador_id,
                comentario=comentario_historial,
            )
            self._commit()
            self.session.refresh(comparativo)
            return self._armar_detalle(comparativo)
        except DomainError:
            self._rollback()
            raise
        except Exception as exc:
            self._rollback()
            raise DomainError(
                "No se pudo crear el comparativo.",
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            ) from exc

    def editar_comparativo(
        self,
        *,
        tenant_id: int,
        comparativo_id: int,
        payload: ComparativoUpdate,
        hitos: Optional[Sequence[ComparativoHitoCreate]] = None,
        oferta_adjudicada: Optional[ComparativoOfertaAdjudicadaCreate] = None,
        oferta_adjudicada_partidas: Optional[
            Sequence[ComparativoOfertaAdjudicadaPartidaCreate]
        ] = None,
        oferta_descartada: Optional[ComparativoOfertaDescartadaCreate] = None,
        oferta_descartada_partidas: Optional[
            Sequence[ComparativoOfertaDescartadaPartidaCreate]
        ] = None,
        usuario_id: Optional[int] = None,
        comentario_historial: Optional[str] = None,
    ) -> ComparativoDetalleRead:
        comparativo = self._obtener_comparativo_o_error(
            tenant_id=tenant_id,
            comparativo_id=comparativo_id,
        )
        if comparativo.estado not in _ESTADOS_EDITABLES:
            raise DomainError(
                f"El comparativo no se puede editar en estado {comparativo.estado}.",
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        updates = payload.model_dump(exclude_unset=True)
        nuevo_estado = updates.get("estado")
        if nuevo_estado is not None and _estado_value(nuevo_estado) not in _ESTADOS_EDITABLES:
            raise DomainError(
                "Cambio de estado no permitido desde editar_comparativo.",
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        if updates.get("proveedor_id") is not None:
            self._validar_proveedor_existe(int(updates["proveedor_id"]))

        hitos_provided = hitos is not None
        hitos = list(hitos or [])
        oferta_adjudicada_partidas_provided = oferta_adjudicada_partidas is not None
        oferta_adjudicada_partidas = list(oferta_adjudicada_partidas or [])
        oferta_descartada_partidas_provided = oferta_descartada_partidas is not None
        oferta_descartada_partidas = list(oferta_descartada_partidas or [])

        self._validar_hitos(hitos)
        self._validar_partidas(oferta_adjudicada_partidas)
        self._validar_partidas(oferta_descartada_partidas)

        if oferta_adjudicada is None and oferta_adjudicada_partidas:
            raise DomainError("No se pueden guardar partidas adjudicadas sin oferta adjudicada.")
        if oferta_descartada is None and oferta_descartada_partidas:
            raise DomainError("No se pueden guardar partidas descartadas sin oferta descartada.")
        if oferta_adjudicada and oferta_adjudicada.proveedor_id is not None:
            self._validar_proveedor_existe(oferta_adjudicada.proveedor_id)
        if oferta_descartada and oferta_descartada.proveedor_id is not None:
            self._validar_proveedor_existe(oferta_descartada.proveedor_id)

        estado_anterior = comparativo.estado

        try:
            comparativo = repo.actualizar_comparativo(
                self.session,
                comparativo=comparativo,
                payload=payload,
            )

            if hitos_provided:
                repo.reemplazar_hitos(
                    self.session,
                    tenant_id=tenant_id,
                    comparativo_id=comparativo.id,
                    hitos=self._normalizar_hitos(
                        tenant_id=tenant_id,
                        comparativo_id=comparativo.id,
                        hitos=hitos,
                    ),
                )

            if oferta_adjudicada is not None:
                oferta_model = repo.guardar_oferta_adjudicada(
                    self.session,
                    tenant_id=tenant_id,
                    comparativo_id=comparativo.id,
                    payload=self._normalizar_oferta_adjudicada(
                        tenant_id=tenant_id,
                        comparativo_id=comparativo.id,
                        payload=oferta_adjudicada,
                    ),
                )
                if oferta_adjudicada_partidas_provided:
                    repo.reemplazar_partidas_oferta_adjudicada(
                        self.session,
                        tenant_id=tenant_id,
                        comparativo_oferta_adjudicada_id=oferta_model.id,
                        partidas=self._normalizar_partidas_oferta_adjudicada(
                            tenant_id=tenant_id,
                            comparativo_oferta_adjudicada_id=oferta_model.id,
                            partidas=oferta_adjudicada_partidas,
                        ),
                    )

            if oferta_descartada is not None:
                oferta_desc_model = repo.guardar_oferta_descartada(
                    self.session,
                    tenant_id=tenant_id,
                    comparativo_id=comparativo.id,
                    payload=self._normalizar_oferta_descartada(
                        tenant_id=tenant_id,
                        comparativo_id=comparativo.id,
                        payload=oferta_descartada,
                    ),
                )
                if oferta_descartada_partidas_provided:
                    repo.reemplazar_partidas_oferta_descartada(
                        self.session,
                        tenant_id=tenant_id,
                        comparativo_oferta_descartada_id=oferta_desc_model.id,
                        partidas=self._normalizar_partidas_oferta_descartada(
                            tenant_id=tenant_id,
                            comparativo_oferta_descartada_id=oferta_desc_model.id,
                            partidas=oferta_descartada_partidas,
                        ),
                    )

            repo.registrar_evento_historial(
                self.session,
                tenant_id=tenant_id,
                comparativo_id=comparativo.id,
                estado_anterior=estado_anterior,
                estado_nuevo=comparativo.estado,
                accion=AccionHistorialComparativo.EDICION.value,
                usuario_id=usuario_id or comparativo.usuario_actualizacion_id,
                comentario=comentario_historial,
            )
            self._commit()
            self.session.refresh(comparativo)
            return self._armar_detalle(comparativo)
        except DomainError:
            self._rollback()
            raise
        except Exception as exc:
            self._rollback()
            raise DomainError(
                "No se pudo editar el comparativo.",
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            ) from exc

    def obtener_comparativo(
        self,
        *,
        tenant_id: int,
        comparativo_id: int,
    ) -> ComparativoDetalleRead:
        comparativo = self._obtener_comparativo_o_error(
            tenant_id=tenant_id,
            comparativo_id=comparativo_id,
        )
        return self._armar_detalle(comparativo)

    def listar_comparativos(
        self,
        *,
        tenant_id: int,
        limit: int = 100,
        offset: int = 0,
    ) -> list[ComparativoResumenRead]:
        comparativos = repo.listar_comparativos_por_tenant(
            self.session,
            tenant_id=tenant_id,
            limit=limit,
            offset=offset,
        )
        proveedores_map = repo.obtener_proveedores_por_ids(
            self.session,
            proveedor_ids=[item.proveedor_id for item in comparativos],
        )
        salida: list[ComparativoResumenRead] = []
        for item in comparativos:
            proveedor = proveedores_map.get(item.proveedor_id)
            salida.append(
                ComparativoResumenRead.model_validate(item).model_copy(
                    update={
                        "cif": proveedor.get("cif") if proveedor else None,
                        "razon_social": proveedor.get("razon_social") if proveedor else None,
                    }
                )
            )
        return salida

    def enviar_a_aprobacion(
        self,
        *,
        tenant_id: int,
        comparativo_id: int,
        usuario_id: Optional[int],
        comentario: Optional[str] = None,
        aprobadores_iniciales: Optional[Sequence[dict[str, Any]]] = None,
    ) -> ComparativoDetalleRead:
        comparativo = self._obtener_comparativo_o_error(
            tenant_id=tenant_id,
            comparativo_id=comparativo_id,
        )
        if comparativo.estado not in _ESTADOS_ENVIABLES:
            raise DomainError(
                f"No se puede enviar a aprobacion desde estado {comparativo.estado}.",
                status_code=status.HTTP_400_BAD_REQUEST,
            )
        self._validar_datos_basicos_envio(comparativo)

        try:
            repo.crear_aprobaciones_iniciales_si_no_existen(
                self.session,
                tenant_id=tenant_id,
                comparativo_id=comparativo.id,
                aprobadores=aprobadores_iniciales,
            )
            estado_anterior = comparativo.estado
            comparativo.estado = EstadoComparativo.PENDIENTE_APROBACION.value
            comparativo.fecha_actualizacion = _utcnow()
            if usuario_id is not None:
                comparativo.usuario_actualizacion_id = usuario_id
            self.session.add(comparativo)
            self.session.flush()

            repo.registrar_evento_historial(
                self.session,
                tenant_id=tenant_id,
                comparativo_id=comparativo.id,
                estado_anterior=estado_anterior,
                estado_nuevo=comparativo.estado,
                accion=AccionHistorialComparativo.ENVIO_APROBACION.value,
                usuario_id=usuario_id,
                comentario=comentario,
            )
            self._commit()
            self.session.refresh(comparativo)
            return self._armar_detalle(comparativo)
        except DomainError:
            self._rollback()
            raise
        except Exception as exc:
            self._rollback()
            raise DomainError(
                "No se pudo enviar el comparativo a aprobacion.",
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            ) from exc

    def _normalize_text_token(self, value: Optional[str]) -> str:
        raw = (value or "").strip().lower()
        if not raw:
            return ""
        normalized = unicodedata.normalize("NFKD", raw)
        return "".join(ch for ch in normalized if not unicodedata.combining(ch))

    def _normalize_aprobacion_role(self, rol_aprobador: Optional[str]) -> Optional[str]:
        token = self._normalize_text_token(rol_aprobador)
        if token in {"obra", "director tecnico", "director_tecnico"} or "obra" in token:
            return "OBRA"
        if token in {"gerencia", "gerente", "direccion", "direccion general", "management"}:
            return "GERENCIA"
        if "gerenc" in token or token.startswith("direcc"):
            return "GERENCIA"
        return None

    def _roles_permitidos_para_usuario(
        self,
        *,
        tenant_id: int,
        usuario_id: int,
    ) -> set[str]:
        contexto = repo.obtener_contexto_usuario_aprobador(
            self.session,
            tenant_id=tenant_id,
            usuario_id=usuario_id,
        )
        if not contexto.get("usuario_encontrado"):
            raise DomainError(
                "Usuario aprobador no encontrado.",
                status_code=status.HTTP_404_NOT_FOUND,
            )
        if not contexto.get("can_approve_comparative"):
            return set()

        if contexto.get("is_super_admin"):
            return {"OBRA", "GERENCIA"}

        roles: set[str] = set()
        position_role_code = str(contexto.get("position_role_code") or "").strip().upper()
        if position_role_code in {"JO", "DT"}:
            roles.add("OBRA")

        for dept_name in contexto.get("departamentos") or []:
            token = self._normalize_text_token(str(dept_name))
            if token in {"obra", "director tecnico", "director_tecnico"} or "obra" in token:
                roles.add("OBRA")
            if token in {"gerencia", "gerente", "direccion", "direccion general", "management"}:
                roles.add("GERENCIA")
            elif "gerenc" in token or token.startswith("direcc"):
                roles.add("GERENCIA")
        return roles

    def _usuario_puede_resolver_aprobacion(
        self,
        *,
        aprobacion: ComparativoAprobacion,
        usuario_id: int,
        roles_usuario: set[str],
    ) -> bool:
        if aprobacion.usuario_aprobador_id is not None:
            return int(aprobacion.usuario_aprobador_id) == int(usuario_id)
        role = self._normalize_aprobacion_role(aprobacion.rol_aprobador)
        if role is None:
            return False
        return role in roles_usuario

    def _seleccionar_aprobacion_pendiente(
        self,
        *,
        tenant_id: int,
        aprobaciones: Sequence[ComparativoAprobacion],
        usuario_id: Optional[int],
        aprobacion_id: Optional[int],
    ) -> ComparativoAprobacion:
        pendientes = [
            item
            for item in aprobaciones
            if item.estado == EstadoAprobacionComparativo.PENDIENTE.value
        ]
        if not pendientes:
            raise DomainError(
                "No hay aprobaciones pendientes para resolver.",
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        min_orden = min(item.orden_aprobacion for item in pendientes)
        pendientes_actuales = [
            item for item in pendientes if item.orden_aprobacion == min_orden
        ]

        if usuario_id is None:
            raise DomainError(
                "usuario_id es obligatorio para resolver una aprobacion.",
                status_code=status.HTTP_400_BAD_REQUEST,
            )
        roles_usuario = self._roles_permitidos_para_usuario(
            tenant_id=tenant_id,
            usuario_id=usuario_id,
        )

        if aprobacion_id is not None:
            target = next((item for item in pendientes if item.id == aprobacion_id), None)
            if target is None:
                raise DomainError(
                    "La aprobacion indicada no esta pendiente o no pertenece al comparativo.",
                    status_code=status.HTTP_400_BAD_REQUEST,
                )
            if target.orden_aprobacion != min_orden:
                raise DomainError(
                    "La aprobacion indicada no corresponde al orden activo del flujo.",
                    status_code=status.HTTP_409_CONFLICT,
                )
            if not self._usuario_puede_resolver_aprobacion(
                aprobacion=target,
                usuario_id=usuario_id,
                roles_usuario=roles_usuario,
            ):
                raise DomainError(
                    "La aprobacion indicada no corresponde al usuario actual.",
                    status_code=status.HTTP_403_FORBIDDEN,
                )
            return target

        pendientes_asignadas = [
            item
            for item in pendientes_actuales
            if item.usuario_aprobador_id is not None
            and int(item.usuario_aprobador_id) == int(usuario_id)
        ]
        if len(pendientes_asignadas) == 1:
            return pendientes_asignadas[0]
        if len(pendientes_asignadas) > 1:
            raise DomainError(
                "Hay mas de una aprobacion pendiente asignada al usuario en el orden actual.",
                status_code=status.HTTP_409_CONFLICT,
            )

        pendientes_por_rol = [
            item
            for item in pendientes_actuales
            if item.usuario_aprobador_id is None
            and self._usuario_puede_resolver_aprobacion(
                aprobacion=item,
                usuario_id=usuario_id,
                roles_usuario=roles_usuario,
            )
        ]
        if len(pendientes_por_rol) == 1:
            return pendientes_por_rol[0]
        if len(pendientes_por_rol) > 1:
            raise DomainError(
                "No se pudo resolver de forma segura la aprobacion pendiente; indique aprobacion_id.",
                status_code=status.HTTP_409_CONFLICT,
            )

        if not roles_usuario and any(
            item.usuario_aprobador_id is None for item in pendientes_actuales
        ):
            raise DomainError(
                "No se pudo determinar el rol/departamento aprobador del usuario actual.",
                status_code=status.HTTP_403_FORBIDDEN,
            )
        raise DomainError(
            "No hay una aprobacion pendiente que corresponda al usuario actual.",
            status_code=status.HTTP_403_FORBIDDEN,
        )

    def _recalcular_aprobacion_actual(
        self,
        aprobaciones: Sequence[ComparativoAprobacion],
    ) -> list[ComparativoAprobacion]:
        pendientes = [
            item
            for item in aprobaciones
            if item.estado == EstadoAprobacionComparativo.PENDIENTE.value
        ]
        # Aprobaciones paralelas: el orden mínimo pendiente determina el grupo activo.
        # Todos los pendientes de ese orden mínimo son "actuales" simultáneamente.
        min_orden = min((item.orden_aprobacion for item in pendientes), default=None)
        pendientes_actuales = {
            item.id for item in pendientes if item.orden_aprobacion == min_orden
        }
        for item in aprobaciones:
            item.es_aprobacion_actual = item.id in pendientes_actuales
            item.fecha_actualizacion = _utcnow()
            self.session.add(item)
        self.session.flush()
        return pendientes

    def aprobar_comparativo(
        self,
        *,
        tenant_id: int,
        comparativo_id: int,
        usuario_id: Optional[int],
        comentario: Optional[str] = None,
        aprobacion_id: Optional[int] = None,
    ) -> ComparativoDetalleRead:
        comparativo = self._obtener_comparativo_o_error(
            tenant_id=tenant_id,
            comparativo_id=comparativo_id,
        )
        if comparativo.estado != EstadoComparativo.PENDIENTE_APROBACION.value:
            raise DomainError(
                f"El comparativo no esta pendiente de aprobacion (estado: {comparativo.estado}).",
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        try:
            aprobaciones = repo.obtener_aprobaciones_por_comparativo(
                self.session,
                tenant_id=tenant_id,
                comparativo_id=comparativo.id,
            )
            if not aprobaciones:
                aprobaciones = repo.crear_aprobaciones_iniciales_si_no_existen(
                    self.session,
                    tenant_id=tenant_id,
                    comparativo_id=comparativo.id,
                    aprobadores=None,
                )

            aprobacion = self._seleccionar_aprobacion_pendiente(
                tenant_id=tenant_id,
                aprobaciones=aprobaciones,
                usuario_id=usuario_id,
                aprobacion_id=aprobacion_id,
            )
            repo.actualizar_aprobacion(
                self.session,
                aprobacion=aprobacion,
                estado=EstadoAprobacionComparativo.APROBADO,
                comentario=comentario,
                usuario_resolucion_id=usuario_id,
            )

            aprobaciones_actualizadas = repo.obtener_aprobaciones_por_comparativo(
                self.session,
                tenant_id=tenant_id,
                comparativo_id=comparativo.id,
            )
            pendientes = self._recalcular_aprobacion_actual(aprobaciones_actualizadas)

            estado_anterior = comparativo.estado
            cerrado_ahora = not pendientes
            if cerrado_ahora:
                comparativo.estado = EstadoComparativo.APROBADO.value
                comparativo.fecha_aprobacion = _utcnow()
                comparativo.fecha_rechazo = None
                comparativo.motivo_rechazo = None
            comparativo.fecha_actualizacion = _utcnow()
            if usuario_id is not None:
                comparativo.usuario_actualizacion_id = usuario_id
            self.session.add(comparativo)
            self.session.flush()

            repo.registrar_evento_historial(
                self.session,
                tenant_id=tenant_id,
                comparativo_id=comparativo.id,
                estado_anterior=estado_anterior,
                estado_nuevo=comparativo.estado,
                accion=AccionHistorialComparativo.APROBACION.value,
                usuario_id=usuario_id,
                comentario=comentario,
            )
            # Camino I: si esta aprobacion cierra el circuito (ultima
            # rama aprobada), generamos automaticamente el contrato v2.
            # La operacion es idempotente: si ya existe contrato vinculado
            # devuelve el existente sin re-crear.
            if cerrado_ahora and comparativo.contrato_id is None:
                self._generar_contrato_desde_comparativo_impl(
                    comparativo=comparativo,
                    usuario_id=usuario_id,
                )
            self._commit()
            self.session.refresh(comparativo)
            return self._armar_detalle(comparativo)
        except DomainError:
            self._rollback()
            raise
        except Exception as exc:
            self._rollback()
            raise DomainError(
                "No se pudo aprobar el comparativo.",
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            ) from exc

    def rechazar_comparativo(
        self,
        *,
        tenant_id: int,
        comparativo_id: int,
        usuario_id: Optional[int],
        motivo: Optional[str],
        comentario: Optional[str] = None,
        aprobacion_id: Optional[int] = None,
    ) -> ComparativoDetalleRead:
        comparativo = self._obtener_comparativo_o_error(
            tenant_id=tenant_id,
            comparativo_id=comparativo_id,
        )
        if comparativo.estado != EstadoComparativo.PENDIENTE_APROBACION.value:
            raise DomainError(
                f"El comparativo no esta pendiente de aprobacion (estado: {comparativo.estado}).",
                status_code=status.HTTP_400_BAD_REQUEST,
            )
        if not motivo or not motivo.strip():
            raise DomainError("El motivo de rechazo es obligatorio.")

        try:
            aprobaciones = repo.obtener_aprobaciones_por_comparativo(
                self.session,
                tenant_id=tenant_id,
                comparativo_id=comparativo.id,
            )
            if aprobaciones:
                aprobacion = self._seleccionar_aprobacion_pendiente(
                    tenant_id=tenant_id,
                    aprobaciones=aprobaciones,
                    usuario_id=usuario_id,
                    aprobacion_id=aprobacion_id,
                )
                repo.actualizar_aprobacion(
                    self.session,
                    aprobacion=aprobacion,
                    estado=EstadoAprobacionComparativo.RECHAZADO,
                    comentario=comentario or motivo,
                    usuario_resolucion_id=usuario_id,
                )
                aprobaciones_actualizadas = repo.obtener_aprobaciones_por_comparativo(
                    self.session,
                    tenant_id=tenant_id,
                    comparativo_id=comparativo.id,
                )
                self._recalcular_aprobacion_actual(aprobaciones_actualizadas)

            estado_anterior = comparativo.estado
            comparativo.estado = EstadoComparativo.RECHAZADO.value
            comparativo.fecha_rechazo = _utcnow()
            comparativo.motivo_rechazo = motivo.strip()
            comparativo.fecha_aprobacion = None
            comparativo.fecha_actualizacion = _utcnow()
            if usuario_id is not None:
                comparativo.usuario_actualizacion_id = usuario_id
            self.session.add(comparativo)
            self.session.flush()

            repo.registrar_evento_historial(
                self.session,
                tenant_id=tenant_id,
                comparativo_id=comparativo.id,
                estado_anterior=estado_anterior,
                estado_nuevo=comparativo.estado,
                accion=AccionHistorialComparativo.RECHAZO.value,
                usuario_id=usuario_id,
                comentario=comentario or motivo,
                metadatos_json={"motivo_rechazo": motivo.strip()},
            )
            self._commit()
            self.session.refresh(comparativo)
            return self._armar_detalle(comparativo)
        except DomainError:
            self._rollback()
            raise
        except Exception as exc:
            self._rollback()
            raise DomainError(
                "No se pudo rechazar el comparativo.",
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            ) from exc

    def devolver_a_cambios(
        self,
        *,
        tenant_id: int,
        comparativo_id: int,
        usuario_id: Optional[int],
        comentario: str,
    ) -> ComparativoDetalleRead:
        comparativo = self._obtener_comparativo_o_error(
            tenant_id=tenant_id,
            comparativo_id=comparativo_id,
        )
        if comparativo.estado not in _ESTADOS_RETORNABLES:
            raise DomainError(
                f"No se puede devolver a cambios desde estado {comparativo.estado}.",
                status_code=status.HTTP_400_BAD_REQUEST,
            )
        if not comentario or not comentario.strip():
            raise DomainError("El comentario de devolucion es obligatorio.")

        try:
            estado_anterior = comparativo.estado
            comparativo.estado = EstadoComparativo.NECESITA_CAMBIOS.value
            comparativo.fecha_actualizacion = _utcnow()
            comparativo.fecha_rechazo = None
            comparativo.motivo_rechazo = None
            if usuario_id is not None:
                comparativo.usuario_actualizacion_id = usuario_id
            self.session.add(comparativo)
            self.session.flush()

            repo.registrar_evento_historial(
                self.session,
                tenant_id=tenant_id,
                comparativo_id=comparativo.id,
                estado_anterior=estado_anterior,
                estado_nuevo=comparativo.estado,
                accion=AccionHistorialComparativo.DEVOLUCION_CAMBIOS.value,
                usuario_id=usuario_id,
                comentario=comentario.strip(),
            )
            self._commit()
            self.session.refresh(comparativo)
            return self._armar_detalle(comparativo)
        except DomainError:
            self._rollback()
            raise
        except Exception as exc:
            self._rollback()
            raise DomainError(
                "No se pudo devolver el comparativo a cambios.",
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            ) from exc

    def registrar_historial(
        self,
        *,
        tenant_id: int,
        comparativo_id: int,
        accion: AccionHistorialComparativo,
        usuario_id: Optional[int],
        comentario: Optional[str] = None,
        estado_anterior: EstadoComparativo | str | None = None,
        estado_nuevo: EstadoComparativo | str | None = None,
        metadatos_json: Optional[dict[str, Any]] = None,
    ) -> ComparativoHistorialFlujoRead:
        self._obtener_comparativo_o_error(
            tenant_id=tenant_id,
            comparativo_id=comparativo_id,
        )
        try:
            item = repo.registrar_evento_historial(
                self.session,
                tenant_id=tenant_id,
                comparativo_id=comparativo_id,
                estado_anterior=_estado_value(estado_anterior),
                estado_nuevo=_estado_value(estado_nuevo),
                accion=accion.value,
                usuario_id=usuario_id,
                comentario=comentario,
                metadatos_json=metadatos_json,
            )
            self._commit()
            return ComparativoHistorialFlujoRead.model_validate(item)
        except DomainError:
            self._rollback()
            raise
        except Exception as exc:
            self._rollback()
            raise DomainError(
                "No se pudo registrar el historial del comparativo.",
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            ) from exc

    def _tipo_contrato_requiere_partidas(self, tipo_contrato: Optional[str]) -> bool:
        token = self._normalize_text_token(tipo_contrato).replace(" ", "_").upper()
        return token in _TIPOS_CONTRATO_REQUIEREN_PARTIDAS

    def _generar_contrato_desde_comparativo_impl(
        self,
        *,
        comparativo: Comparativo,
        usuario_id: Optional[int],
    ) -> int:
        """Implementacion sin commit/rollback. Pensada para llamarse desde
        `aprobar_comparativo` dentro de su misma transaccion.

        Idempotente: si `comparativo.contrato_id` ya existe, devuelve ese
        contrato_id sin recrear nada.

        Devuelve el `contrato_id` resultante.
        """
        from app.platform.contracts_core.comparativos_enums import AccionHistorialContrato

        if comparativo.estado != EstadoComparativo.APROBADO.value:
            raise DomainError(
                "Solo se puede generar contrato desde un comparativo APROBADO.",
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        linked_contract = None
        if comparativo.contrato_id is not None:
            linked_contract = repo.obtener_contrato_por_id(
                self.session,
                tenant_id=comparativo.tenant_id,
                contrato_id=int(comparativo.contrato_id),
            )
            if (
                linked_contract is not None
                and linked_contract.comparativo_id not in (None, comparativo.id)
            ):
                logger.warning(
                    "comparativos_v2 op=generar_contrato comparativo_id=%s contrato_id=%s "
                    "link_mismatch_contrato_comparativo=%s",
                    comparativo.id,
                    linked_contract.id,
                    linked_contract.comparativo_id,
                )
                linked_contract = None
            if linked_contract is not None:
                if linked_contract.comparativo_id is None:
                    linked_contract.comparativo_id = comparativo.id
                    linked_contract.fecha_actualizacion = _utcnow()
                    self.session.add(linked_contract)
                    self.session.flush()
                logger.info(
                    "comparativos_v2 op=generar_contrato comparativo_id=%s contrato_id=%s reused=link",
                    comparativo.id,
                    linked_contract.id,
                )
                self._activar_legacy_pending_template_desde_v2(
                    comparativo=comparativo,
                    contrato_id=int(linked_contract.id),
                    usuario_id=usuario_id,
                )
                return int(linked_contract.id)

        existing_contract = repo.obtener_contrato_por_comparativo_id(
            self.session,
            tenant_id=comparativo.tenant_id,
            comparativo_id=comparativo.id,
        )
        if existing_contract is not None:
            if comparativo.contrato_id != existing_contract.id:
                comparativo.contrato_id = existing_contract.id
                comparativo.fecha_actualizacion = _utcnow()
                self.session.add(comparativo)
                self.session.flush()
                repo.registrar_evento_historial(
                    self.session,
                    tenant_id=comparativo.tenant_id,
                    comparativo_id=comparativo.id,
                    estado_anterior=comparativo.estado,
                    estado_nuevo=comparativo.estado,
                    accion=AccionHistorialComparativo.GENERACION_CONTRATO.value,
                    usuario_id=usuario_id,
                    comentario="Contrato v2 existente reutilizado y re-enlazado al comparativo.",
                    metadatos_json={"contrato_id": int(existing_contract.id), "reutilizado": True},
                )
            logger.info(
                "comparativos_v2 op=generar_contrato comparativo_id=%s contrato_id=%s reused=comparativo_id",
                comparativo.id,
                existing_contract.id,
            )
            self._activar_legacy_pending_template_desde_v2(
                comparativo=comparativo,
                contrato_id=int(existing_contract.id),
                usuario_id=usuario_id,
            )
            return int(existing_contract.id)

        if comparativo.proveedor_id is None:
            raise DomainError(
                "El comparativo no tiene proveedor_id; no se puede generar contrato.",
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        proveedor = repo.obtener_proveedor_por_id(
            self.session,
            proveedor_id=int(comparativo.proveedor_id),
        )
        if proveedor is None:
            raise DomainError(
                "Proveedor referenciado por el comparativo no existe en `proveedores`.",
                status_code=status.HTTP_404_NOT_FOUND,
            )

        oferta_adjudicada = repo.obtener_oferta_adjudicada_por_comparativo(
            self.session,
            tenant_id=comparativo.tenant_id,
            comparativo_id=comparativo.id,
        )
        if oferta_adjudicada is None:
            raise DomainError(
                "No se puede generar contrato sin oferta adjudicada en comparativo v2.",
                status_code=status.HTTP_400_BAD_REQUEST,
            )
        partidas_adjudicadas = repo.obtener_partidas_oferta_adjudicada(
            self.session,
            tenant_id=comparativo.tenant_id,
            comparativo_oferta_adjudicada_id=oferta_adjudicada.id,
        )
        if (
            self._tipo_contrato_requiere_partidas(comparativo.tipo_contrato)
            and not partidas_adjudicadas
        ):
            raise DomainError(
                "El tipo de contrato requiere partidas adjudicadas y no se encontraron.",
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        contrato = repo.crear_contrato_desde_comparativo(
            self.session,
            comparativo=comparativo,
            usuario_id=usuario_id or comparativo.usuario_creador_id,
        )

        repo.crear_datos_proveedor_snapshot(
            self.session,
            tenant_id=comparativo.tenant_id,
            contrato_id=contrato.id,
            proveedor_id=int(comparativo.proveedor_id),
            proveedor_data=proveedor,
        )

        hitos_origen = repo.obtener_hitos_por_comparativo(
            self.session,
            tenant_id=comparativo.tenant_id,
            comparativo_id=comparativo.id,
        )
        if hitos_origen:
            repo.copiar_hitos_comparativo_a_contrato(
                self.session,
                tenant_id=comparativo.tenant_id,
                contrato_id=contrato.id,
                hitos_origen=hitos_origen,
            )

        oferta_snapshot = repo.crear_oferta_adjudicada_snapshot_contrato(
            self.session,
            tenant_id=comparativo.tenant_id,
            contrato_id=contrato.id,
            comparativo=comparativo,
            oferta_origen=oferta_adjudicada,
            proveedor_data=proveedor,
        )
        partidas_snapshot = repo.crear_partidas_adjudicadas_snapshot_contrato(
            self.session,
            tenant_id=comparativo.tenant_id,
            contrato_id=contrato.id,
            contrato_oferta_adjudicada_id=oferta_snapshot.id,
            partidas_origen=partidas_adjudicadas,
        )

        repo.registrar_evento_historial_contrato(
            self.session,
            tenant_id=comparativo.tenant_id,
            contrato_id=contrato.id,
            accion=AccionHistorialContrato.CREACION.value,
            usuario_id=usuario_id or comparativo.usuario_creador_id,
            estado_anterior=None,
            estado_nuevo=contrato.estado,
            comentario="Contrato generado automaticamente desde comparativo aprobado.",
            metadatos_json={
                "comparativo_id": int(comparativo.id),
                "oferta_adjudicada_id": int(oferta_adjudicada.id),
                "contrato_oferta_adjudicada_id": int(oferta_snapshot.id),
                "partidas_adjudicadas_count": len(partidas_snapshot),
            },
        )

        logger.info(
            "comparativos_v2 op=generar_contrato comparativo_id=%s contrato_id=%s "
            "oferta_adjudicada_id=%s contrato_oferta_adjudicada_id=%s partidas=%s",
            comparativo.id,
            contrato.id,
            oferta_adjudicada.id,
            oferta_snapshot.id,
            len(partidas_snapshot),
        )

        # Enlace en el comparativo y evento de auditoria
        comparativo.contrato_id = contrato.id
        comparativo.fecha_actualizacion = _utcnow()
        self.session.add(comparativo)
        self.session.flush()

        repo.registrar_evento_historial(
            self.session,
            tenant_id=comparativo.tenant_id,
            comparativo_id=comparativo.id,
            estado_anterior=comparativo.estado,
            estado_nuevo=comparativo.estado,
            accion=AccionHistorialComparativo.GENERACION_CONTRATO.value,
            usuario_id=usuario_id,
            comentario=None,
            metadatos_json={
                "contrato_id": int(contrato.id),
                "oferta_adjudicada_id": int(oferta_adjudicada.id),
                "contrato_oferta_adjudicada_id": int(oferta_snapshot.id),
                "partidas_adjudicadas_count": len(partidas_snapshot),
            },
        )

        self._activar_legacy_pending_template_desde_v2(
            comparativo=comparativo,
            contrato_id=int(contrato.id),
            usuario_id=usuario_id,
        )

        return int(contrato.id)

    def generar_contrato_desde_comparativo(
        self,
        *,
        tenant_id: int,
        comparativo_id: int,
        usuario_id: Optional[int],
    ) -> int:
        """Entrypoint publico: envuelve el impl en commit/rollback.

        Devuelve el `contrato_id` (existente o recien creado).
        """
        comparativo = self._obtener_comparativo_o_error(
            tenant_id=tenant_id,
            comparativo_id=comparativo_id,
        )
        try:
            contrato_id = self._generar_contrato_desde_comparativo_impl(
                comparativo=comparativo,
                usuario_id=usuario_id,
            )
            self._commit()
            return contrato_id
        except DomainError:
            self._rollback()
            raise
        except Exception as exc:
            self._rollback()
            raise DomainError(
                "No se pudo generar el contrato desde el comparativo.",
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            ) from exc
