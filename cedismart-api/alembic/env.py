"""Alembic async migration environment for CediSmart.

Uses the async SQLAlchemy engine from app.core.database.
The database URL in alembic.ini is overridden here with the app's settings.
"""

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy.ext.asyncio import async_engine_from_config
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.core.database import Base

# Import all models so that Base.metadata is fully populated.
from app.modules.auth.models import User  # noqa: F401
from app.modules.accounts.models import FinancialAccount  # noqa: F401
from app.modules.transactions.models import Transaction  # noqa: F401
from app.modules.categories.models import Category  # noqa: F401
from app.modules.budgets.models import Budget  # noqa: F401

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

# Override the sqlalchemy.url with the app's DATABASE_URL
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode — generates SQL without a DB connection."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: object) -> None:
    """Run migrations within a connection context."""
    context.configure(connection=connection, target_metadata=target_metadata)  # type: ignore[arg-type]

    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    """Run migrations in 'online' mode — connects to the database."""
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
