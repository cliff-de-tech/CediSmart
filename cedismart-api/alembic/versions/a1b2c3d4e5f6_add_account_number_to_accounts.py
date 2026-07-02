"""add account_number to accounts

Revision ID: a1b2c3d4e5f6
Revises: f9a8b7c6d5e4
Create Date: 2026-07-01 20:00:00.000000
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "f9a8b7c6d5e4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add account_number to financial_accounts
    op.add_column(
        "financial_accounts",
        sa.Column("account_number", sa.String(length=50), nullable=True)
    )


def downgrade() -> None:
    # Drop account_number from financial_accounts
    op.drop_column("financial_accounts", "account_number")
