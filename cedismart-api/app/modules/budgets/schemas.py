"""Budgets module — Pydantic v2 request/response schemas."""

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional, Union

from pydantic import BaseModel, Field, field_validator, model_validator


# ---------------------------------------------------------------------------
# Nested reference schemas
# ---------------------------------------------------------------------------


class CategoryRef(BaseModel):
    id: uuid.UUID
    name: str
    icon: Optional[str]
    color: Optional[str]

    model_config = {"from_attributes": True}


class PeriodRef(BaseModel):
    year: int
    month: int


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------


class BudgetUpsertRequest(BaseModel):
    category_id: uuid.UUID
    amount: Decimal = Field(..., gt=Decimal("0"), decimal_places=2)
    year: Optional[int] = Field(None, ge=2000, le=2100)
    month: Optional[int] = Field(None, ge=1, le=12)
    alert_at_percent: int = Field(80, ge=1, le=100)

    @field_validator("amount")
    @classmethod
    def validate_amount(cls, v: Decimal) -> Decimal:
        if v > Decimal("999999999999.99"):
            raise ValueError("amount exceeds maximum allowed value")
        return v

    @model_validator(mode="after")
    def validate_year_month_together(self) -> "BudgetUpsertRequest":
        """year and month must both be provided or both omitted."""
        if (self.year is None) != (self.month is None):
            raise ValueError("year and month must both be provided or both omitted")
        return self


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------


class BudgetResponse(BaseModel):
    id: Union[uuid.UUID, str]
    category: CategoryRef
    budgeted_amount: Decimal
    spent_amount: Decimal
    remaining_amount: Decimal
    percentage_used: Decimal
    alert_at_percent: int
    is_over_budget: bool
    period: PeriodRef
    created_at: Union[datetime, str]

    model_config = {"from_attributes": True}
