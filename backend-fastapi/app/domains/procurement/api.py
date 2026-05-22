from app.domains.procurement.comparatives import service as comparatives_service
from app.domains.procurement.contracts import crud as contracts_crud
from app.domains.procurement.contracts import read as contracts_read
from app.domains.procurement.contracts import validators as contracts_validators
from app.domains.procurement.documents import service as documents_service
from app.domains.procurement.workflow import approvals as workflow_approvals

add_offer = comparatives_service.add_offer
approve_all_phases_superadmin = workflow_approvals.approve_all_phases_superadmin
approve_comparative = comparatives_service.approve_comparative
return_comparative = comparatives_service.return_comparative
approve_contract = workflow_approvals.approve_contract
build_contract_read = contracts_read.build_contract_read
build_contract_reads = contracts_read.build_contract_reads
build_required_fields = contracts_validators.build_required_fields
format_jefe_obra_intake_missing_fields = contracts_validators.format_jefe_obra_intake_missing_fields
build_supplier_onboarding_payload = contracts_validators.build_supplier_onboarding_payload
create_contract = contracts_crud.create_contract
delete_contract = contracts_crud.delete_contract
generate_docs = documents_service.generate_docs
generate_contract_document = documents_service.generate_contract_document
generate_supplier_onboarding_link = documents_service.generate_supplier_onboarding_link
start_supplier_invitation = documents_service.start_supplier_invitation
get_comparative_offers = comparatives_service.get_comparative_offers
get_contract = contracts_crud.get_contract
get_contract_document_by_type = documents_service.get_contract_document_by_type
get_contract_comparative_approvals = workflow_approvals.get_contract_comparative_approvals
get_contract_workflow_approvals = workflow_approvals.get_contract_workflow_approvals
get_contract_workflow_config = workflow_approvals.get_contract_workflow_config
list_contract_documents = documents_service.list_contract_documents
list_contracts = contracts_crud.list_contracts
rebuild_comparative = comparatives_service.rebuild_comparative
regenerate_contract_pdf = documents_service.regenerate_contract_pdf
reject_comparative = comparatives_service.reject_comparative
reject_contract = workflow_approvals.reject_contract
save_comparative_draft = comparatives_service.save_comparative_draft
select_offer = comparatives_service.select_offer
set_contract_workflow_config = workflow_approvals.set_contract_workflow_config
submit_comparative = comparatives_service.submit_comparative
validate_rea_for_contract = comparatives_service.validate_rea_for_contract
send_supplier_form_after_approval = comparatives_service.send_supplier_form_after_approval
sync_comparative_offer_ids = comparatives_service.sync_comparative_offer_ids
submit_gerencia = workflow_approvals.submit_gerencia
submit_supplier_onboarding = documents_service.submit_supplier_onboarding
validate_jefe_obra_intake = contracts_validators.validate_jefe_obra_intake
validate_required = contracts_validators.validate_required
update_contract = contracts_crud.update_contract
validate_supplier_onboarding = documents_service.validate_supplier_onboarding

__all__ = [
    "add_offer",
    "approve_all_phases_superadmin",
    "approve_comparative",
    "approve_contract",
    "build_contract_read",
    "build_contract_reads",
    "build_required_fields",
    "format_jefe_obra_intake_missing_fields",
    "build_supplier_onboarding_payload",
    "create_contract",
    "delete_contract",
    "generate_docs",
    "generate_contract_document",
    "generate_supplier_onboarding_link",
    "start_supplier_invitation",
    "get_comparative_offers",
    "get_contract",
    "get_contract_comparative_approvals",
    "get_contract_document_by_type",
    "get_contract_workflow_approvals",
    "get_contract_workflow_config",
    "list_contract_documents",
    "list_contracts",
    "rebuild_comparative",
    "regenerate_contract_pdf",
    "reject_comparative",
    "return_comparative",
    "reject_contract",
    "save_comparative_draft",
    "select_offer",
    "set_contract_workflow_config",
    "submit_comparative",
    "validate_rea_for_contract",
    "send_supplier_form_after_approval",
    "sync_comparative_offer_ids",
    "submit_gerencia",
    "submit_supplier_onboarding",
    "validate_jefe_obra_intake",
    "validate_required",
    "update_contract",
    "validate_supplier_onboarding",
]
