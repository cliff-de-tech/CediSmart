"""CediSmart API — Application entry point.

Configures middleware, exception handlers, routers, and lifecycle hooks.
"""

import logging
import uuid
from contextlib import asynccontextmanager
from collections.abc import AsyncGenerator

from fastapi import FastAPI, Request, Response
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.exceptions import register_exception_handlers
from app.core.redis import close_redis, init_redis

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Application lifespan — startup / shutdown
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncGenerator[None, None]:
    """Manage application lifecycle: startup and shutdown hooks."""
    # Startup
    logger.info("Starting CediSmart API [env=%s]", settings.ENVIRONMENT)
    await init_redis()
    logger.info("Redis connected.")
    yield
    # Shutdown
    await close_redis()
    logger.info("Redis disconnected. Shutting down.")


# ---------------------------------------------------------------------------
# Application factory
# ---------------------------------------------------------------------------


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(
        title="CediSmart API",
        description="Production-grade fintech budget management API for Ghana",
        version="0.1.0",
        docs_url="/docs" if settings.DEBUG else None,
        redoc_url="/redoc" if settings.DEBUG else None,
        lifespan=lifespan,
    )

    # -- Exception handlers --
    register_exception_handlers(app)
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)  # type: ignore[arg-type]

    # -- Middleware --
    _add_middleware(app)

    # -- Routers --
    _include_routers(app)

    # -- Attach slowapi limiter to app state (required for rate limiting) --
    from app.modules.auth.router import limiter
    app.state.limiter = limiter

    # -- Health check --
    @app.get("/health", tags=["Health"])
    async def health_check() -> dict[str, str]:
        return {"status": "healthy"}

    return app


# ---------------------------------------------------------------------------
# Middleware
# ---------------------------------------------------------------------------


def _add_middleware(app: FastAPI) -> None:
    """Register all middleware on the application."""

    # CORS — configurable origins, never wildcard in production
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins_list,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["*"],
    )

    # Request ID — attach a unique ID to every request for tracing
    @app.middleware("http")
    async def request_id_middleware(request: Request, call_next: object) -> Response:
        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
        response: Response = await call_next(request)  # type: ignore[misc]
        response.headers["X-Request-ID"] = request_id
        return response

    # Security headers
    @app.middleware("http")
    async def security_headers_middleware(request: Request, call_next: object) -> Response:
        response: Response = await call_next(request)  # type: ignore[misc]
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response


# ---------------------------------------------------------------------------
# Router registration
# ---------------------------------------------------------------------------


def _include_routers(app: FastAPI) -> None:
    """Include all module routers under /api/v1/."""
    from app.modules.auth.router import router as auth_router
    app.include_router(auth_router, prefix="/api/v1/auth", tags=["Auth"])

    from app.modules.users.router import router as users_router
    app.include_router(users_router, prefix="/api/v1/users", tags=["Users"])

    from app.modules.accounts.router import router as accounts_router
    app.include_router(accounts_router, prefix="/api/v1/accounts", tags=["Accounts"])

    from app.modules.categories.router import router as categories_router
    app.include_router(categories_router, prefix="/api/v1/categories", tags=["Categories"])

    from app.modules.transactions.router import router as transactions_router
    app.include_router(transactions_router, prefix="/api/v1/transactions", tags=["Transactions"])

    from app.modules.budgets.router import router as budgets_router
    app.include_router(budgets_router, prefix="/api/v1/budgets", tags=["Budgets"])

    from app.modules.reports.router import router as reports_router
    app.include_router(reports_router, prefix="/api/v1/reports", tags=["Reports"])



# ---------------------------------------------------------------------------
# Module-level app instance (used by uvicorn)
# ---------------------------------------------------------------------------

app = create_app()
