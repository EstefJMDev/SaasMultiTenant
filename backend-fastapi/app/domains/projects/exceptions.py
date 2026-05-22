class ProjectsDomainError(Exception):
    """Base error for project domain failures."""


class ProjectNotFoundError(ProjectsDomainError):
    """Raised when a project is missing or outside tenant scope."""


class ProjectBudgetLineNotFoundError(ProjectsDomainError):
    """Raised when a budget line does not exist for the project."""


class ProjectBudgetMilestoneNotFoundError(ProjectsDomainError):
    """Raised when a budget milestone does not exist for the project."""


class ProjectValidationError(ProjectsDomainError):
    """Raised when a project operation fails domain validation."""
