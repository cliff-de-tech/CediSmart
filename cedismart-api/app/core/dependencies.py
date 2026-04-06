"""FastAPI dependency injection: database sessions and authenticated user."""

from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_token

# Re-export get_db for convenience
__all__ = ["get_db", "get_current_user", "DBSession", "CurrentUser"]

_bearer_scheme = HTTPBearer(auto_error=True)


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(_bearer_scheme)],
) -> UUID:
    """Extract and validate the current user's UUID from the JWT Bearer token.

    Returns the user_id as a UUID. Any endpoint using this dependency is
    guaranteed to have a valid, non-expired access token.

    Raises:
        HTTPException 401: If the token is missing, invalid, expired, or
            is not an access token.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail={
            "error": {
                "code": "INVALID_TOKEN",
                "message": "Invalid or expired token",
                "field": None,
            }
        },
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = decode_token(credentials.credentials)
    except JWTError as e:
        raise credentials_exception from e

    # Ensure this is an access token, not a refresh token
    token_type = payload.get("type")
    if token_type != "access":
        raise credentials_exception

    user_id_str = payload.get("sub")
    if user_id_str is None or not isinstance(user_id_str, str):
        raise credentials_exception

    try:
        user_id = UUID(user_id_str)
    except ValueError as e:
        raise credentials_exception from e

    return user_id


# Type aliases for cleaner endpoint signatures
DBSession = Annotated[AsyncSession, Depends(get_db)]
CurrentUser = Annotated[UUID, Depends(get_current_user)]
