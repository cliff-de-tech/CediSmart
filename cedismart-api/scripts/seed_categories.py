"""Seed system categories for CediSmart.

Idempotent: safe to run multiple times (INSERT ... ON CONFLICT DO NOTHING).
Uses the same async SQLAlchemy setup as the main application.

Run via:
    python -m scripts.seed_categories

Railway deploy hook:
    python -m scripts.seed_categories
"""

import asyncio
import logging

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session_factory

# All models must be imported before any query so SQLAlchemy can resolve
# relationship string references (e.g. "User" in Category.user).
from app.modules.auth.models import User  # noqa: F401
from app.modules.accounts.models import FinancialAccount  # noqa: F401
from app.modules.categories.models import Category
from app.modules.transactions.models import Transaction  # noqa: F401
from app.modules.budgets.models import Budget  # noqa: F401

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# System categories — Ghana-contextual defaults
# ---------------------------------------------------------------------------

EXPENSE_CATEGORIES: list[dict] = [
    {"name": "Food & Chop",       "icon": "fast-food-outline",           "color": "#FF6B35", "sort_order": 1},
    {"name": "Transport & Trotro","icon": "bus-outline",                 "color": "#4A90D9", "sort_order": 2},
    {"name": "Airtime & Data",    "icon": "phone-portrait-outline",      "color": "#7ED321", "sort_order": 3},
    {"name": "Rent & Housing",    "icon": "home-outline",                "color": "#9B59B6", "sort_order": 4},
    {"name": "Utilities",         "icon": "flash-outline",               "color": "#F39C12", "sort_order": 5},
    {"name": "Health & Pharmacy", "icon": "medical-outline",             "color": "#E74C3C", "sort_order": 6},
    {"name": "Clothing & Fashion","icon": "shirt-outline",               "color": "#1ABC9C", "sort_order": 7},
    {"name": "Education",         "icon": "school-outline",              "color": "#3498DB", "sort_order": 8},
    {"name": "Entertainment",     "icon": "game-controller-outline",     "color": "#E91E63", "sort_order": 9},
    {"name": "Groceries",         "icon": "basket-outline",              "color": "#8BC34A", "sort_order": 10},
    {"name": "Mobile Money Fees", "icon": "card-outline",                "color": "#FF9800", "sort_order": 11},
    {"name": "Church & Giving",   "icon": "heart-outline",               "color": "#E91E63", "sort_order": 12},
    {"name": "Family Support",    "icon": "people-outline",              "color": "#00BCD4", "sort_order": 13},
    {"name": "Savings",           "icon": "wallet-outline",              "color": "#4CAF50", "sort_order": 14},
    {"name": "Business Expense",  "icon": "briefcase-outline",           "color": "#607D8B", "sort_order": 15},
    {"name": "Other Expense",     "icon": "ellipsis-horizontal-outline", "color": "#9E9E9E", "sort_order": 16},
]

INCOME_CATEGORIES: list[dict] = [
    {"name": "Salary",               "icon": "cash-outline",            "color": "#4CAF50", "sort_order": 1},
    {"name": "Freelance",            "icon": "laptop-outline",          "color": "#2196F3", "sort_order": 2},
    {"name": "Business Income",      "icon": "trending-up-outline",     "color": "#FF9800", "sort_order": 3},
    {"name": "Mobile Money Received","icon": "phone-portrait-outline",  "color": "#9C27B0", "sort_order": 4},
    {"name": "Gift & Allowance",     "icon": "gift-outline",            "color": "#F44336", "sort_order": 5},
    {"name": "Investment Return",    "icon": "stats-chart-outline",     "color": "#009688", "sort_order": 6},
    {"name": "Other Income",         "icon": "add-circle-outline",      "color": "#9E9E9E", "sort_order": 7},
]


async def seed() -> None:
    """Insert all system categories. Skips any that already exist by name."""
    factory = get_session_factory()

    async with factory() as session:
        async with session.begin():
            inserted = 0
            skipped = 0

            for cat in EXPENSE_CATEGORIES:
                result = await _upsert_category(session, cat, "expense")
                if result:
                    inserted += 1
                else:
                    skipped += 1

            for cat in INCOME_CATEGORIES:
                result = await _upsert_category(session, cat, "income")
                if result:
                    inserted += 1
                else:
                    skipped += 1

            logger.info(
                "Seed complete: %d inserted, %d skipped (already existed).",
                inserted,
                skipped,
            )


async def _upsert_category(
    session: AsyncSession,
    cat: dict,
    category_type: str,
) -> bool:
    """Insert a system category if it doesn't already exist.

    Uses a SELECT-then-INSERT pattern instead of ON CONFLICT because
    PostgreSQL unique constraints treat NULL as distinct — meaning
    ON CONFLICT (user_id, name) never fires for system categories
    (user_id IS NULL). The explicit existence check handles this.

    Returns True if a new row was inserted, False if it already existed.
    """
    # Check if this system category already exists
    count_result = await session.execute(
        select(func.count(Category.id)).where(
            Category.is_system.is_(True),
            Category.name == cat["name"],
            Category.category_type == category_type,
        )
    )
    if count_result.scalar_one() > 0:
        return False

    new_cat = Category(
        user_id=None,
        name=cat["name"],
        icon=cat["icon"],
        color=cat["color"],
        category_type=category_type,
        is_system=True,
        sort_order=cat["sort_order"],
    )
    session.add(new_cat)
    await session.flush()
    return True


if __name__ == "__main__":
    asyncio.run(seed())
