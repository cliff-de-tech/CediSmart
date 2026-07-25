"""Transactions module — business logic.

Business rules enforced here:
- Users can only access their own transactions (always filter by user_id from JWT).
- amount is always positive; transaction_type carries direction.
- transaction_date is user-provided — may differ from created_at.
- Soft delete only (is_deleted=True) — never DELETE FROM transactions.
- Bulk create is idempotent via client_id — skip silently if already exists.
- List queries always exclude is_deleted=True rows.
- Summary stats are cached in Redis for 5 minutes and invalidated on every write.
- All DB aggregation is in SQL — never loop and sum in Python.
"""

import asyncio
import json
import logging
import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any, cast

import redis.asyncio as aioredis
from sqlalchemy import case, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.exceptions import AppException
from app.modules.accounts.models import FinancialAccount
from app.modules.accounts.service import _compute_balances
from app.modules.budgets.service import invalidate_budget_cache
from app.modules.categories.models import Category
from app.modules.reports.service import invalidate_report_cache
from app.modules.transactions.models import Transaction
from app.modules.transactions.schemas import (
    BulkCreateRequest,
    BulkErrorItem,
    TransactionCreateRequest,
    TransactionUpdateRequest,
)
from app.modules.transactions.sms_parser import parse_sms as fast_parse_sms

logger = logging.getLogger(__name__)

SUMMARY_CACHE_TTL = 300  # 5 minutes
SUMMARY_CACHE_PREFIX = "txn:summary:"


# ---------------------------------------------------------------------------
# Cache helpers
# ---------------------------------------------------------------------------


def _summary_cache_key(user_id: uuid.UUID) -> str:
    return f"{SUMMARY_CACHE_PREFIX}{user_id}"


async def _invalidate_caches(
    user_id: uuid.UUID,
    transaction_date: date,
    redis: aioredis.Redis,
) -> None:
    """Invalidate summary, budget, and report caches for the affected month."""
    await redis.delete(_summary_cache_key(user_id))
    await invalidate_budget_cache(user_id, transaction_date.year, transaction_date.month, redis)
    await invalidate_report_cache(user_id, transaction_date.year, transaction_date.month, redis)


# ---------------------------------------------------------------------------
# Ownership validators
# ---------------------------------------------------------------------------


async def _assert_account_owned(
    account_id: uuid.UUID,
    user_id: uuid.UUID,
    db: AsyncSession,
) -> None:
    """Raise 404 if the account doesn't exist or isn't owned by the user."""
    result = await db.execute(
        select(FinancialAccount.id).where(
            FinancialAccount.id == account_id,
            FinancialAccount.user_id == user_id,
            FinancialAccount.is_active.is_(True),
        )
    )
    if result.scalar_one_or_none() is None:
        raise AppException(
            status_code=404,
            error_code="ACCOUNT_NOT_FOUND",
            message="Account not found",
        )


async def _assert_category_accessible(
    category_id: uuid.UUID,
    user_id: uuid.UUID,
    db: AsyncSession,
) -> None:
    """Raise 404 if the category doesn't belong to the user and isn't a system category."""
    result = await db.execute(
        select(Category.id).where(
            Category.id == category_id,
            or_(
                Category.is_system.is_(True),
                Category.user_id == user_id,
            ),
        )
    )
    if result.scalar_one_or_none() is None:
        raise AppException(
            status_code=404,
            error_code="CATEGORY_NOT_FOUND",
            message="Category not found",
        )


async def _get_transaction_or_404(
    transaction_id: uuid.UUID,
    user_id: uuid.UUID,
    db: AsyncSession,
) -> Transaction:
    """Return a non-deleted transaction owned by the user, or raise 404."""
    result = await db.execute(
        select(Transaction)
        .options(
            joinedload(Transaction.account),
            joinedload(Transaction.category),
        )
        .where(
            Transaction.id == transaction_id,
            Transaction.user_id == user_id,
            Transaction.is_deleted.is_(False),
        )
    )
    tx = result.scalar_one_or_none()
    if tx is None:
        raise AppException(
            status_code=404,
            error_code="TRANSACTION_NOT_FOUND",
            message="Transaction not found",
        )
    return tx


