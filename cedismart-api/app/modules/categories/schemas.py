"""Categories module — Pydantic v2 request/response schemas."""

import re
import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

CATEGORY_TYPES = {"income", "expense"}
HEX_COLOR_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------


class CategoryCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    category_type: str = Field(..., description="income | expense")
    icon: str | None = Field(None, max_length=50)
    color: str | None = Field(None, max_length=7)

    @field_validator("category_type")
    @classmethod
    def validate_category_type(cls, v: str) -> str:
        if v not in CATEGORY_TYPES:
            raise ValueError("category_type must be one of: income, expense")
        return v

    @field_validator("color")
    @classmethod
    def validate_color(cls, v: str | None) -> str | None:
        if v is not None and not HEX_COLOR_RE.match(v):
            raise ValueError("color must be a valid hex code, e.g. #FF6B35")
        return v

    @field_validator("icon")
    @classmethod
    def sanitize_icon(cls, v: str | None) -> str | None:
        """Accept icon name strings only — reject anything that looks like markup."""
        if v is not None and ("<" in v or ">" in v or "&" in v):
            raise ValueError("icon must be a plain icon name string")
        return v


class CategoryUpdateRequest(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    icon: str | None = Field(None, max_length=50)
    color: str | None = Field(None, max_length=7)

    @field_validator("color")
    @classmethod
    def validate_color(cls, v: str | None) -> str | None:
        if v is not None and not HEX_COLOR_RE.match(v):
            raise ValueError("color must be a valid hex code, e.g. #FF6B35")
        return v

    @field_validator("icon")
    @classmethod
    def sanitize_icon(cls, v: str | None) -> str | None:
        if v is not None and ("<" in v or ">" in v or "&" in v):
            raise ValueError("icon must be a plain icon name string")
        return v


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------


class CategoryResponse(BaseModel):
    id: uuid.UUID
    name: str
    category_type: str
    icon: str | None
    color: str | None
    is_system: bool
    sort_order: int
    created_at: datetime

    model_config = {"from_attributes": True}
