"""User model — the core identity model for CediSmart."""

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import TIMESTAMP, Boolean, String, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin


class User(TimestampMixin, Base):
    """A registered CediSmart user.

    Identity is phone-first (Ghana market). Email is optional.
    PIN is stored as a bcrypt hash — never plaintext.
    """

    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    phone: Mapped[str] = mapped_column(
        String(20), unique=True, nullable=False, index=True
    )
    email: Mapped[Optional[str]] = mapped_column(
        String(255), unique=True, nullable=True
    )
    full_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    pin_hash: Mapped[str] = mapped_column(String(60), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, server_default="GHS")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    is_premium: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )
    premium_expires_at: Mapped[Optional[datetime]] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True
    )

    # --- Relationships ---
    accounts: Mapped[list["FinancialAccount"]] = relationship(
        "FinancialAccount", back_populates="user", lazy="selectin"
    )
    transactions: Mapped[list["Transaction"]] = relationship(
        "Transaction", back_populates="user", lazy="noload"
    )
    categories: Mapped[list["Category"]] = relationship(
        "Category", back_populates="user", lazy="noload"
    )
    budgets: Mapped[list["Budget"]] = relationship(
        "Budget", back_populates="user", lazy="noload"
    )

    def __repr__(self) -> str:
        return f"<User id={self.id} phone={self.phone}>"


# Resolve forward references — these imports are for type-checking only.
# The actual models are defined in their respective modules.
from app.modules.accounts.models import FinancialAccount  # noqa: E402, F401
from app.modules.budgets.models import Budget  # noqa: E402, F401
from app.modules.categories.models import Category  # noqa: E402, F401
from app.modules.transactions.models import Transaction  # noqa: E402, F401
