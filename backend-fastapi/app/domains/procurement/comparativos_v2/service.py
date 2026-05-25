from __future__ import annotations

from datetime import datetime, timezone
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
    oferta_descartada: Optional[ComparativoOfertaDescartadaRead] = None
    oferta_descartada_partidas: list[ComparativoOfertaDescartadaPartidaRead] = Field(
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
        if comparativo.obra_id is None:
            raise DomainError("No se puede enviar a aprobacion sin obra_id.")
        if not comparativo.numero_obra or not comparativo.nombre_obra:
            raise DomainError(
                "No se puede enviar a aprobacion sin snapshot de obra (numero_obra, nombre_obra)."
            )
        if not comparativo.tipo_contrato:
            raise DomainError("No se puede enviar a aprobacion sin tipo_contrato.")
        self._validar_proveedor_existe(comparativo.proveedor_id)

    def _comparativo_read_con_proveedor(
        self,
        comparativo: Comparativo,
    ) -> ComparativoRead:
        proveedor = repo.obtener_proveedor_por_id(
            self.session,
            proveedor_id=comparativo.proveedor_id,
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

        oferta_descartada_model = repo.obtener_oferta_descartada_por_comparativo(
            self.session,
            tenant_id=comparativo.tenant_id,
            comparativo_id=comparativo.id,
        )
        oferta_descartada = (
            ComparativoOfertaDescartadaRead.model_validate(oferta_descartada_model)
            if oferta_descartada_model
            else None
        )
        oferta_descartada_partidas = (
            [
                ComparativoOfertaDescartadaPartidaRead.model_validate(item)
                for item in repo.obtener_partidas_oferta_descartada(
                    self.session,
                    tenant_id=comparativo.tenant_id,
                    comparativo_oferta_descartada_id=oferta_descartada_model.id,
                )
            ]
            if oferta_descartada_model
            else []
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
            oferta_descartada=oferta_descartada,
            oferta_descartada_partidas=oferta_descartada_partidas,
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

    def _seleccionar_aprobacion_pendiente(
        self,
        *,
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

        if aprobacion_id is not None:
            for item in pendientes:
                if item.id == aprobacion_id:
                    return item
            raise DomainError(
                "La aprobacion indicada no esta pendiente o no pertenece al comparativo.",
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        if usuario_id is not None:
            for item in pendientes:
                if item.usuario_aprobador_id == usuario_id:
                    return item
        return pendientes[0]

    def _recalcular_aprobacion_actual(
        self,
        aprobaciones: Sequence[ComparativoAprobacion],
    ) -> list[ComparativoAprobacion]:
        pendientes = sorted(
            [
                item
                for item in aprobaciones
                if item.estado == EstadoAprobacionComparativo.PENDIENTE.value
            ],
            key=lambda item: (item.orden_aprobacion, item.id),
        )
        siguiente = pendientes[0] if pendientes else None
        for item in aprobaciones:
            item.es_aprobacion_actual = bool(siguiente and item.id == siguiente.id)
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
            if not pendientes:
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

    def generar_contrato_desde_comparativo(
        self,
        *,
        tenant_id: int,
        comparativo_id: int,
        usuario_id: Optional[int],
    ) -> None:
        self._obtener_comparativo_o_error(
            tenant_id=tenant_id,
            comparativo_id=comparativo_id,
        )
        raise DomainError(
            (
                "generar_contrato_desde_comparativo aun no esta implementado "
                "en Fase 3. Queda pendiente para la fase de contratos."
            ),
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
        )
