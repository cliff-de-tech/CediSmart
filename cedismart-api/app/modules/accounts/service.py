"""Accounts module — business logic.

Business rules enforced here:
- Free tier: max 3 active accounts per user (is_premium=False).
- opening_balance and account_type are immutable after creation.
- Balance is NEVER stored — always computed:
  opening_balance + SUM(income) - SUM(expense) in a single SQL query.
- Soft delete (is_active=False) when account has transactions.
- Hard delete when account has zero transactions (including soft-deleted ones).
- All queries filtered by user_id from JWT — never trust client-provided user_id.
"""

import uuid
from decimal import Decimal

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppException
from app.modules.accounts.models import FinancialAccount
from app.modules.accounts.schemas import AccountCreateRequest, AccountUpdateRequest
from app.modules.transactions.models import Transaction

FREE_TIER_ACCOUNT_LIMIT = 3


# ---------------------------------------------------------------------------
# Read helpers
# ---------------------------------------------------------------------------


async def _get_account_or_404(
    account_id: uuid.UUID,
    user_id: uuid.UUID,
    db: AsyncSession,
) -> FinancialAccount:
    """Return an account owned by user_id, or raise 404.

    Returns 404 (not 403) for both missing and unowned accounts to prevent
    resource enumeration.
    """
    result = await db.execute(
        select(FinancialAccount).where(
            FinancialAccount.id == account_id,
            FinancialAccount.user_id == user_id,
        )
    )
    account = result.scalar_one_or_none()
    if account is None:
        raise AppException(
            status_code=404,
            error_code="ACCOUNT_NOT_FOUND",
            message="Account not found",
        )
    return account


async def _compute_balances(
    user_id: uuid.UUID,
    db: AsyncSession,
    account_ids: list[uuid.UUID] | None = None,
) -> dict[uuid.UUID, Decimal]:
    """Compute current balance for one or more accounts in a single query.

    balance = opening_balance + SUM(income) - SUM(expense)

    All aggregation is done in SQL — no Python loops over transactions.

    Args:
        user_id: The authenticated user's UUID.
        db: Async database session.
        account_ids: Optional list to restrict which accounts to compute.
            If None, computes for all user accounts.

    Returns:
        Dict mapping account_id → computed balance.
    """
    # Aggregate income and expense in one pass using CASE WHEN
    income_sum = func.coalesce(
        func.sum(
            case(
                (Transaction.transaction_type == "income", Transaction.amount),
                else_=Decimal("0"),
            )
        ),
        Decimal("0"),
    )
    expense_sum = func.coalesce(
        func.sum(
            case(
                (Transaction.transaction_type == "expense", Transaction.amount),
                else_=Decimal("0"),
            )
        ),
        Decimal("0"),
    )

    stmt = (
        select(
            FinancialAccount.id,
            FinancialAccount.opening_balance,
            income_sum.label("total_income"),
            expense_sum.label("total_expense"),
        )
        .outerjoin(
            Transaction,
            (Transaction.account_id == FinancialAccount.id)
            & (Transaction.is_deleted.is_(False)),
        )
        .where(FinancialAccount.user_id == user_id)
        .group_by(FinancialAccount.id, FinancialAccount.opening_balance)
    )

    if account_ids is not None:
        stmt = stmt.where(FinancialAccount.id.in_(account_ids))

    rows = (await db.execute(stmt)).all()

    return {
        row.id: Decimal(str(row.opening_balance))
        + Decimal(str(row.total_income))
        - Decimal(str(row.total_expense))
        for row in rows
    }


# ---------------------------------------------------------------------------
# Service functions
# ---------------------------------------------------------------------------


async def list_accounts(
    user_id: uuid.UUID,
    db: AsyncSession,
) -> list[dict]:
    """Return all active accounts for the user with computed balances.

    Uses a single SQL query with LEFT JOIN + aggregation — no N+1 queries.
    """
    result = await db.execute(
        select(FinancialAccount)
        .where(
            FinancialAccount.user_id == user_id,
            FinancialAccount.is_active.is_(True),
        )
        .order_by(FinancialAccount.created_at)
    )
    accounts = result.scalars().all()

    if not accounts:
        return []

    account_ids = [a.id for a in accounts]
    balances = await _compute_balances(user_id, db, account_ids)

    return [
        {
            "id": a.id,
            "name": a.name,
            "account_type": a.account_type,
            "provider": a.provider,
            "opening_balance": Decimal(str(a.opening_balance)),
            "balance": balances.get(a.id, Decimal(str(a.opening_balance))),
            "is_active": a.is_active,
            "created_at": a.created_at,
        }
        for a in accounts
    ]


