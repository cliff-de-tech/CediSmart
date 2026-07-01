"""add clerk_user_id to users

Revision ID: e3a7eda5c7f2
Revises: e3a7eda5c7f1
Create Date: 2026-06-29 02:12:00.000000
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "e3a7eda5c7f2"
down_revision: Union[str, None] = "e3a7eda5c7f1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add clerk_user_id column
    op.add_column("users", sa.Column("clerk_user_id", sa.String(length=100), nullable=True))
    
    # Create unique index for clerk_user_id
    op.create_index(op.f("ix_users_clerk_user_id"), "users", ["clerk_user_id"], unique=True)


def downgrade() -> None:
    # Drop unique index
    op.drop_index(op.f("ix_users_clerk_user_id"), table_name="users")
    
    # Drop clerk_user_id column
    op.drop_column("users", "clerk_user_id")
