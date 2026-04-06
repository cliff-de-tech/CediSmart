"""Auth module — Pydantic v2 request/response schemas with validators."""

import re

from pydantic import BaseModel, field_validator

# E.164 format for Ghana: +233 followed by 9 digits
_GHANA_PHONE_RE = re.compile(r"^\+233\d{9}$")


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------


class RegisterInitiateRequest(BaseModel):
    """Start registration by sending an OTP to the given phone number."""

    phone: str

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        v = v.strip()
        if not _GHANA_PHONE_RE.match(v):
            raise ValueError("Phone must be in E.164 format: +233XXXXXXXXX")
        return v


class RegisterVerifyRequest(BaseModel):
    """Complete registration by verifying OTP and setting a PIN."""

    phone: str
    otp: str
    pin: str
    full_name: str

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        v = v.strip()
        if not _GHANA_PHONE_RE.match(v):
            raise ValueError("Phone must be in E.164 format: +233XXXXXXXXX")
        return v

    @field_validator("otp")
    @classmethod
    def validate_otp(cls, v: str) -> str:
        v = v.strip()
        if not re.fullmatch(r"\d{6}", v):
            raise ValueError("OTP must be exactly 6 digits")
        return v

    @field_validator("pin")
    @classmethod
    def validate_pin(cls, v: str) -> str:
        v = v.strip()
        if not re.fullmatch(r"\d{6}", v):
            raise ValueError("PIN must be exactly 6 digits")
        if len(set(v)) == 1:
            raise ValueError("PIN must not be all the same digit")
        return v

    @field_validator("full_name")
    @classmethod
    def validate_full_name(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 2:
            raise ValueError("Full name must be at least 2 characters")
        if len(v) > 100:
            raise ValueError("Full name must be at most 100 characters")
        return v


class LoginRequest(BaseModel):
    """Authenticate with phone number and PIN."""

    phone: str
    pin: str

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        v = v.strip()
        if not _GHANA_PHONE_RE.match(v):
            raise ValueError("Phone must be in E.164 format: +233XXXXXXXXX")
        return v


class TokenRefreshRequest(BaseModel):
    """Request a new access token using a valid refresh token."""

    refresh_token: str


class PinResetInitiateRequest(BaseModel):
    """Start PIN reset by sending an OTP to the registered phone number."""

    phone: str

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        v = v.strip()
        if not _GHANA_PHONE_RE.match(v):
            raise ValueError("Phone must be in E.164 format: +233XXXXXXXXX")
        return v


class PinResetConfirmRequest(BaseModel):
    """Complete PIN reset by verifying OTP and setting a new PIN."""

    phone: str
    otp: str
    new_pin: str

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        v = v.strip()
        if not _GHANA_PHONE_RE.match(v):
            raise ValueError("Phone must be in E.164 format: +233XXXXXXXXX")
        return v

    @field_validator("otp")
    @classmethod
    def validate_otp(cls, v: str) -> str:
        v = v.strip()
        if not re.fullmatch(r"\d{6}", v):
            raise ValueError("OTP must be exactly 6 digits")
        return v

    @field_validator("new_pin")
    @classmethod
    def validate_new_pin(cls, v: str) -> str:
        v = v.strip()
        if not re.fullmatch(r"\d{6}", v):
            raise ValueError("PIN must be exactly 6 digits")
        if len(set(v)) == 1:
            raise ValueError("PIN must not be all the same digit")
        return v


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------


class TokenResponse(BaseModel):
    """Successful auth response containing JWT tokens."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class MessageResponse(BaseModel):
    """Generic success message, optionally with an expiry hint."""

    message: str
    expires_in: int | None = None
