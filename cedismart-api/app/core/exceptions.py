"""Custom exception classes and global exception handlers.

All API errors use a consistent JSON envelope:
{"error": {"code": "ERROR_CODE", "message": "...", "field": null}}
"""

import logging
from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Custom exception
# ---------------------------------------------------------------------------


class AppException(Exception):
    """Application-level exception with structured error response.

    Args:
        status_code: HTTP status code to return.
        error_code: Machine-readable error code (e.g. "ACCOUNT_LIMIT_REACHED").
        message: Human-readable error message.
        field: Optional field name if the error relates to a specific input field.
    """

    def __init__(
        self,
        status_code: int,
        error_code: str,
        message: str,
        field: str | None = None,
    ) -> None:
        self.status_code = status_code
        self.error_code = error_code
        self.message = message
        self.field = field
        super().__init__(message)


# ---------------------------------------------------------------------------
# Error response builder
# ---------------------------------------------------------------------------


def _error_response(
    status_code: int,
    error_code: str,
    message: str,
    field: str | None = None,
) -> JSONResponse:
    """Build a consistent JSON error response."""
    return JSONResponse(
        status_code=status_code,
        content={
            "error": {
                "code": error_code,
                "message": message,
                "field": field,
            }
        },
    )


# ---------------------------------------------------------------------------
# Exception handlers — registered on the FastAPI app
# ---------------------------------------------------------------------------


async def app_exception_handler(_request: Request, exc: AppException) -> JSONResponse:
    """Handle AppException with structured JSON response."""
    return _error_response(
        status_code=exc.status_code,
        error_code=exc.error_code,
        message=exc.message,
        field=exc.field,
    )


async def http_exception_handler(
    _request: Request, exc: StarletteHTTPException
) -> JSONResponse:
    """Handle Starlette/FastAPI HTTPException with consistent format."""
    detail: Any = exc.detail
    message = detail if isinstance(detail, str) else "An error occurred"

    # If detail is already our error dict, pass it through
    if isinstance(detail, dict) and "error" in detail:
        return JSONResponse(status_code=exc.status_code, content=detail)

    return _error_response(
        status_code=exc.status_code,
        error_code="HTTP_ERROR",
        message=message,
    )


async def validation_exception_handler(
    _request: Request, exc: RequestValidationError
) -> JSONResponse:
    """Handle Pydantic validation errors with field-level detail."""
    errors = exc.errors()
    if errors:
        first_error = errors[0]
        field_path = " → ".join(str(loc) for loc in first_error.get("loc", []))
        message = first_error.get("msg", "Validation error")
    else:
        field_path = None
        message = "Validation error"

    return _error_response(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        error_code="VALIDATION_ERROR",
        message=message,
        field=field_path,
    )


async def generic_exception_handler(_request: Request, exc: Exception) -> JSONResponse:
    """Catch-all handler for unhandled exceptions.

    Logs the full traceback but returns a generic message to the client
    to prevent leaking internal details.
    """
    logger.exception("Unhandled exception: %s", exc)
    return _error_response(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        error_code="INTERNAL_ERROR",
        message="An unexpected error occurred. Please try again later.",
    )


def register_exception_handlers(app: FastAPI) -> None:
    """Register all global exception handlers on the FastAPI application."""
    app.add_exception_handler(AppException, app_exception_handler)  # type: ignore[arg-type]
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)  # type: ignore[arg-type]
    app.add_exception_handler(RequestValidationError, validation_exception_handler)  # type: ignore[arg-type]
    app.add_exception_handler(Exception, generic_exception_handler)  # type: ignore[arg-type]
