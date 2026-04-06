"""Accounts module — Pydantic v2 request/response schemas."""

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field, field_validator


# ---------------------------------------------------------------------------
# Enums (string literals — avoids importing enum for simple cases)
# ---------------------------------------------------------------------------

ACCOUNT_TYPES = {"bank", "mobile_money", "cash"}


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------


class AccountCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    account_type: str = Field(..., description="bank | mobile_money | cash")
    provider: Optional[str] = Field(None, max_length=50)
    opening_balance: Decimal = Field(Decimal("0.00"), ge=Decimal("0"))

    @field_validator("account_type")
    @classmethod
    def validate_account_type(cls, v: str) -> str:
        if v not in ACCOUNT_TYPES:
            raise ValueError("account_type must be one of: bank, mobile_money, cash")
        return v

    @field_validator("opening_balance")
    @classmethod
    def validate_opening_balance(cls, v: Decimal) -> Decimal:
        if v > Decimal("999999999999.99"):
            raise ValueError("opening_balance exceeds maximum allowed value")
        return v


class AccountUpdateRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    provider: Optional[str] = Field(None, max_length=50)


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------


class AccountResponse(BaseModel):
    id: uuid.UUID
    name: str
    account_type: str
    provider: Optional[str]
    opening_balance: Decimal
    balance: Decimal
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class AccountDeactivatedResponse(BaseModel):
    message: str