# ---------------------------------------------------------------------------
# Service functions
# ---------------------------------------------------------------------------


async def list_transactions(
    user_id: uuid.UUID,
    db: AsyncSession,
    page: int = 1,
    per_page: int = 20,
    start_date: date | None = None,
    end_date: date | None = None,
    category_id: uuid.UUID | None = None,
    account_id: uuid.UUID | None = None,
    transaction_type: str | None = None,
) -> tuple[list[Transaction], int]:
    """Return a paginated, filtered list of transactions for the user.

    Returns a tuple of (transactions, total_count).
    Ordered by transaction_date DESC, then created_at DESC.
    Never returns soft-deleted records.
    """
    base = (
        select(Transaction)
        .options(
            joinedload(Transaction.account),
            joinedload(Transaction.category),
        )
        .where(
            Transaction.user_id == user_id,
            Transaction.is_deleted.is_(False),
        )
    )

    if start_date is not None:
        base = base.where(Transaction.transaction_date >= start_date)
    if end_date is not None:
        base = base.where(Transaction.transaction_date <= end_date)
    if category_id is not None:
        base = base.where(Transaction.category_id == category_id)
    if account_id is not None:
        base = base.where(Transaction.account_id == account_id)
    if transaction_type is not None:
        base = base.where(Transaction.transaction_type == transaction_type)

    # Count total (without pagination)
    count_stmt = select(func.count()).select_from(base.subquery())
    total: int = (await db.execute(count_stmt)).scalar_one()

    # Paginate
    offset = (page - 1) * per_page
    paginated = (
        base.order_by(
            Transaction.transaction_date.desc(),
            Transaction.created_at.desc(),
        )
        .offset(offset)
        .limit(per_page)
    )

    rows = (await db.execute(paginated)).unique().scalars().all()
    return list(rows), total


async def get_transaction(
    transaction_id: uuid.UUID,
    user_id: uuid.UUID,
    db: AsyncSession,
) -> Transaction:
    """Return a single transaction with account and category loaded."""
    return await _get_transaction_or_404(transaction_id, user_id, db)


async def create_transaction(
    user_id: uuid.UUID,
    payload: TransactionCreateRequest,
    db: AsyncSession,
    redis: aioredis.Redis,
) -> Transaction:
    """Create a new transaction.

    Validates that the account belongs to the user and the category is
    accessible (user-owned or system). Invalidates the summary cache.
    """
    await _assert_account_owned(payload.account_id, user_id, db)
    await _assert_category_accessible(payload.category_id, user_id, db)

    tx = Transaction(
        user_id=user_id,
        account_id=payload.account_id,
        category_id=payload.category_id,
        amount=payload.amount,
        transaction_type=payload.transaction_type,
        description=payload.description,
        transaction_date=payload.transaction_date,
        notes=payload.notes,
        client_id=payload.client_id,
    )
    db.add(tx)

    try:
        await db.flush()
    except IntegrityError as e:
        raise AppException(
            status_code=409,
            error_code="DUPLICATE_CLIENT_ID",
            message="A transaction with this client_id already exists.",
            field="client_id",
        ) from e

    # Reload with relationships
    result = await db.execute(
        select(Transaction)
        .options(
            joinedload(Transaction.account),
            joinedload(Transaction.category),
        )
        .where(Transaction.id == tx.id)
    )
    tx = result.scalar_one()

    await _invalidate_caches(user_id, tx.transaction_date, redis)

    if tx.transaction_type == "expense" and not tx.is_deleted:
        from app.modules.budgets.service import check_and_trigger_budget_alerts
        await check_and_trigger_budget_alerts(
            user_id=user_id,
            category_id=tx.category_id,
            year=tx.transaction_date.year,
            month=tx.transaction_date.month,
            db=db,
            redis=redis,
        )

    return tx