async def get_account(
    account_id: uuid.UUID,
    user_id: uuid.UUID,
    db: AsyncSession,
) -> dict:
    """Return a single account with its computed balance."""
    account = await _get_account_or_404(account_id, user_id, db)
    balances = await _compute_balances(user_id, db, [account.id])

    return {
        "id": account.id,
        "name": account.name,
        "account_type": account.account_type,
        "provider": account.provider,
        "opening_balance": Decimal(str(account.opening_balance)),
        "balance": balances.get(account.id, Decimal(str(account.opening_balance))),
        "is_active": account.is_active,
        "created_at": account.created_at,
    }


async def create_account(
    user_id: uuid.UUID,
    payload: AccountCreateRequest,
    is_premium: bool,
    db: AsyncSession,
) -> dict:
    """Create a new financial account.

    Enforces the free tier limit of 3 active accounts.
    opening_balance and account_type are set here and cannot be changed later.

    Args:
        user_id: The authenticated user's UUID.
        payload: Validated request body.
        is_premium: Whether the user has an active premium subscription.
        db: Async database session.
    """
    if not is_premium:
        # Lock the user row to serialise concurrent account creation.
        # Without this, two simultaneous requests could both pass the count
        # check before either commits, bypassing the free tier limit.
        await db.execute(
            select(FinancialAccount.id)
            .where(
                FinancialAccount.user_id == user_id,
                FinancialAccount.is_active.is_(True),
            )
            .with_for_update()
        )
        count_result = await db.execute(
            select(func.count(FinancialAccount.id)).where(
                FinancialAccount.user_id == user_id,
                FinancialAccount.is_active.is_(True),
            )
        )
        active_count = count_result.scalar_one()
        if active_count >= FREE_TIER_ACCOUNT_LIMIT:
            raise AppException(
                status_code=403,
                error_code="ACCOUNT_LIMIT_REACHED",
                message=(
                    f"Free tier allows up to {FREE_TIER_ACCOUNT_LIMIT} accounts. "
                    "Upgrade to CediSmart Pro for unlimited accounts."
                ),
            )

    account = FinancialAccount(
        user_id=user_id,
        name=payload.name,
        account_type=payload.account_type,
        provider=payload.provider,
        opening_balance=payload.opening_balance,
    )
    db.add(account)
    await db.flush()

    return {
        "id": account.id,
        "name": account.name,
        "account_type": account.account_type,
        "provider": account.provider,
        "opening_balance": payload.opening_balance,
        "balance": payload.opening_balance,  # No transactions yet
        "is_active": account.is_active,
        "created_at": account.created_at,
    }


async def update_account(
    account_id: uuid.UUID,
    user_id: uuid.UUID,
    payload: AccountUpdateRequest,
    db: AsyncSession,
) -> dict:
    """Update mutable account fields (name, provider only).

    opening_balance and account_type are immutable after creation.
    Returns 400 if the client attempts to update locked fields (enforced
    in the router via schema — only mutable fields are accepted here).
    """
    account = await _get_account_or_404(account_id, user_id, db)

    if payload.name is not None:
        account.name = payload.name
    if payload.provider is not None:
        account.provider = payload.provider

    await db.flush()

    balances = await _compute_balances(user_id, db, [account.id])

    return {
        "id": account.id,
        "name": account.name,
        "account_type": account.account_type,
        "provider": account.provider,
        "opening_balance": Decimal(str(account.opening_balance)),
        "balance": balances.get(account.id, Decimal(str(account.opening_balance))),
        "is_active": account.is_active,
        "created_at": account.created_at,
    }


async def delete_account(
    account_id: uuid.UUID,
    user_id: uuid.UUID,
    db: AsyncSession,
) -> bool:
    """Delete or deactivate an account.

    - If the account has ANY transactions (including soft-deleted): soft delete
      (is_active=False) to preserve financial history integrity.
    - If no transactions exist: hard delete.

    Returns:
        True if hard-deleted (caller returns 204).
        False if soft-deleted / deactivated (caller returns 200 with message).
    """
    account = await _get_account_or_404(account_id, user_id, db)

    tx_count_result = await db.execute(
        select(func.count(Transaction.id)).where(
            Transaction.account_id == account_id
        )
    )
    tx_count = tx_count_result.scalar_one()

    if tx_count > 0:
        account.is_active = False
        await db.flush()
        return False  # Soft deleted
    else:
        await db.delete(account)
        await db.flush()
        return True  # Hard deleted
