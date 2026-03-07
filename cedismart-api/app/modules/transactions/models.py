"""Transaction model — the core financial data record."""

import uuid
from datetime import date
from typing import TYPE_CHECKING, Optional

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    Index,
    Numeric,
    String,
    Text,
    ForeignKey,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin

if TYPE_CHECKING:
    from app.modules.accounts.models import FinancialAccount
    from app.modules.auth.models import User
    from app.modules.categories.models import Category


class Transaction(TimestampMixin, Base):
    """A single financial transaction (income, expense, or transfer).

    Key invariants:
    - amount is ALWAYS positive; transaction_type carries direction
    - Soft delete only (is_deleted=True) — never hard-delete financial records
    - client_id enables offline sync deduplication
    - transaction_date is user-provided (may differ from created_at)
    """

    __tablename__ = "transactions"
    __table_args__ = (
        CheckConstraint("amount > 0", name="ck_transactions_amount_positive"),
        UniqueConstraint(
            "user_id",
            "client_id",
            name="uq_transactions_user_client_id",
        ),
        Index(
            "idx_transactions_user_date",
            "user_id",
            text("transaction_date DESC"),
        ),
        Index("idx_transactions_user_category", "user_id", "category_id"),
        Index("idx_transactions_account", "account_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    account_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("financial_accounts.id"), nullable=False
    )
    category_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("categories.id"), nullable=False
    )
    amount: Mapped[float] = mapped_column(
        Numeric(14, 2), nullable=False
    )  # ALWAYS positive; direction from transaction_type
    transaction_type: Mapped[str] = mapped_column(
        String(10), nullable=False
    )  # 'income' | 'expense' | 'transfer'
    description: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    transaction_date: Mapped[date] = mapped_column(
        Date, nullable=False
    )  # User-provided, NOT created_at
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_deleted: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )
    client_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        nullable=True
    )  # For offline sync deduplication

    # --- Relationships ---
    user: Mapped["User"] = relationship("User", back_populates="transactions")
    account: Mapped["FinancialAccount"] = relationship(
        "FinancialAccount", back_populates="transactions"
    )
    category: Mapped["Category"] = relationship(
        "Category", back_populates="transactions"
    )

    def __repr__(self) -> str:
        return (
            f"<Transaction id={self.id} type={self.transaction_type} "
            f"amount={self.amount} date={self.transaction_date}>"
        )