async def update_transaction(
    transaction_id: uuid.UUID,
    user_id: uuid.UUID,
    payload: TransactionUpdateRequest,
    db: AsyncSession,
    redis: aioredis.Redis,
) -> Transaction:
    """Partial update of a transaction.

    account_id cannot be changed (excluded from the schema).
    Invalidates the summary cache.
    """
    tx = await _get_transaction_or_404(transaction_id, user_id, db)

    if payload.category_id is not None:
        await _assert_category_accessible(payload.category_id, user_id, db)
        tx.category_id = payload.category_id
    if payload.amount is not None:
        tx_typed = cast(Any, tx)
        tx_typed.amount = payload.amount
    if payload.transaction_type is not None:
        tx.transaction_type = payload.transaction_type
    if payload.description is not None:
        tx.description = payload.description
    if payload.transaction_date is not None:
        tx.transaction_date = payload.transaction_date
    if payload.notes is not None:
        tx.notes = payload.notes

    await db.flush()

    # Reload with relationships to reflect any category change
    result = await db.execute(
        select(Transaction)
        .options(
            joinedload(Transaction.account),
            joinedload(Transaction.category),
        )
        .where(Transaction.id == tx.id)
    )
    tx = result.scalar_one()

    await _invalidate_caches(user_id, tx.transaction_date, redis)

    if tx.transaction_type == "expense" and not tx.is_deleted:
        from app.modules.budgets.service import check_and_trigger_budget_alerts
        await check_and_trigger_budget_alerts(
            user_id=user_id,
            category_id=tx.category_id,
            year=tx.transaction_date.year,
            month=tx.transaction_date.month,
            db=db,
            redis=redis,
        )

    return tx



async def delete_transaction(
    transaction_id: uuid.UUID,
    user_id: uuid.UUID,
    db: AsyncSession,
    redis: aioredis.Redis,
) -> None:
    """Soft-delete a transaction by setting is_deleted=True.

    Never issues a DELETE statement — financial records are immutable.
    Invalidates the summary cache.
    """
    tx = await _get_transaction_or_404(transaction_id, user_id, db)
    tx.is_deleted = True
    await db.flush()
    await _invalidate_caches(user_id, tx.transaction_date, redis)

    if tx.transaction_type == "expense":
        from app.modules.budgets.service import check_and_trigger_budget_alerts
        await check_and_trigger_budget_alerts(
            user_id=user_id,
            category_id=tx.category_id,
            year=tx.transaction_date.year,
            month=tx.transaction_date.month,
            db=db,
            redis=redis,
        )



