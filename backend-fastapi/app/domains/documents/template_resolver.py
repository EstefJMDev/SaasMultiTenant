from __future__ import annotations

from pathlib import Path

from app.platform.contracts_core.models import Contract, ContractType


def _template_path_for(contract: Contract) -> Path | None:
    app_root = Path(__file__).resolve().parents[2]
    new_templates_dir = app_root / "domains" / "procurement" / "contracts" / "templates"
    contract_type = contract.type.value if hasattr(contract.type, "value") else str(contract.type)
    filenames_by_type = {
        ContractType.SERVICIO.value: ["SERVICIOS.pdf", "SERVICIO.pdf"],
        ContractType.SUMINISTRO.value: ["SUMINISTRO.pdf", "SUMINISTROS.pdf"],
        ContractType.SUBCONTRATACION.value: ["SUBCONTRATACION.pdf"],
    }
    filenames = filenames_by_type.get(contract_type)
    if not filenames:
        return None
    for filename in filenames:
        candidate = new_templates_dir / filename
        if candidate.exists():
            return candidate
    return None


def _docx_template_path_for(contract: Contract) -> Path | None:
    app_root = Path(__file__).resolve().parents[2]
    new_templates_dir = app_root / "domains" / "procurement" / "contracts" / "templates"
    contract_type = contract.type.value if hasattr(contract.type, "value") else str(contract.type)
    filename_by_type = {
        ContractType.SERVICIO.value: "CONTRATO_SERVICIOS_template.docx",
        ContractType.SUMINISTRO.value: "CONTRATO_SUMINISTRO_template.docx",
        ContractType.SUBCONTRATACION.value: "CONTRATO_SUBCONTRATACION_template.docx",
    }
    filename = filename_by_type.get(contract_type)
    if not filename:
        return None
    candidate = new_templates_dir / filename
    if candidate.exists():
        return candidate
    return None

