"""Users module — Pydantic v2 request/response schemas."""

import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator

SUPPORTED_CURRENCIES = {"GHS", "USD", "EUR", "GBP"}


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------


class UserUpdateRequest(BaseModel):
    full_name: str | None = Field(None, min_length=1, max_length=100)
    email: EmailStr | None = None
    currency: str | None = Field(None, min_length=3, max_length=3)
    is_premium: bool | None = None

    @field_validator("currency")
    @classmethod
    def validate_currency(cls, v: str | None) -> str | None:
        if v is not None and v.upper() not in SUPPORTED_CURRENCIES:
            raise ValueError(f"currency must be one of: {', '.join(sorted(SUPPORTED_CURRENCIES))}")
        return v.upper() if v else v


class KYCVerifyRequest(BaseModel):
    ghana_card_number: str = Field(..., pattern=r"^GHA-\d{9}-\d$")
    full_name: str = Field(..., min_length=1, max_length=100)
    dob: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")  # YYYY-MM-DD


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------


class UserResponse(BaseModel):
    id: uuid.UUID
    phone: str
    email: str | None
    full_name: str | None
    currency: str
    is_premium: bool
    premium_expires_at: datetime | None
    kyc_verified: bool
    ghana_card: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class BugReportRequest(BaseModel):
    title: str = Field(..., min_length=3, max_length=100)
    description: str = Field(..., min_length=10, max_length=2000)
    device_info: dict[str, str] | None = None


class BugReportResponse(BaseModel):
    issue_number: int | None = None
    issue_url: str | None = None
    status: str
