"""
Punto central donde se importan todos los modelos SQLModel.

Esto permite que `SQLModel.metadata.create_all()` conozca todas las tablas.
"""

from app.models.tenant import Tenant  # noqa: F401
from app.models.user import User  # noqa: F401
from app.models.role import Role  # noqa: F401
from app.models.permission import Permission  # noqa: F401
from app.models.role_permission import RolePermission  # noqa: F401
from app.models.tool import Tool  # noqa: F401
from app.models.tenant_tool import TenantTool  # noqa: F401
from app.models.department_tool import DepartmentTool  # noqa: F401
from app.models.tenant_branding import TenantBranding  # noqa: F401
from app.models.audit_log import AuditLog  # noqa: F401
from app.models.notification import Notification  # noqa: F401
from app.models.mfa_email_code import MFAEmailCode  # noqa: F401
from app.models.ticket import Ticket  # noqa: F401
from app.models.ticket_message import TicketMessage  # noqa: F401
from app.models.ticket_participant import TicketParticipant  # noqa: F401
from app.models.hr import (  # noqa: F401
    Department,
    EmployeeProfile,
    EmployeeDepartment,
    EmployeeAllocation,
    EmployeeYearAvailability,
    Position,
)  # noqa: F401
from app.models.user_invitation import UserInvitation  # noqa: F401
from app.models.erp import (  # noqa: F401
    Activity,
    Deliverable,
    Milestone,
    Project,
    ProjectBudgetLine,
    ProjectBudgetMilestone,
    BudgetLineMilestone,
    ExternalCollaboration,
    SimulationProject,
    SimulationExpense,
    SubActivity,
    Task,
    TaskTemplate,
    TimeEntry,
    TimeEntryDepartmentSplit,
    TimeSession,
    ProjectDocument,
)
from app.models.summary import SummaryYear  # noqa: F401
from app.models.work_catalog import WorkSite  # noqa: F401
from app.domains.invoices.models import Invoice, InvoiceEvent, NotificationLog  # noqa: F401
from app.platform.contracts_core.models import (  # noqa: F401
    Contract,
    ContractOffer,
    ContractApproval,
    ContractDocument,
    ContractWorkflowStep,
    ContractWorkflowApproval,
    SignatureRequest,
    ContractEvent,
    ContractNotificationLog,
    Supplier,
    SupplierInvitation,
)
from app.domains.signatures._core.models import (  # noqa: F401
    SignatureArtifact,
    SignatureEvidence,
    SignatureProviderRequest,
    SignatureProviderEvent,
    SignatureRequest as SignatureRequestSignature,
    TenantSignatureConfig,
)

# Flujo nuevo de comparativos y contratos (Fase 1). Tablas en espanol,
# desacopladas del modelo legacy `contract`. FK a `proveedores` (BIGINT).
from app.platform.contracts_core.comparativos_models import (  # noqa: F401
    Comparativo,
    ComparativoHito,
    ComparativoAprobacion,
    ComparativoHistorialFlujo,
    ComparativoOfertaAdjudicada,
    ComparativoOfertaAdjudicadaPartida,
    ComparativoOfertaDescartada,
    ComparativoOfertaDescartadaPartida,
    Contrato,
    ContratoDatosProveedor,
    ContratoHito,
    ContratoHistorialFlujo,
)


