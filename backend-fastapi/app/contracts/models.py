"""Legacy import alias for contracts models.

Re-exports from app.platform.contracts_core.models to preserve old import paths:
- from app.contracts.models import ...
- import app.contracts.models
"""

from app.platform.contracts_core.models import *  # noqa: F401,F403