async def bulk_create_transactions(
    user_id: uuid.UUID,
    payload: BulkCreateRequest,
    db: AsyncSession,
    redis: aioredis.Redis,
) -> dict[str, Any]:
    """Idempotent bulk transaction create for offline sync.

    Each item requires a client_id. If a transaction with the same
    (user_id, client_id) already exists it is silently skipped.
    Per-item business logic errors are collected and returned rather than
    aborting the whole batch.

    Returns:
        Dict with keys: created (int), skipped (int), errors (list).
    """
    created = 0
    skipped = 0
    errors: list[BulkErrorItem] = []

    # --- Preload all valid IDs in 3 queries (not per-item) ---

    # 1. Existing client_ids — query only against incoming IDs to avoid full-table scan
    incoming_client_ids: set[uuid.UUID] = {
        item.client_id for item in payload.transactions if item.client_id is not None
    }
    if incoming_client_ids:
        existing_result = await db.execute(
            select(Transaction.client_id).where(
                Transaction.user_id == user_id,
                Transaction.client_id.in_(incoming_client_ids),
            )
        )
        existing_client_ids: set[uuid.UUID] = {row[0] for row in existing_result.all()}
    else:
        existing_client_ids = set()

    # 2. All active account IDs owned by this user
    accounts_result = await db.execute(
        select(FinancialAccount.id).where(
            FinancialAccount.user_id == user_id,
            FinancialAccount.is_active.is_(True),
        )
    )
    valid_account_ids: set[uuid.UUID] = {row[0] for row in accounts_result.all()}

    # 3. All category IDs accessible to this user (own + system)
    categories_result = await db.execute(
        select(Category.id).where(
            or_(
                Category.is_system.is_(True),
                Category.user_id == user_id,
            )
        )
    )
    valid_category_ids: set[uuid.UUID] = {row[0] for row in categories_result.all()}

    affected_months: set[tuple[int, int]] = set()
    affected_budgets: set[tuple[uuid.UUID, int, int]] = set()

    for item in payload.transactions:
        if item.client_id in existing_client_ids:
            skipped += 1
            continue

        if item.account_id not in valid_account_ids:
            errors.append(BulkErrorItem(client_id=item.client_id, reason="Account not found"))
            continue

        if item.category_id not in valid_category_ids:
            errors.append(BulkErrorItem(client_id=item.client_id, reason="Category not found"))
            continue

        tx = Transaction(
            user_id=user_id,
            account_id=item.account_id,
            category_id=item.category_id,
            amount=item.amount,
            transaction_type=item.transaction_type,
            description=item.description,
            transaction_date=item.transaction_date,
            notes=item.notes,
            client_id=item.client_id,
        )
        db.add(tx)
        existing_client_ids.add(item.client_id)  # prevent in-batch duplicates
        affected_months.add((item.transaction_date.year, item.transaction_date.month))
        if item.transaction_type == "expense":
            affected_budgets.add(
                (item.category_id, item.transaction_date.year, item.transaction_date.month)
            )
        created += 1

    if created > 0:
        await db.flush()
        # Invalidate caches concurrently for every distinct (year, month)
        # touched by created transactions
        await asyncio.gather(
            *[
                _invalidate_caches(user_id, date(year, month, 1), redis)
                for year, month in affected_months
            ]
        )

        if affected_budgets:
            from app.modules.budgets.service import check_and_trigger_budget_alerts
            for category_id, year, month in affected_budgets:
                await check_and_trigger_budget_alerts(
                    user_id=user_id,
                    category_id=category_id,
                    year=year,
                    month=month,
                    db=db,
                    redis=redis,
                )

    return {"created": created, "skipped": skipped, "errors": errors}



