from pathlib import Path

from app.platform.contracts_core.models import Contract, ContractType
from app.domains.documents import template_resolver


def _fake_contract(contract_type: ContractType) -> Contract:
    return Contract(tenant_id=1, created_by_id=1, type=contract_type, status="DRAFT")


def test_template_resolver_prefers_new_location(tmp_path, monkeypatch) -> None:
    app_root = Path(template_resolver.__file__).resolve().parents[2]
    new_dir = app_root / "domains" / "procurement" / "contracts" / "templates"

    new_dir.mkdir(parents=True, exist_ok=True)

    candidates = ["SERVICIOS.pdf", "SERVICIO.pdf"]
    backups = []
    try:
        for name in candidates:
            path = new_dir / name
            backup = new_dir / f"{name}.bak"
            if path.exists():
                path.rename(backup)
                backups.append((backup, path))
        new_file = new_dir / "SERVICIO.pdf"
        new_file.write_text("new")

        contract = _fake_contract(ContractType.SERVICIO)
        resolved = template_resolver._template_path_for(contract)
        assert resolved == new_file
    finally:
        if (new_dir / "SERVICIO.pdf").exists():
            (new_dir / "SERVICIO.pdf").unlink()
        for backup, original in backups:
            if backup.exists():
                backup.rename(original)


def test_template_resolver_returns_none_when_missing(tmp_path, monkeypatch) -> None:
    app_root = Path(template_resolver.__file__).resolve().parents[2]
    new_dir = app_root / "domains" / "procurement" / "contracts" / "templates"

    new_dir.mkdir(parents=True, exist_ok=True)

    target = new_dir / "SUMINISTRO.pdf"
    temp = new_dir / "SUMINISTRO.pdf.bak"
    try:
        if target.exists():
            target.rename(temp)
        contract = _fake_contract(ContractType.SUMINISTRO)
        resolved = template_resolver._template_path_for(contract)
        assert resolved is None
    finally:
        if temp.exists():
            temp.rename(target)

