"""Users module — Pydantic v2 request/response schemas."""

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field, field_validator

SUPPORTED_CURRENCIES = {"GHS", "USD", "EUR", "GBP"}


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------


class UserUpdateRequest(BaseModel):
    full_name: Optional[str] = Field(None, min_length=1, max_length=100)
    email: Optional[EmailStr] = None
    currency: Optional[str] = Field(None, min_length=3, max_length=3)

    @field_validator("currency")
    @classmethod
    def validate_currency(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v.upper() not in SUPPORTED_CURRENCIES:
            raise ValueError(
                f"currency must be one of: {', '.join(sorted(SUPPORTED_CURRENCIES))}"
            )
        return v.upper() if v else v


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------


class UserResponse(BaseModel):
    id: uuid.UUID
    phone: str
    email: Optional[str]
    full_name: Optional[str]
    currency: str
    is_premium: bool
    premium_expires_at: Optional[datetime]
    created_at: datetime

    model_config = {"from_attributes": True}