async def get_summary(
    user_id: uuid.UUID,
    db: AsyncSession,
    redis: aioredis.Redis,
) -> dict[str, Any]:
    """Return income/expense summary for the current month vs. last month.

    All aggregation is done in a single SQL query using CASE WHEN.
    Results are cached in Redis for 5 minutes.
    """
    cache_key = _summary_cache_key(user_id)
    cached = await redis.get(cache_key)
    if cached:
        try:
            return cast(dict[str, Any], json.loads(cached))
        except Exception:
            pass  # Cache corrupted — fall through to DB

    now = datetime.now(UTC)
    current_year, current_month = now.year, now.month

    # Compute last month
    if current_month == 1:
        last_year, last_month = current_year - 1, 12
    else:
        last_year, last_month = current_year, current_month - 1

    # Single query: aggregate both months in one pass
    income_current = func.coalesce(
        func.sum(
            case(
                (
                    (Transaction.transaction_type == "income")
                    & (func.extract("year", Transaction.transaction_date) == current_year)
                    & (func.extract("month", Transaction.transaction_date) == current_month),
                    Transaction.amount,
                ),
                else_=Decimal("0"),
            )
        ),
        Decimal("0"),
    )
    expense_current = func.coalesce(
        func.sum(
            case(
                (
                    (Transaction.transaction_type == "expense")
                    & (func.extract("year", Transaction.transaction_date) == current_year)
                    & (func.extract("month", Transaction.transaction_date) == current_month),
                    Transaction.amount,
                ),
                else_=Decimal("0"),
            )
        ),
        Decimal("0"),
    )
    income_last = func.coalesce(
        func.sum(
            case(
                (
                    (Transaction.transaction_type == "income")
                    & (func.extract("year", Transaction.transaction_date) == last_year)
                    & (func.extract("month", Transaction.transaction_date) == last_month),
                    Transaction.amount,
                ),
                else_=Decimal("0"),
            )
        ),
        Decimal("0"),
    )
    expense_last = func.coalesce(
        func.sum(
            case(
                (
                    (Transaction.transaction_type == "expense")
                    & (func.extract("year", Transaction.transaction_date) == last_year)
                    & (func.extract("month", Transaction.transaction_date) == last_month),
                    Transaction.amount,
                ),
                else_=Decimal("0"),
            )
        ),
        Decimal("0"),
    )

    stmt = select(
        income_current.label("income_current"),
        expense_current.label("expense_current"),
        income_last.label("income_last"),
        expense_last.label("expense_last"),
    ).where(
        Transaction.user_id == user_id,
        Transaction.is_deleted.is_(False),
    )

    row = (await db.execute(stmt)).one()

    inc_cur = Decimal(str(row.income_current))
    exp_cur = Decimal(str(row.expense_current))
    inc_last = Decimal(str(row.income_last))
    exp_last = Decimal(str(row.expense_last))

    # Percentage changes — None when last month value was zero (avoids div/0)
    def _pct_change(current: Decimal, last: Decimal) -> float | None:
        if last == Decimal("0"):
            return None
        return float(((current - last) / last * 100).quantize(Decimal("0.01")))

    result = {
        "current_month": {
            "income": str(inc_cur.quantize(Decimal("0.01"))),
            "expense": str(exp_cur.quantize(Decimal("0.01"))),
            "net": str((inc_cur - exp_cur).quantize(Decimal("0.01"))),
        },
        "current_month_vs_last": {
            "income_change_pct": _pct_change(inc_cur, inc_last),
            "expense_change_pct": _pct_change(exp_cur, exp_last),
        },
    }

    await redis.set(cache_key, json.dumps(result), ex=SUMMARY_CACHE_TTL)
    return result


