"""Transactions module integration tests."""

import uuid

from httpx import AsyncClient

from tests.conftest import assert_error_response, make_auth_headers


async def _setup(client: AsyncClient, make_user) -> tuple:
    """Create a user, account, and category; return (user, account_id, category_id, headers)."""
    user = await make_user()
    headers = make_auth_headers(user.id)

    account_resp = await client.post(
        "/api/v1/accounts/",
        json={"name": "Cash Wallet", "account_type": "cash", "opening_balance": "1000.00"},
        headers=headers,
    )
    assert account_resp.status_code == 201

    cat_resp = await client.post(
        "/api/v1/categories/",
        json={"name": "Transport", "icon": "bus", "color": "#123456", "category_type": "expense"},
        headers=headers,
    )
    assert cat_resp.status_code == 201

    return user, account_resp.json()["id"], cat_resp.json()["id"], headers


def _tx_payload(account_id: str, category_id: str, **overrides) -> dict:
    return {
        "account_id": account_id,
        "category_id": category_id,
        "amount": "150.00",
        "transaction_type": "expense",
        "description": "Trotro fare",
        "transaction_date": "2026-04-01",
        **overrides,
    }


# ---------------------------------------------------------------------------
# POST /
# ---------------------------------------------------------------------------


async def test_create_transaction(client: AsyncClient, make_user) -> None:
    _, account_id, category_id, headers = await _setup(client, make_user)

    resp = await client.post(
        "/api/v1/transactions/",
        json=_tx_payload(account_id, category_id),
        headers=headers,
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["transaction_type"] == "expense"


async def test_create_transaction_negative_amount(client: AsyncClient, make_user) -> None:
    _, account_id, category_id, headers = await _setup(client, make_user)

    resp = await client.post(
        "/api/v1/transactions/",
        json=_tx_payload(account_id, category_id, amount="-50.00"),
        headers=headers,
    )
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# GET /
# ---------------------------------------------------------------------------


async def test_list_transactions(client: AsyncClient, make_user) -> None:
    _, account_id, category_id, headers = await _setup(client, make_user)

    await client.post(
        "/api/v1/transactions/",
        json=_tx_payload(account_id, category_id),
        headers=headers,
    )

    resp = await client.get("/api/v1/transactions/", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["pagination"]["total"] == 1
    assert len(body["data"]) == 1


# ---------------------------------------------------------------------------
# GET /{id}
# ---------------------------------------------------------------------------


async def test_get_transaction(client: AsyncClient, make_user) -> None:
    _, account_id, category_id, headers = await _setup(client, make_user)

    created = await client.post(
        "/api/v1/transactions/",
        json=_tx_payload(account_id, category_id),
        headers=headers,
    )
    tx_id = created.json()["id"]

    resp = await client.get(f"/api/v1/transactions/{tx_id}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["id"] == tx_id


async def test_get_transaction_not_found(client: AsyncClient, make_user) -> None:
    _, _, _, headers = await _setup(client, make_user)

    resp = await client.get(f"/api/v1/transactions/{uuid.uuid4()}", headers=headers)
    assert_error_response(resp, 404, "TRANSACTION_NOT_FOUND")


# ---------------------------------------------------------------------------
# PATCH /{id}
# ---------------------------------------------------------------------------


async def test_update_transaction(client: AsyncClient, make_user) -> None:
    _, account_id, category_id, headers = await _setup(client, make_user)

    created = await client.post(
        "/api/v1/transactions/",
        json=_tx_payload(account_id, category_id),
        headers=headers,
    )
    tx_id = created.json()["id"]

    resp = await client.patch(
        f"/api/v1/transactions/{tx_id}",
        json={"description": "Updated description"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["description"] == "Updated description"


# ---------------------------------------------------------------------------
# DELETE /{id}  — soft delete
# ---------------------------------------------------------------------------


async def test_delete_transaction_soft_delete(client: AsyncClient, make_user) -> None:
    _, account_id, category_id, headers = await _setup(client, make_user)

    created = await client.post(
        "/api/v1/transactions/",
        json=_tx_payload(account_id, category_id),
        headers=headers,
    )
    tx_id = created.json()["id"]

    resp = await client.delete(f"/api/v1/transactions/{tx_id}", headers=headers)
    assert resp.status_code == 204

    # Soft-deleted: should not appear in list
    listing = await client.get("/api/v1/transactions/", headers=headers)
    assert listing.json()["pagination"]["total"] == 0


# ---------------------------------------------------------------------------
# POST /bulk
# ---------------------------------------------------------------------------


async def test_bulk_create_transactions(client: AsyncClient, make_user) -> None:
    _, account_id, category_id, headers = await _setup(client, make_user)

    client_id_1 = str(uuid.uuid4())
    client_id_2 = str(uuid.uuid4())

    resp = await client.post(
        "/api/v1/transactions/bulk",
        json={
            "transactions": [
                {**_tx_payload(account_id, category_id), "client_id": client_id_1},
                {
                    **_tx_payload(account_id, category_id, description="Taxi"),
                    "client_id": client_id_2,
                },
            ]
        },
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["created"] == 2
    assert body["skipped"] == 0


async def test_bulk_deduplication(client: AsyncClient, make_user) -> None:
    _, account_id, category_id, headers = await _setup(client, make_user)

    same_client_id = str(uuid.uuid4())
    payload = {
        "transactions": [
            {**_tx_payload(account_id, category_id), "client_id": same_client_id},
        ]
    }

    # First bulk call
    await client.post("/api/v1/transactions/bulk", json=payload, headers=headers)
    # Second call with same client_id — should skip
    resp = await client.post("/api/v1/transactions/bulk", json=payload, headers=headers)

    assert resp.status_code == 200
    body = resp.json()
    assert body["created"] == 0
    assert body["skipped"] == 1


# ---------------------------------------------------------------------------
# GET /summary
# ---------------------------------------------------------------------------


async def test_get_summary(client: AsyncClient, make_user) -> None:
    _, _, _, headers = await _setup(client, make_user)

    resp = await client.get("/api/v1/transactions/summary", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert "current_month" in body
    assert "current_month_vs_last" in body
