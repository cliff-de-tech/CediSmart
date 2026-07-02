"""User model — the core identity model for CediSmart."""

import uuid
from datetime import datetime

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
    phone: Mapped[str] = mapped_column(String(20), unique=True, nullable=False, index=True)
    clerk_user_id: Mapped[str | None] = mapped_column(String(100), unique=True, nullable=True, index=True)
    email: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    full_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    pin_hash: Mapped[str] = mapped_column(String(60), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, server_default="GHS")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    is_premium: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    premium_expires_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True
    )
    trial_started_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True
    )
    kyc_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    ghana_card: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # --- Relationships ---
    accounts: Mapped[list["FinancialAccount"]] = relationship(
        "FinancialAccount", back_populates="user", lazy="selectin", cascade="all, delete-orphan", passive_deletes=True
    )
    transactions: Mapped[list["Transaction"]] = relationship(
        "Transaction", back_populates="user", lazy="noload", cascade="all, delete-orphan", passive_deletes=True
    )
    categories: Mapped[list["Category"]] = relationship(
        "Category", back_populates="user", lazy="noload", cascade="all, delete-orphan", passive_deletes=True
    )
    budgets: Mapped[list["Budget"]] = relationship(
        "Budget", back_populates="user", lazy="noload", cascade="all, delete-orphan", passive_deletes=True
    )

    @property
    def has_premium_access(self) -> bool:
        """Check if user has premium access (either paid or within active 7-day free trial)."""
        if self.is_premium:
            return True
        if self.trial_started_at:
            from datetime import timezone, timedelta
            start = self.trial_started_at
            if start.tzinfo is None:
                start = start.replace(tzinfo=timezone.utc)
            now = datetime.now(timezone.utc)
            return now - start < timedelta(days=7)
        return False

    @property
    def is_trial_active(self) -> bool:
        """Check if user has a trial currently running and active."""
        if self.is_premium:
            return False
        if self.trial_started_at:
            from datetime import timezone, timedelta
            start = self.trial_started_at
            if start.tzinfo is None:
                start = start.replace(tzinfo=timezone.utc)
            now = datetime.now(timezone.utc)
            return now - start < timedelta(days=7)
        return False

    @property
    def trial_days_remaining(self) -> int:
        """Get remaining days of trial."""
        if self.trial_started_at:
            from datetime import timezone
            start = self.trial_started_at
            if start.tzinfo is None:
                start = start.replace(tzinfo=timezone.utc)
            now = datetime.now(timezone.utc)
            diff = now - start
            return max(0, 7 - diff.days)
        return 0

    def __repr__(self) -> str:
        return f"<User id={self.id} phone={self.phone}>"


# Resolve forward references — these imports are for type-checking only.
# The actual models are defined in their respective modules.
from app.modules.accounts.models import FinancialAccount  # noqa: E402, F401
from app.modules.budgets.models import Budget  # noqa: E402, F401
from app.modules.categories.models import Category  # noqa: E402, F401
from app.modules.transactions.models import Transaction  # noqa: E402, F401
