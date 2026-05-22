from __future__ import annotations

from typing import Iterable

from app.platform.contracts_core.models import ApprovalStatus, ContractApproval, ContractStatus


def all_departments_approved(approvals: Iterable[ContractApproval]) -> bool:
    return all(approval.status == ApprovalStatus.APPROVED for approval in approvals)


def any_department_rejected(approvals: Iterable[ContractApproval]) -> bool:
    return any(approval.status == ApprovalStatus.REJECTED for approval in approvals)


def ensure_status(current: ContractStatus, allowed: Iterable[ContractStatus]) -> None:
    if current not in set(allowed):
        raise ValueError(f"Transicion invalida desde estado {current}")

