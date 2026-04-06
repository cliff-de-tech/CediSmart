"""Reports module integration tests — service layer mocked (PostgreSQL-specific SQL)."""

from unittest.mock import AsyncMock, patch

from httpx import AsyncClient

from tests.conftest import make_auth_headers

_MONTHLY_STUB = {
    "period": "2026-04",
    "total_income": "2000.00",
    "total_expense": "1200.00",
    "net": "800.00",
    "transaction_count": 5,
    "top_expense_category": None,
    "days_with_activity": 3,
}

_CATEGORIES_STUB = {
    "period": {"start": "2026-04-01", "end": "2026-04-30"},
    "total": "1200.00",
    "categories": [],
}

_TRENDS_STUB = {
    "months": [
        {"year": 2026, "month": m, "income": "0.00", "expense": "0.00", "net": "0.00"}
        for m in range(1, 7)
    ],
}


# ---------------------------------------------------------------------------
# GET /reports/monthly
# ---------------------------------------------------------------------------


async def test_monthly_report(client: AsyncClient, make_user) -> None:
    user = await make_user()
    headers = make_auth_headers(user.id)

    with patch(
        "app.modules.reports.service.get_monthly_report",
        new_callable=AsyncMock,
        return_value=_MONTHLY_STUB,
    ):
        resp = await client.get(
            "/api/v1/reports/monthly?year=2026&month=4",
            headers=headers,
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["total_income"] == "2000.00"
    assert body["total_expense"] == "1200.00"


async def test_monthly_report_missing_params(client: AsyncClient, make_user) -> None:
    user = await make_user()
    headers = make_auth_headers(user.id)

    resp = await client.get("/api/v1/reports/monthly", headers=headers)
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# GET /reports/categories
# ---------------------------------------------------------------------------


async def test_category_report(client: AsyncClient, make_user) -> None:
    user = await make_user()
    headers = make_auth_headers(user.id)

    with patch(
        "app.modules.reports.service.get_category_report",
        new_callable=AsyncMock,
        return_value=_CATEGORIES_STUB,
    ):
        resp = await client.get(
            "/api/v1/reports/categories?start_date=2026-04-01&end_date=2026-04-30",
            headers=headers,
        )

    assert resp.status_code == 200
    assert resp.json()["total"] == "1200.00"


# ---------------------------------------------------------------------------
# GET /reports/trends
# ---------------------------------------------------------------------------


async def test_trends_report(client: AsyncClient, make_user) -> None:
    user = await make_user()
    headers = make_auth_headers(user.id)

    with patch(
        "app.modules.reports.service.get_trends_report",
        new_callable=AsyncMock,
        return_value=_TRENDS_STUB,
    ):
        resp = await client.get(
            "/api/v1/reports/trends?months=6",
            headers=headers,
        )

    assert resp.status_code == 200
    assert len(resp.json()["months"]) == 6


async def test_trends_report_months_out_of_range(client: AsyncClient, make_user) -> None:
    user = await make_user()
    headers = make_auth_headers(user.id)

    resp = await client.get("/api/v1/reports/trends?months=13", headers=headers)
    assert resp.status_code == 422
