"""Categories module — API router.

All endpoints live under ``/api/v1/categories`` (prefix set in ``main.py``).
Every endpoint requires a valid JWT access token via the CurrentUser dependency.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import CurrentUser
from app.core.exceptions import AppException
from app.modules.auth.models import User
from app.modules.categories import service
from app.modules.categories.schemas import (
    CategoryCreateRequest,
    CategoryResponse,
    CategoryUpdateRequest,
)

router = APIRouter()

DBSession = Annotated[AsyncSession, Depends(get_db)]


async def _get_user(user_id: uuid.UUID, db: AsyncSession) -> User:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise AppException(
            status_code=401,
            error_code="USER_NOT_FOUND",
            message="Authenticated user not found",
        )
    return user


# ---------------------------------------------------------------------------
# GET /
# ---------------------------------------------------------------------------


@router.get(
    "/",
    response_model=list[CategoryResponse],
    status_code=200,
    summary="List system and user categories",
)
async def list_categories(
    user_id: CurrentUser,
    db: DBSession,
    type: str | None = Query(
        None,
        description="Filter by category type: income | expense",
        pattern="^(income|expense)$",
    ),
) -> list[CategoryResponse]:
    """Return all system categories and the user's custom categories.

    System categories appear first (ordered by sort_order), followed by
    user categories ordered by name.
    """
    categories = await service.list_categories(
        user_id=user_id,
        db=db,
        category_type=type,
    )
    return [CategoryResponse.model_validate(c) for c in categories]


# ---------------------------------------------------------------------------
# POST /
# ---------------------------------------------------------------------------


@router.post(
    "/",
    response_model=CategoryResponse,
    status_code=201,
    summary="Create a custom category",
)
async def create_category(
    body: CategoryCreateRequest,
    user_id: CurrentUser,
    db: DBSession,
) -> CategoryResponse:
    """Create a custom income or expense category.

    Free tier limited to 20 custom categories.
    ``category_type`` cannot be changed after creation.
    Category name must not conflict with any system category.
    """
    user = await _get_user(user_id, db)
    category = await service.create_category(
        user_id=user_id,
        payload=body,
        is_premium=user.is_premium,
        db=db,
    )
    return CategoryResponse.model_validate(category)


# ---------------------------------------------------------------------------
# PATCH /{id}
# ---------------------------------------------------------------------------


@router.patch(
    "/{category_id}",
    response_model=CategoryResponse,
    status_code=200,
    summary="Update a custom category",
)
async def update_category(
    category_id: uuid.UUID,
    body: CategoryUpdateRequest,
    user_id: CurrentUser,
    db: DBSession,
) -> CategoryResponse:
    """Update mutable fields on a user-owned category (name, icon, color).

    Returns 404 for system categories and categories owned by other users.
    ``category_type`` is intentionally excluded — immutable after creation.
    """
    category = await service.update_category(
        category_id=category_id,
        user_id=user_id,
        payload=body,
        db=db,
    )
    return CategoryResponse.model_validate(category)


# ---------------------------------------------------------------------------
# DELETE /{id}
# ---------------------------------------------------------------------------


@router.delete(
    "/{category_id}",
    status_code=204,
    summary="Delete a custom category",
)
async def delete_category(
    category_id: uuid.UUID,
    user_id: CurrentUser,
    db: DBSession,
) -> None:
    """Delete a user-owned category.

    Blocked with 409 if the category has active transactions attached.
    Returns 404 for system categories and categories owned by other users.
    """
    await service.delete_category(
        category_id=category_id,
        user_id=user_id,
        db=db,
    )
