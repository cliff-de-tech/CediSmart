"""Budget model — monthly spending targets per category."""

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    Index,
    Numeric,
    SmallInteger,
    ForeignKey,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin

if TYPE_CHECKING:
    from app.modules.auth.models import User
    from app.modules.categories.models import Category


class Budget(TimestampMixin, Base):
    """A monthly spending budget for a specific expense category.

    - One budget per (user, category, year, month). Enforced by unique constraint.
    - budget progress (spent amount) is NEVER stored — always computed from transactions.
    - alert_at_percent triggers in-app warnings when usage approaches the limit.
    """

    __tablename__ = "budgets"
    __table_args__ = (
        CheckConstraint(
            "budget_month BETWEEN 1 AND 12",
            name="ck_budgets_month_range",
        ),
        CheckConstraint("amount > 0", name="ck_budgets_amount_positive"),
        UniqueConstraint(
            "user_id",
            "category_id",
            "budget_year",
            "budget_month",
            name="uq_budgets_user_category_period",
        ),
        Index(
            "idx_budgets_user_period",
            "user_id",
            "budget_year",
            "budget_month",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    category_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("categories.id"), nullable=False
    )
    amount: Mapped[float] = mapped_column(
        Numeric(14, 2), nullable=False
    )  # Budget limit for the month
    budget_year: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    budget_month: Mapped[int] = mapped_column(
        SmallInteger, nullable=False
    )  # 1–12, enforced by CHECK
    alert_at_percent: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, server_default=text("80")
    )

    # --- Relationships ---
    user: Mapped["User"] = relationship("User", back_populates="budgets")
    category: Mapped["Category"] = relationship("Category", back_populates="budgets")

    def __repr__(self) -> str:
        return (
            f"<Budget id={self.id} category_id={self.category_id} "
            f"amount={self.amount} period={self.budget_year}-{self.budget_month:02d}>"
        )
