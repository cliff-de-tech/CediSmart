"""Users module — Pydantic v2 request/response schemas."""

import uuid
from datetime import datetime

from typing import Any
from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

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
    trial_started_at: datetime | None
    is_trial_active: bool
    trial_days_remaining: int
    has_premium_access: bool
    kyc_verified: bool
    ghana_card: str | None
    created_at: datetime

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def check_premium_access(cls, data: Any) -> Any:
        if hasattr(data, "has_premium_access"):
            return {
                "id": data.id,
                "phone": data.phone,
                "email": data.email,
                "full_name": data.full_name,
                "currency": data.currency,
                "is_premium": data.is_premium,
                "premium_expires_at": data.premium_expires_at,
                "trial_started_at": data.trial_started_at,
                "is_trial_active": data.is_trial_active,
                "trial_days_remaining": data.trial_days_remaining,
                "has_premium_access": data.has_premium_access,
                "kyc_verified": data.kyc_verified,
                "ghana_card": data.ghana_card,
                "created_at": data.created_at,
            }
        return data


class BugReportRequest(BaseModel):
    title: str = Field(..., min_length=3, max_length=100)
    description: str = Field(..., min_length=10, max_length=2000)
    device_info: dict[str, str] | None = None


class BugReportResponse(BaseModel):
    issue_number: int | None = None
    issue_url: str | None = None
    status: str
