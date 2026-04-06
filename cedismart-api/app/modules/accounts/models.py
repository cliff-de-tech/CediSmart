"""FinancialAccount model — bank, mobile money, and cash accounts."""

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, Index, Numeric, String, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin

if TYPE_CHECKING:
    from app.modules.auth.models import User
    from app.modules.transactions.models import Transaction


class FinancialAccount(TimestampMixin, Base):
    """A user's financial account (bank, mobile money, or cash).

    Balance is NEVER stored — always computed from:
    opening_balance + SUM(income) - SUM(expense)
    """

    __tablename__ = "financial_accounts"
    __table_args__ = (Index("idx_financial_accounts_user_active", "user_id", "is_active"),)

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    account_type: Mapped[str] = mapped_column(
        String(20), nullable=False
    )  # 'bank' | 'mobile_money' | 'cash'
    provider: Mapped[str | None] = mapped_column(String(50), nullable=True)
    opening_balance: Mapped[float] = mapped_column(
        Numeric(14, 2), nullable=False, server_default=text("0")
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))

    # --- Relationships ---
    user: Mapped["User"] = relationship("User", back_populates="accounts")
    transactions: Mapped[list["Transaction"]] = relationship(
        "Transaction", back_populates="account", lazy="noload"
    )

    def __repr__(self) -> str:
        return f"<FinancialAccount id={self.id} name={self.name} type={self.account_type}>"
