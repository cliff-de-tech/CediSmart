"""Categories module — business logic.

Business rules enforced here:
- System categories (user_id IS NULL) are read-only — no user can modify or delete them.
- Users can create up to 20 custom categories on the free tier.
- Custom category names must not conflict with system category names (case-insensitive).
- category_type (income|expense) is immutable after creation.
- A category with active transactions cannot be deleted (409).
- All queries expose only system categories + the authenticated user's own categories.
"""

import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppException
from app.modules.categories.models import Category
from app.modules.categories.schemas import CategoryCreateRequest, CategoryUpdateRequest
from app.modules.transactions.models import Transaction

FREE_TIER_CATEGORY_LIMIT = 20


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


async def _get_user_category_or_404(
    category_id: uuid.UUID,
    user_id: uuid.UUID,
    db: AsyncSession,
) -> Category:
    """Return a user-owned (non-system) category, or raise 404.

    Returns 404 for missing, unowned, AND system categories — preventing
    enumeration and blocking system category mutation in one check.
    """
    result = await db.execute(
        select(Category).where(
            Category.id == category_id,
            Category.user_id == user_id,
            Category.is_system.is_(False),
        )
    )
    category = result.scalar_one_or_none()
    if category is None:
        raise AppException(
            status_code=404,
            error_code="CATEGORY_NOT_FOUND",
            message="Category not found",
        )
    return category


async def _system_name_conflict(name: str, db: AsyncSession) -> bool:
    """Return True if a system category with the same name exists (case-insensitive)."""
    result = await db.execute(
        select(func.count(Category.id)).where(
            Category.is_system.is_(True),
            func.lower(Category.name) == name.lower(),
        )
    )
    return result.scalar_one() > 0


# ---------------------------------------------------------------------------
# Service functions
# ---------------------------------------------------------------------------


async def list_categories(
    user_id: uuid.UUID,
    db: AsyncSession,
    category_type: str | None = None,
) -> list[Category]:
    """Return system categories + user's custom categories.

    Order: system categories first (by sort_order), then user categories (by name).

    Args:
        user_id: The authenticated user's UUID.
        db: Async database session.
        category_type: Optional filter — 'income', 'expense', or None for all.
    """
    stmt = (
        select(Category)
        .where(
            or_(
                Category.is_system.is_(True),
                Category.user_id == user_id,
            )
        )
        .order_by(
            Category.is_system.desc(),  # system first
            Category.sort_order.asc(),
            Category.name.asc(),
        )
    )

    if category_type is not None:
        stmt = stmt.where(Category.category_type == category_type)

    result = await db.execute(stmt)
    return list(result.scalars().all())


async def create_category(
    user_id: uuid.UUID,
    payload: CategoryCreateRequest,
    is_premium: bool,
    db: AsyncSession,
) -> Category:
    """Create a custom category for the authenticated user.

    Enforces:
    - Free tier limit of 20 custom categories.
    - Name must not conflict with any system category (case-insensitive).
    - Name must be unique within the user's own categories (DB constraint).
    """
    if not is_premium:
        # Lock existing rows to prevent race condition on limit check
        await db.execute(
            select(Category.id)
            .where(
                Category.user_id == user_id,
                Category.is_system.is_(False),
            )
            .with_for_update()
        )
        count_result = await db.execute(
            select(func.count(Category.id)).where(
                Category.user_id == user_id,
                Category.is_system.is_(False),
            )
        )
        custom_count = count_result.scalar_one()
        if custom_count >= FREE_TIER_CATEGORY_LIMIT:
            raise AppException(
                status_code=403,
                error_code="CATEGORY_LIMIT_REACHED",
                message=(
                    f"Free tier allows up to {FREE_TIER_CATEGORY_LIMIT} custom categories. "
                    "Upgrade to CediSmart Pro for unlimited categories."
                ),
            )

    if await _system_name_conflict(payload.name, db):
        raise AppException(
            status_code=409,
            error_code="CATEGORY_NAME_CONFLICT",
            message=(
                f"'{payload.name}' conflicts with a system category name. "
                "Please choose a different name."
            ),
            field="name",
        )

    category = Category(
        user_id=user_id,
        name=payload.name,
        category_type=payload.category_type,
        icon=payload.icon,
        color=payload.color,
        is_system=False,
    )
    db.add(category)

    try:
        await db.flush()
    except IntegrityError as e:
        # The DB unique constraint (user_id, name) will fire if the name
        # duplicates an existing user category. Surface a clean 409.
        raise AppException(
            status_code=409,
            error_code="CATEGORY_NAME_DUPLICATE",
            message=f"You already have a category named '{payload.name}'.",
            field="name",
        ) from e

    return category


async def update_category(
    category_id: uuid.UUID,
    user_id: uuid.UUID,
    payload: CategoryUpdateRequest,
    db: AsyncSession,
) -> Category:
    """Update mutable fields on a user-owned category (name, icon, color).

    category_type is immutable after creation — excluded from the request schema.
    System categories cannot be updated (returns 404).
    """
    category = await _get_user_category_or_404(category_id, user_id, db)

    if payload.name is not None:
        if await _system_name_conflict(payload.name, db):
            raise AppException(
                status_code=409,
                error_code="CATEGORY_NAME_CONFLICT",
                message=(f"'{payload.name}' conflicts with a system category name."),
                field="name",
            )
        category.name = payload.name

    if payload.icon is not None:
        category.icon = payload.icon
    if payload.color is not None:
        category.color = payload.color

    try:
        await db.flush()
    except IntegrityError as e:
        raise AppException(
            status_code=409,
            error_code="CATEGORY_NAME_DUPLICATE",
            message=f"You already have a category named '{payload.name}'.",
            field="name",
        ) from e

    return category


async def delete_category(
    category_id: uuid.UUID,
    user_id: uuid.UUID,
    db: AsyncSession,
) -> None:
    """Hard-delete a user-owned category.

    Blocked with 409 if any non-deleted transactions reference this category.
    System categories cannot be deleted (returns 404).
    """
    category = await _get_user_category_or_404(category_id, user_id, db)

    tx_count_result = await db.execute(
        select(func.count(Transaction.id)).where(
            Transaction.category_id == category_id,
            Transaction.is_deleted.is_(False),
        )
    )
    tx_count = tx_count_result.scalar_one()

    if tx_count > 0:
        raise AppException(
            status_code=409,
            error_code="CATEGORY_HAS_TRANSACTIONS",
            message=(
                f"This category has {tx_count} transaction(s). " "Reassign them before deleting."
            ),
        )

    await db.delete(category)
    await db.flush()
