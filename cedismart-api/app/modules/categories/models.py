"""Category model — system and user-defined spending/income categories."""

import uuid
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, ForeignKey, Integer, String, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin

if TYPE_CHECKING:
    from app.modules.auth.models import User
    from app.modules.budgets.models import Budget
    from app.modules.transactions.models import Transaction


class Category(TimestampMixin, Base):
    """A transaction category (e.g. Food & Chop, Transport & Trotro).

    System categories have user_id = NULL and are visible to all users.
    User-created categories belong to a specific user.
    """

    __tablename__ = "categories"
    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_categories_user_name"),)

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=True
    )  # NULL = system category
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    icon: Mapped[str | None] = mapped_column(String(50), nullable=True)
    color: Mapped[str | None] = mapped_column(String(7), nullable=True)  # Hex: #FF6B35
    category_type: Mapped[str] = mapped_column(String(10), nullable=False)  # 'income' | 'expense'
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))

    # --- Relationships ---
    user: Mapped[Optional["User"]] = relationship("User", back_populates="categories")
    transactions: Mapped[list["Transaction"]] = relationship(
        "Transaction", back_populates="category", lazy="noload"
    )
    budgets: Mapped[list["Budget"]] = relationship(
        "Budget", back_populates="category", lazy="noload"
    )

    def __repr__(self) -> str:
        return f"<Category id={self.id} name={self.name} type={self.category_type}>"
