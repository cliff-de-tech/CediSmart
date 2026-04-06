"""Reports module — Pydantic v2 response schemas.

All amounts are returned as strings to preserve decimal precision in JSON.
Reports are read-only — no request schemas with write semantics.
"""

import uuid
from typing import Optional

from pydantic import BaseModel


# ---------------------------------------------------------------------------
# GET /reports/monthly
# ---------------------------------------------------------------------------


class TopCategoryItem(BaseModel):
    id: uuid.UUID
    name: str
    amount: str  # Decimal as string


class MonthlyReportResponse(BaseModel):
    period: str  # "2026-04"
    total_income: str
    total_expense: str
    net: str
    transaction_count: int
    top_expense_category: Optional[TopCategoryItem]
    days_with_activity: int


# ---------------------------------------------------------------------------
# GET /reports/categories
# ---------------------------------------------------------------------------


class CategoryBreakdownItem(BaseModel):
    id: uuid.UUID
    name: str
    color: Optional[str]
    icon: Optional[str]
    amount: str
    percentage: str
    transaction_count: int


class PeriodRange(BaseModel):
    start: str  # ISO date
    end: str


class CategoryReportResponse(BaseModel):
    period: PeriodRange
    total: str
    categories: list[CategoryBreakdownItem]


# ---------------------------------------------------------------------------
# GET /reports/trends
# ---------------------------------------------------------------------------


class TrendMonthItem(BaseModel):
    year: int
    month: int
    income: str
    expense: str
    net: str


class TrendsReportResponse(BaseModel):
    months: list[TrendMonthItem]
