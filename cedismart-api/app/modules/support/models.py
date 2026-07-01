"""SupportTicket model — stores AI support chat tickets and diagnostic logs."""

import uuid
from sqlalchemy import Boolean, Index, String, JSON, text
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base, TimestampMixin

class SupportTicket(TimestampMixin, Base):
    """Stores support tickets created by users during AI support escalation,
    including full chat history transcripts and device diagnostics.
    """

    __tablename__ = "support_tickets"
    __table_args__ = (
        Index("idx_support_tickets_phone", "phone"),
        Index("idx_support_tickets_resolved", "is_resolved"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    phone: Mapped[str] = mapped_column(String(30), nullable=False, server_default=text("'Anonymous'"))
    user_query: Mapped[str] = mapped_column(String, nullable=False)
    chat_history: Mapped[list | None] = mapped_column(JSON, nullable=True)
    device_diagnostics: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    is_resolved: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))

    def __repr__(self) -> str:
        return f"<SupportTicket id={self.id} phone={self.phone} resolved={self.is_resolved}>"
