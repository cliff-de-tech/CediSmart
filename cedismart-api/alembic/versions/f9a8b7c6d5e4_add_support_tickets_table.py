"""add support tickets table

Revision ID: f9a8b7c6d5e4
Revises: e3a7eda5c7f2
Create Date: 2026-07-01 06:00:00.000000
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "f9a8b7c6d5e4"
down_revision: Union[str, None] = "e3a7eda5c7f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create support_tickets table
    op.create_table(
        "support_tickets",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("phone", sa.String(length=30), server_default="Anonymous", nullable=False),
        sa.Column("user_query", sa.Text(), nullable=False),
        sa.Column("chat_history", sa.JSON(), nullable=True),
        sa.Column("device_diagnostics", sa.JSON(), nullable=True),
        sa.Column("is_resolved", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    
    # Create indexes
    op.create_index("idx_support_tickets_phone", "support_tickets", ["phone"], unique=False)
    op.create_index("idx_support_tickets_resolved", "support_tickets", ["is_resolved"], unique=False)


def downgrade() -> None:
    # Drop indexes
    op.drop_index("idx_support_tickets_resolved", table_name="support_tickets")
    op.drop_index("idx_support_tickets_phone", table_name="support_tickets")
    
    # Drop table
    op.drop_table("support_tickets")
