"""Budgets module integration tests."""

from httpx import AsyncClient

from tests.conftest import assert_error_response, make_auth_headers


async def _setup(client: AsyncClient, make_user) -> tuple:
    """Create a user and an expense category; return (user, category_id, headers)."""
    user = await make_user()
    headers = make_auth_headers(user.id)

    cat_resp = await client.post(
        "/api/v1/categories/",
        json={"name": "Food", "icon": "🍔", "color": "#AABBCC", "category_type": "expense"},
        headers=headers,
    )
    assert cat_resp.status_code == 201
    return user, cat_resp.json()["id"], headers


def _budget_payload(category_id: str, **overrides) -> dict:
    return {
        "category_id": category_id,
        "amount": "500.00",
        "year": 2026,
        "month": 4,
        **overrides,
    }


# ---------------------------------------------------------------------------
# POST /  (upsert)
# ---------------------------------------------------------------------------


async def test_upsert_budget_create(client: AsyncClient, make_user) -> None:
    _, category_id, headers = await _setup(client, make_user)

    resp = await client.post(
        "/api/v1/budgets/",
        json=_budget_payload(category_id),
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["budgeted_amount"] == "500.00"
    assert body["period"]["month"] == 4


async def test_upsert_budget_update(client: AsyncClient, make_user) -> None:
    _, category_id, headers = await _setup(client, make_user)

    await client.post(
        "/api/v1/budgets/",
        json=_budget_payload(category_id, amount="500.00"),
        headers=headers,
    )

    resp = await client.post(
        "/api/v1/budgets/",
        json=_budget_payload(category_id, amount="750.00"),
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["budgeted_amount"] == "750.00"


# ---------------------------------------------------------------------------
# GET /
# ---------------------------------------------------------------------------


async def test_list_budgets(client: AsyncClient, make_user) -> None:
    _, category_id, headers = await _setup(client, make_user)

    await client.post(
        "/api/v1/budgets/",
        json=_budget_payload(category_id),
        headers=headers,
    )

    resp = await client.get("/api/v1/budgets/?year=2026&month=4", headers=headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 1


# ---------------------------------------------------------------------------
# DELETE /{id}
# ---------------------------------------------------------------------------


async def test_delete_budget(client: AsyncClient, make_user) -> None:
    _, category_id, headers = await _setup(client, make_user)

    created = await client.post(
        "/api/v1/budgets/",
        json=_budget_payload(category_id),
        headers=headers,
    )
    budget_id = created.json()["id"]

    resp = await client.delete(f"/api/v1/budgets/{budget_id}", headers=headers)
    assert resp.status_code == 204


# ---------------------------------------------------------------------------
# Free tier limit
# ---------------------------------------------------------------------------


async def test_free_tier_budget_limit(client: AsyncClient, make_user) -> None:
    user = await make_user(is_premium=False)
    headers = make_auth_headers(user.id)

    # Create 5 categories and 5 budgets (free tier max per month)
    category_ids = []
    for i in range(6):
        cat = await client.post(
            "/api/v1/categories/",
            json={"name": f"Cat {i}", "icon": "x", "color": "#AABBCC", "category_type": "expense"},
            headers=headers,
        )
        category_ids.append(cat.json()["id"])

    for cat_id in category_ids[:5]:
        resp = await client.post(
            "/api/v1/budgets/",
            json=_budget_payload(cat_id),
            headers=headers,
        )
        assert resp.status_code == 200

    resp = await client.post(
        "/api/v1/budgets/",
        json=_budget_payload(category_ids[5]),
        headers=headers,
    )
    assert_error_response(resp, 403, "BUDGET_LIMIT_REACHED")
