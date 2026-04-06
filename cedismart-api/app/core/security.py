"""PIN hashing (bcrypt) and JWT token creation/verification (RS256)."""

from datetime import datetime, timedelta, timezone
from uuid import UUID

import bcrypt
from jose import JWTError, jwt

from app.core.config import settings


# ---------------------------------------------------------------------------
# PIN hashing — bcrypt, cost factor 12
# ---------------------------------------------------------------------------


def hash_pin(pin: str) -> str:
    """Hash a user PIN using bcrypt with cost factor 12.

    Args:
        pin: The plaintext 6-digit PIN.

    Returns:
        The bcrypt hash as a UTF-8 string.
    """
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(pin.encode("utf-8"), salt).decode("utf-8")


def verify_pin(plain_pin: str, hashed_pin: str) -> bool:
    """Verify a plaintext PIN against its bcrypt hash.

    Args:
        plain_pin: The user-provided plaintext PIN.
        hashed_pin: The stored bcrypt hash.

    Returns:
        True if the PIN matches, False otherwise.
    """
    return bcrypt.checkpw(plain_pin.encode("utf-8"), hashed_pin.encode("utf-8"))


# ---------------------------------------------------------------------------
# JWT tokens — RS256 (asymmetric)
# ---------------------------------------------------------------------------


def _load_private_key() -> str:
    """Load the RSA private key from settings.

    The key is stored as a PEM string with literal \\n replaced by real newlines.
    """
    return settings.RSA_PRIVATE_KEY.replace("\\n", "\n")


def _load_public_key() -> str:
    """Load the RSA public key from settings."""
    return settings.RSA_PUBLIC_KEY.replace("\\n", "\n")


def create_access_token(user_id: UUID, expires_delta: timedelta | None = None) -> str:
    """Create a short-lived JWT access token.

    Args:
        user_id: The authenticated user's UUID.
        expires_delta: Optional custom expiry. Defaults to ACCESS_TOKEN_EXPIRE_MINUTES.

    Returns:
        Encoded JWT string.
    """
    if expires_delta is None:
        expires_delta = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "type": "access",
        "iat": now,
        "exp": now + expires_delta,
    }
    return jwt.encode(payload, _load_private_key(), algorithm=settings.ALGORITHM)


def create_refresh_token(
    user_id: UUID,
    expires_delta: timedelta | None = None,
    jti: str | None = None,
) -> str:
    """Create a long-lived JWT refresh token.

    Args:
        user_id: The authenticated user's UUID.
        expires_delta: Optional custom expiry. Defaults to REFRESH_TOKEN_EXPIRE_DAYS.
        jti: Optional JWT ID for per-token revocation tracking in Redis.

    Returns:
        Encoded JWT string.
    """
    if expires_delta is None:
        expires_delta = timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)

    now = datetime.now(timezone.utc)
    payload: dict[str, object] = {
        "sub": str(user_id),
        "type": "refresh",
        "iat": now,
        "exp": now + expires_delta,
    }
    if jti is not None:
        payload["jti"] = jti
    return jwt.encode(payload, _load_private_key(), algorithm=settings.ALGORITHM)


def decode_token(token: str) -> dict[str, object]:
    """Decode and validate a JWT token using the public key.

    Args:
        token: The encoded JWT string.

    Returns:
        The decoded payload dictionary.

    Raises:
        JWTError: If the token is invalid, expired, or tampered with.
    """
    try:
        payload: dict[str, object] = jwt.decode(
            token,
            _load_public_key(),
            algorithms=[settings.ALGORITHM],
        )
        return payload
    except JWTError:
        raise
