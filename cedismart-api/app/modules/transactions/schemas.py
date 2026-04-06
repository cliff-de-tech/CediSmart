"""Transactions module — Pydantic v2 request/response schemas."""

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field, field_validator

TRANSACTION_TYPES = {"income", "expense", "transfer"}


# ---------------------------------------------------------------------------
# Nested reference schemas (avoid N+1 on frontend)
# ---------------------------------------------------------------------------


class AccountRef(BaseModel):
    id: uuid.UUID
    name: str

    model_config = {"from_attributes": True}


class CategoryRef(BaseModel):
    id: uuid.UUID
    name: str
    icon: Optional[str]
    color: Optional[str]

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------


class TransactionCreateRequest(BaseModel):
    account_id: uuid.UUID
    category_id: uuid.UUID
    amount: Decimal = Field(..., gt=Decimal("0"), decimal_places=2)
    transaction_type: str
    description: Optional[str] = Field(None, max_length=255)
    transaction_date: date
    notes: Optional[str] = None
    client_id: Optional[uuid.UUID] = None

    @field_validator("transaction_type")
    @classmethod
    def validate_transaction_type(cls, v: str) -> str:
        if v not in TRANSACTION_TYPES:
            raise ValueError("transaction_type must be one of: income, expense, transfer")
        return v

    @field_validator("amount")
    @classmethod
    def validate_amount(cls, v: Decimal) -> Decimal:
        if v > Decimal("999999999999.99"):
            raise ValueError("amount exceeds maximum allowed value")
        return v


class TransactionUpdateRequest(BaseModel):
    """Partial update — only fields provided are changed.

    account_id is intentionally excluded — cannot be changed after creation.
    """

    category_id: Optional[uuid.UUID] = None
    amount: Optional[Decimal] = Field(None, gt=Decimal("0"), decimal_places=2)
    transaction_type: Optional[str] = None
    description: Optional[str] = Field(None, max_length=255)
    transaction_date: Optional[date] = None
    notes: Optional[str] = None

    @field_validator("transaction_type")
    @classmethod
    def validate_transaction_type(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in TRANSACTION_TYPES:
            raise ValueError("transaction_type must be one of: income, expense, transfer")
        return v


class BulkTransactionItem(BaseModel):
    """Single item within a bulk create request."""

    account_id: uuid.UUID
    category_id: uuid.UUID
    amount: Decimal = Field(..., gt=Decimal("0"), decimal_places=2)
    transaction_type: str
    description: Optional[str] = Field(None, max_length=255)
    transaction_date: date
    notes: Optional[str] = None
    client_id: uuid.UUID  # Required for bulk — deduplication depends on it

    @field_validator("transaction_type")
    @classmethod
    def validate_transaction_type(cls, v: str) -> str:
        if v not in TRANSACTION_TYPES:
            raise ValueError("transaction_type must be one of: income, expense, transfer")
        return v


class BulkCreateRequest(BaseModel):
    transactions: list[BulkTransactionItem] = Field(
        ..., min_length=1, max_length=100
    )


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------


class TransactionResponse(BaseModel):
    id: uuid.UUID
    account: AccountRef
    category: CategoryRef
    amount: Decimal
    transaction_type: str
    description: Optional[str]
    transaction_date: date
    notes: Optional[str]
    client_id: Optional[uuid.UUID]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PaginationMeta(BaseModel):
    page: int
    per_page: int
    total: int


class TransactionListResponse(BaseModel):
    data: list[TransactionResponse]
    pagination: PaginationMeta


class BulkErrorItem(BaseModel):
    client_id: uuid.UUID
    reason: str


class BulkCreateResponse(BaseModel):
    created: int
    skipped: int
    errors: list[BulkErrorItem]


class MonthSummary(BaseModel):
    income: str   # Decimal serialised as string — preserves precision in JSON
    expense: str
    net: str


class MonthComparison(BaseModel):
    income_change_pct: Optional[float]   # None when last month had zero income
    expense_change_pct: Optional[float]  # None when last month had zero expense


class TransactionSummaryResponse(BaseModel):
    current_month: MonthSummary
    current_month_vs_last: MonthComparison
