from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel


class SimulationExpenseBase(BaseModel):
    # DTO base para gastos de simulacion.
    concept: str
    amount: Decimal


class SimulationExpenseCreate(SimulationExpenseBase):
    pass


class SimulationExpenseUpdate(BaseModel):
    concept: Optional[str] = None
    amount: Optional[Decimal] = None


class SimulationExpenseRead(SimulationExpenseBase):
    # Respuesta completa de gasto.
    id: int
    project_id: int
    created_at: datetime
    updated_at: datetime


class SimulationProjectBase(BaseModel):
    # DTO base para proyectos de simulacion.
    name: str
    budget: Decimal = 0
    subsidy_percent: Decimal = 0
    threshold_percent: Decimal = 50


class SimulationProjectCreate(SimulationProjectBase):
    pass


class SimulationProjectUpdate(BaseModel):
    name: Optional[str] = None
    budget: Optional[Decimal] = None
    subsidy_percent: Optional[Decimal] = None
    threshold_percent: Optional[Decimal] = None


class SimulationProjectRead(SimulationProjectBase):
    # Respuesta completa de proyecto con gastos embebidos.
    id: int
    tenant_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    expenses: list[SimulationExpenseRead] = []