async def parse_sms_with_gemini(
    sms_content: str, db: AsyncSession, user_id: uuid.UUID
) -> dict[str, Any]:
    """Parse SMS transaction notifications using Gemini 2.5 Flash API or a fallback rules-based engine."""
    from app.core.config import settings
    import httpx

    sms_text = sms_content.strip()
    parsed_data = None

    if settings.GEMINI_API_KEY:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={settings.GEMINI_API_KEY}"

        prompt = (
            "Analyze the following SMS transaction notification and extract transaction details. "
            "Determine if it is an income (receive, cash-in, deposit) or expense (send, cash-out, payment, fee, withdrawal). "
            "Identify the amount of the transaction. "
            "Identify the counterparty / recipient / sender or activity as description. "
            "Suggest a category (e.g. food, transfer, utilities, cash-out, leisure, or other). "
            f"SMS: \"{sms_text}\""
        )

        payload = {
            "contents": [
                {
                    "parts": [
                        {"text": prompt}
                    ]
                }
            ],
            "generationConfig": {
                "responseMimeType": "application/json",
                "responseSchema": {
                    "type": "OBJECT",
                    "properties": {
                        "amount": {"type": "NUMBER"},
                        "transaction_type": {"type": "STRING", "enum": ["income", "expense"]},
                        "description": {"type": "STRING"},
                        "category_suggestion": {"type": "STRING"},
                        "notes": {"type": "STRING"}
                    },
                    "required": ["amount", "transaction_type", "description"]
                }
            }
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(url, json=payload)
                if response.status_code == 200:
                    resp_json = response.json()
                    text_out = resp_json["candidates"][0]["content"]["parts"][0]["text"]
                    parsed_data = json.loads(text_out)
                else:
                    logger.error("Gemini API error (status %d): %s", response.status_code, response.text)
        except Exception as e:
            logger.error("Failed to parse SMS using Gemini API: %s", str(e))

    if not parsed_data:
        logger.info("Using local regex fallback parser for SMS")
        parsed_data = _parse_sms_fallback(sms_text)

    category_id = None
    if parsed_data.get("category_suggestion"):
        suggested = parsed_data["category_suggestion"].strip().lower()
        stmt = select(Category).where(
            func.lower(Category.name) == suggested
        )
        result = await db.execute(stmt)
        cat_obj = result.scalar_one_or_none()
        if cat_obj:
            category_id = cat_obj.id
        else:
            stmt_all = select(Category).where(Category.category_type == parsed_data["transaction_type"])
            res_all = await db.execute(stmt_all)
            cats = res_all.scalars().all()
            for c in cats:
                if c.name.lower() in suggested or suggested in c.name.lower():
                    category_id = c.id
                    break

            if not category_id and cats:
                other_cat = next((c for c in cats if "other" in c.name.lower() or "misc" in c.name.lower()), None)
                if other_cat:
                    category_id = other_cat.id
                else:
                    category_id = cats[0].id

    return {
        "amount": parsed_data.get("amount", 0.0),
        "transaction_type": parsed_data.get("transaction_type", "expense"),
        "description": parsed_data.get("description", "SMS Import"),
        "category_id": category_id,
        "category_name": parsed_data.get("category_suggestion", "Other").title(),
        "notes": parsed_data.get("notes", f"Parsed SMS: {sms_text}")
    }


def _parse_sms_fallback(sms_text: str) -> dict[str, Any]:
    """Fallback rule-based regex parsing for common Ghana Mobile Money transaction SMS structures."""
    import re
    sms_text_lower = sms_text.lower()

    amount = 0.0
    transaction_type = "expense"
    description = "SMS Import"
    category_suggestion = "other"
    notes = f"Regex Parsed SMS: {sms_text}"

    # 1. Extract amount
    amount_match = re.search(r'(?:ghs|ghc|₵)\s*(\d+(?:\.\d{2})?)', sms_text, re.IGNORECASE)
    if not amount_match:
        amount_match = re.search(r'(\d+\.\d{2})', sms_text)

    if amount_match:
        try:
            amount = float(amount_match.group(1))
        except ValueError:
            pass

    # 2. Determine Transaction Type (income vs expense)
    income_keywords = [
        "received from",
        "received of",
        "received",
        "cash in",
        "deposited",
        "refunded",
        "credited",
        "deposit",
    ]
    is_income = any(kw in sms_text_lower for kw in income_keywords)

    if is_income:
        transaction_type = "income"
        category_suggestion = "other income"

        sender_patterns = [
            r'received\s+from\s+([^.]+)',
            r'received\s+of\s+(?:ghs|ghc|₵)?\s*\d+(?:\.\d{2})?\s+from\s+([^.]+)',
            r'received\s+of\s+([^.]+)\s+from',
            r'deposited\s+into.*by\s+([^.]+)',
            r'deposited\s+by\s+([^.]+)',
            r'transfer\s+from\s+([^.]+)',
        ]
        for pattern in sender_patterns:
            match = re.search(pattern, sms_text, re.IGNORECASE)
            if match:
                description = match.group(1).strip()
                break
    else:
        transaction_type = "expense"
        category_suggestion = "utilities"

        recipient_patterns = [
            r'sent\s+(?:ghs|ghc|₵)?\s*\d+(?:\.\d{2})?\s+to\s+([^.]+)',
            r'sent\s+to\s+([^.]+)',
            r'paid\s+to\s+([^.]+)',
            r'payment\s+to\s+([^.]+)',
            r'payment\s+of\s+.*?\s+made\s+to\s+([^.]+)',
            r'transferred\s+to\s+([^.]+)',
        ]
        for pattern in recipient_patterns:
            match = re.search(pattern, sms_text, re.IGNORECASE)
            if match:
                description = match.group(1).strip()
                break

        if description == "SMS Import":
            if "withdrawn" in sms_text_lower or "cash out" in sms_text_lower:
                description = "Agent Withdrawal"
                category_suggestion = "cash out"

        desc_lower = description.lower()
        if any(w in desc_lower for w in ["ecg", "electricity", "water", "gwcl"]):
            category_suggestion = "bills"
        elif any(w in desc_lower for w in ["ride", "bolt", "uber", "yango", "transport"]):
            category_suggestion = "transport"
        elif any(w in desc_lower for w in ["food", "restaurant", "kfc", "chop", "canteen"]):
            category_suggestion = "food"
        elif any(w in desc_lower for w in ["telecel", "mtn", "airtel", "bundle", "credit", "internet"]):
            category_suggestion = "telecom"

    return {
        "amount": amount,
        "transaction_type": transaction_type,
        "description": description,
        "category_suggestion": category_suggestion,
        "notes": notes,
    }


async def parse_and_log_sms(
    user_id: uuid.UUID,
    phone: str,
    sender: str,
    sms_text: str,
    db: AsyncSession,
    redis: aioredis.Redis,
) -> Transaction:
    """Parse a transaction SMS and automatically record it in the ledger."""
    # 1. Clean and normalize phone number
    clean_phone = phone.strip().replace(" ", "").replace("-", "")
    if clean_phone.startswith("+233"):
        clean_phone = "0" + clean_phone[4:]  # convert +233240123456 to 0240123456
        
    # 2. Find the corresponding FinancialAccount
    stmt = select(FinancialAccount).where(
        FinancialAccount.user_id == user_id,
        FinancialAccount.is_active == True,
        FinancialAccount.account_number == clean_phone
    )
    result = await db.execute(stmt)
    account = result.scalar_one_or_none()
    
    if not account:
        # Fallback: match by provider/carrier name if phone is not matched
        provider_hint = None
        if "mobilemoney" in sender.lower() or "mtnmomo" in sender.lower() or "mtn" in sender.lower():
            provider_hint = "MTN MoMo"
        elif "telecel" in sender.lower() or "voda" in sender.lower():
            provider_hint = "Telecel Cash"
            
        if provider_hint:
            stmt = select(FinancialAccount).where(
                FinancialAccount.user_id == user_id,
                FinancialAccount.is_active == True,
                FinancialAccount.account_type == "mobile_money",
                FinancialAccount.provider == provider_hint
            )
            result = await db.execute(stmt)
            account = result.scalar_one_or_none()
            
    if not account:
        raise AppException(
            status_code=404,
            error_code="ACCOUNT_NOT_FOUND",
            message=f"No linked Mobile Money account found for provider matching '{sender}' and phone number '{phone}'."
        )

    # 3. Parse SMS (using regex first, falling back to Gemini)
    parsed = fast_parse_sms(sender, sms_text)
    if not parsed:
        res_gemini = await parse_sms_with_gemini(sms_content=sms_text, db=db, user_id=user_id)
        parsed = {
            "amount": float(res_gemini["amount"]),
            "fee": 0.0,
            "transaction_type": res_gemini["transaction_type"],
            "description": res_gemini["description"],
            "reference_id": f"sms_{int(datetime.now(UTC).timestamp())}",
            "new_balance": 0.0
        }
        category_id = res_gemini["category_id"]
    else:
        # Resolve category
        category_name = "Mobile Money Received" if parsed["transaction_type"] == "income" else "Other Expense"
        
        # Check system or user category
        stmt = select(Category).where(
            or_(
                Category.user_id == user_id,
                Category.is_system == True
            ),
            Category.category_type == parsed["transaction_type"],
            func.lower(Category.name) == category_name.lower()
        )
        cat_res = await db.execute(stmt)
        cat_obj = cat_res.scalar_one_or_none()
        
        if not cat_obj:
            # Fallback to any category for this type
            stmt = select(Category).where(
                or_(
                    Category.user_id == user_id,
                    Category.is_system == True
                ),
                Category.category_type == parsed["transaction_type"]
            )
            cat_res = await db.execute(stmt)
            cat_obj = cat_res.scalar_one_or_none()
            
        if not cat_obj:
            # Create on the fly
            cat_obj = Category(
                user_id=user_id,
                name=category_name,
                icon="wallet-outline" if parsed["transaction_type"] == "income" else "card-outline",
                color="#9C27B0" if parsed["transaction_type"] == "income" else "#9E9E9E",
                category_type=parsed["transaction_type"],
                is_system=False
            )
            db.add(cat_obj)
            await db.flush()
            
        category_id = cat_obj.id

    # 4. Check for duplicate transaction Ref ID to ensure idempotency
    ref_id = parsed["reference_id"]
    stmt = select(Transaction).where(
        Transaction.user_id == user_id,
        Transaction.account_id == account.id,
        or_(
            Transaction.notes.like(f"%{ref_id}%"),
            Transaction.description.like(f"%{ref_id}%")
        )
    )
    dup_res = await db.execute(stmt)
    if dup_res.scalar_one_or_none():
        raise AppException(
            status_code=409,
            error_code="TRANSACTION_ALREADY_LOGGED",
            message=f"Transaction with Reference ID {ref_id} has already been logged."
        )

    # 5. Create transaction
    notes = f"Parsed from SMS: {sms_text} | Ref: {ref_id}"
    tx = Transaction(
        user_id=user_id,
        account_id=account.id,
        category_id=category_id,
        amount=parsed["amount"],
        transaction_type=parsed["transaction_type"],
        description=parsed["description"],
        transaction_date=date.today(),
        notes=notes
    )
    db.add(tx)
    
    # Save Fee Transaction (if fee > 0 and transaction is an expense)
    if parsed["fee"] > 0 and parsed["transaction_type"] == "expense":
        stmt_fee = select(Category).where(
            or_(
                Category.user_id == user_id,
                Category.is_system == True
            ),
            Category.category_type == "expense",
            func.lower(Category.name) == "mobile money fees"
        )
        fee_cat_res = await db.execute(stmt_fee)
        fee_cat = fee_cat_res.scalar_one_or_none()
        
        if not fee_cat:
            # Create on the fly
            fee_cat = Category(
                user_id=user_id,
                name="Mobile Money Fees",
                icon="card-outline",
                color="#FF9800",
                category_type="expense",
                is_system=False
            )
            db.add(fee_cat)
            await db.flush()
            
        fee_category_id = fee_cat.id
        
        fee_tx = Transaction(
            user_id=user_id,
            account_id=account.id,
            category_id=fee_category_id,
            amount=parsed["fee"],
            transaction_type="expense",
            description="Mobile Money Fee",
            transaction_date=date.today(),
            notes=f"Fee for transaction Ref: {ref_id}"
        )
        db.add(fee_tx)

    await db.flush()

    # 6. Reconcile Balance
    if parsed["new_balance"] > 0:
        current_balances = await _compute_balances(user_id, db, [account.id])
        curr_bal = current_balances.get(account.id, Decimal("0.00"))
        
        target_bal = Decimal(str(parsed["new_balance"]))
        if curr_bal != target_bal:
            diff = target_bal - curr_bal
            account.opening_balance = account.opening_balance + diff
            await db.flush()

    # Invalidate cache
    await redis.delete(f"{SUMMARY_CACHE_PREFIX}{user_id}")
    await invalidate_budget_cache(user_id, date.today().year, date.today().month, redis)
    await invalidate_report_cache(user_id, date.today().year, date.today().month, redis)

    # Reload transaction
    stmt_reload = (
        select(Transaction)
        .options(
            joinedload(Transaction.account),
            joinedload(Transaction.category),
        )
        .where(Transaction.id == tx.id)
    )
    tx_reload = (await db.execute(stmt_reload)).scalar_one()
    return tx_reload

