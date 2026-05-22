from __future__ import annotations

from typing import Any

from app.platform.contracts_core.models import Contract, ContractType


def _anchor_map_for(contract: Contract) -> dict[str, list[str]]:
    base = {
        "razon_social": ["razon_social", "empresa", "proveedor", "razon social"],
        "cif": ["cif", "nif", "c_i_f"],
        "direccion_empresa": ["direccion_empresa", "direccion", "domicilio"],
        "nombre_gerente": ["nombre_gerente", "representante", "intervienen"],
        "nif_gerente": ["nif_gerente", "dni_gerente", "d_n_i"],
        "importe_total": ["importe_total", "importe", "precio", "total"],
        "fecha_inicio": ["fecha_inicio", "inicio"],
        "fecha_fin": ["fecha_fin", "fin"],
        "project_name": ["nombre_obra", "nom_obra", "obra"],
        "project_number": ["num_obra", "expediente"],
        "promoter": ["promotora"],
    }
    contract_type = contract.type.value if hasattr(contract.type, "value") else str(contract.type)
    if contract_type == ContractType.SUBCONTRATACION.value:
        base.update(
            {
                "deed_type": ["tipo_escritura", "escritura"],
                "deed_date": ["fecha_escritura", "fecha escritura"],
                "notary_name": ["notario", "nombre_notario"],
                "protocol_number": ["protocolo", "num_protocolo"],
            }
        )
    return base


def _line_buckets(words: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
    buckets: dict[int, list[dict[str, Any]]] = {}
    for word in words:
        try:
            top = int(round(float(word.get("top", 0.0))))
        except Exception:
            top = 0
        buckets.setdefault(top, []).append(word)
    lines: list[list[dict[str, Any]]] = []
    for _, line_words in sorted(buckets.items(), key=lambda item: item[0]):
        lines.append(sorted(line_words, key=lambda w: float(w.get("x0", 0.0))))
    return lines

