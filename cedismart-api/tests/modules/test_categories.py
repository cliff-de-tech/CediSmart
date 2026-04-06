"""Categories module integration tests."""

from httpx import AsyncClient

from tests.conftest import assert_error_response, make_auth_headers

_CATEGORY_PAYLOAD = {
    "name": "Groceries",
    "icon": "cart",
    "color": "#FF5733",
    "category_type": "expense",
}


async def _create_category(client: AsyncClient, headers: dict, payload: dict | None = None) -> dict:
    resp = await client.post(
        "/api/v1/categories/",
        json=payload or _CATEGORY_PAYLOAD,
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()


# ---------------------------------------------------------------------------
# POST /
# ---------------------------------------------------------------------------


async def test_create_category(client: AsyncClient, make_user) -> None:
    user = await make_user()
    headers = make_auth_headers(user.id)

    resp = await client.post("/api/v1/categories/", json=_CATEGORY_PAYLOAD, headers=headers)
    assert resp.status_code == 201
    body = resp.json()
    assert body["name"] == "Groceries"
    assert body["category_type"] == "expense"
    assert body["is_system"] is False


async def test_create_category_invalid_type(client: AsyncClient, make_user) -> None:
    user = await make_user()
    headers = make_auth_headers(user.id)

    resp = await client.post(
        "/api/v1/categories/",
        json={**_CATEGORY_PAYLOAD, "category_type": "transfer"},
        headers=headers,
    )
    assert resp.status_code == 422


async def test_create_category_invalid_color(client: AsyncClient, make_user) -> None:
    user = await make_user()
    headers = make_auth_headers(user.id)

    resp = await client.post(
        "/api/v1/categories/",
        json={**_CATEGORY_PAYLOAD, "color": "red"},  # not hex
        headers=headers,
    )
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# GET /
# ---------------------------------------------------------------------------


async def test_list_categories(client: AsyncClient, make_user) -> None:
    user = await make_user()
    headers = make_auth_headers(user.id)
    await _create_category(client, headers)

    resp = await client.get("/api/v1/categories/", headers=headers)
    assert resp.status_code == 200
    names = [c["name"] for c in resp.json()]
    assert "Groceries" in names


async def test_list_categories_filtered_by_type(client: AsyncClient, make_user) -> None:
    user = await make_user()
    headers = make_auth_headers(user.id)
    await _create_category(client, headers, _CATEGORY_PAYLOAD)
    await _create_category(
        client,
        headers,
        {**_CATEGORY_PAYLOAD, "name": "Salary", "category_type": "income"},
    )

    resp = await client.get("/api/v1/categories/?type=income", headers=headers)
    assert resp.status_code == 200
    types = [c["category_type"] for c in resp.json()]
    assert all(t == "income" for t in types)


# ---------------------------------------------------------------------------
# PATCH /{id}
# ---------------------------------------------------------------------------


async def test_update_category(client: AsyncClient, make_user) -> None:
    user = await make_user()
    headers = make_auth_headers(user.id)
    category = await _create_category(client, headers)

    resp = await client.patch(
        f"/api/v1/categories/{category['id']}",
        json={"name": "Food & Chop"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Food & Chop"


# ---------------------------------------------------------------------------
# DELETE /{id}
# ---------------------------------------------------------------------------


async def test_delete_category_no_transactions(client: AsyncClient, make_user) -> None:
    user = await make_user()
    headers = make_auth_headers(user.id)
    category = await _create_category(client, headers)

    resp = await client.delete(f"/api/v1/categories/{category['id']}", headers=headers)
    assert resp.status_code == 204


async def test_delete_category_not_found(client: AsyncClient, make_user) -> None:
    import uuid

    user = await make_user()
    headers = make_auth_headers(user.id)

    resp = await client.delete(f"/api/v1/categories/{uuid.uuid4()}", headers=headers)
    assert_error_response(resp, 404, "CATEGORY_NOT_FOUND")


# ---------------------------------------------------------------------------
# Free tier limit
# ---------------------------------------------------------------------------


async def test_free_tier_category_limit(client: AsyncClient, make_user) -> None:
    user = await make_user(is_premium=False)
    headers = make_auth_headers(user.id)

    for i in range(20):
        await _create_category(client, headers, {**_CATEGORY_PAYLOAD, "name": f"Category {i}"})

    resp = await client.post(
        "/api/v1/categories/",
        json={**_CATEGORY_PAYLOAD, "name": "Category 21"},
        headers=headers,
    )
    assert_error_response(resp, 403, "CATEGORY_LIMIT_REACHED")
