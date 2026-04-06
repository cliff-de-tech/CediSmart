"""Add CHECK constraint: financial_accounts.opening_balance >= 0.

Defends against negative opening balances being inserted via any path
that bypasses the API layer (scripts, seeders, internal tools).

Revision ID: 0002
Revises: 0001
Create Date: 2026-04-04
"""

from alembic import op

revision: str = "0002"
down_revision: str = "0001"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.create_check_constraint(
        "ck_financial_accounts_opening_balance_non_negative",
        "financial_accounts",
        "opening_balance >= 0",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_financial_accounts_opening_balance_non_negative",
        "financial_accounts",
        type_="check",
    )
