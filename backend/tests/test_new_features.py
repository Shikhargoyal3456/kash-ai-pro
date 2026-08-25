"""Tests for iteration-2 features: Stripe payments, prescription upload,
rider live location and admin revenue trend."""
import base64
import pytest
from conftest import BASE_URL

# 1x1 transparent png as data URL (prescription image)
PNG_B64 = ("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8"
           "AAAwAB/AL+cwAAAABJRU5ErkJggg==")
RX_IMAGE = "data:image/png;base64," + PNG_B64


def _pick_medicine(user_client, requires_rx):
    r = user_client.get(f"{BASE_URL}/api/user/medicines")
    assert r.status_code == 200
    meds = [m for m in r.json() if bool(m.get("requires_prescription")) == requires_rx and m.get("stock", 0) > 2]
    if not meds:
        pytest.fail(f"No medicine found with requires_prescription={requires_rx}")
    return meds[0]


def _place(user_client, med, **extra):
    body = {"items": [{"medicine_id": med["id"], "name": med["name"], "price": med["price"], "qty": 1}],
            "address": "TEST_ addr, Pune", "prescription_note": None, "prescription_image": None}
    body.update(extra)
    return user_client.post(f"{BASE_URL}/api/user/orders", json=body)


# --- Prescription upload -----------------------------------------------------
class TestPrescriptionUpload:
    def test_rx_medicine_without_prescription_rejected(self, user_client):
        med = _pick_medicine(user_client, True)
        r = _place(user_client, med)
        assert r.status_code == 400, r.text
        assert "prescription" in r.json().get("detail", "").lower()

    def test_rx_medicine_with_image_accepted_and_persisted(self, user_client, created_orders):
        med = _pick_medicine(user_client, True)
        r = _place(user_client, med, prescription_image=RX_IMAGE)
        assert r.status_code == 200, r.text
        o = r.json()
        created_orders.append(o["id"])
        assert o["prescription_image"] == RX_IMAGE
        assert o["payment_status"] == "pending"
        assert "_id" not in o

        # verify persisted via track endpoint
        t = user_client.get(f"{BASE_URL}/api/user/orders/{o['id']}/track")
        assert t.status_code == 200
        td = t.json()
        assert td["prescription_image"] == RX_IMAGE
        assert td["payment_status"] == "pending"
        assert isinstance(td.get("store_location"), dict) and "lat" in td["store_location"]
        assert isinstance(td.get("dest_location"), dict) and "lat" in td["dest_location"]
        assert td.get("rider_location") is None


# --- Stripe payments ---------------------------------------------------------
class TestStripePayments:
    def test_order_created_pending_and_checkout_session(self, user_client, created_orders, payment_ctx):
        med = _pick_medicine(user_client, False)
        r = _place(user_client, med)
        assert r.status_code == 200, r.text
        order = r.json()
        created_orders.append(order["id"])
        assert order["payment_status"] == "pending"
        payment_ctx["order_id"] = order["id"]
        payment_ctx["total"] = order["total"]

        c = user_client.post(f"{BASE_URL}/api/payments/checkout",
                             json={"order_id": order["id"], "origin_url": BASE_URL})
        assert c.status_code == 200, c.text
        data = c.json()
        assert isinstance(data.get("checkout_url"), str) and data["checkout_url"].startswith("http")
        assert isinstance(data.get("session_id"), str) and len(data["session_id"]) > 5
        payment_ctx["session_id"] = data["session_id"]

    def test_status_pending_before_payment(self, payment_ctx, user_client):
        sid = payment_ctx.get("session_id")
        assert sid, "no session id from previous test"
        r = user_client.get(f"{BASE_URL}/api/payments/status/{sid}")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["session_id"] == sid
        assert d["payment_status"] == "pending"

    def test_unpaid_order_hidden_from_pharmacy(self, pharmacy_client, payment_ctx):
        oid = payment_ctx.get("order_id")
        assert oid
        r = pharmacy_client.get(f"{BASE_URL}/api/pharmacy/orders")
        assert r.status_code == 200
        ids = [o["id"] for o in r.json()]
        assert oid not in ids, "Unpaid order leaked into pharmacy orders"
        assert all(o.get("payment_status") != "pending" for o in r.json())

    def test_checkout_unknown_session_status_404(self, user_client):
        r = user_client.get(f"{BASE_URL}/api/payments/status/cs_test_doesnotexist123")
        assert r.status_code == 404

    def test_status_requires_auth(self, anon_client, payment_ctx):
        sid = payment_ctx.get("session_id", "cs_test_x")
        r = anon_client.get(f"{BASE_URL}/api/payments/status/{sid}")
        assert r.status_code in (401, 403)

    def test_checkout_requires_auth(self, anon_client, payment_ctx):
        r = anon_client.post(f"{BASE_URL}/api/payments/checkout",
                            json={"order_id": payment_ctx.get("order_id", "x"), "origin_url": BASE_URL})
        assert r.status_code in (401, 403)

    def test_checkout_other_role_forbidden(self, pharmacy_client, payment_ctx):
        r = pharmacy_client.post(f"{BASE_URL}/api/payments/checkout",
                                 json={"order_id": payment_ctx.get("order_id", "x"), "origin_url": BASE_URL})
        assert r.status_code == 403

    def test_checkout_bad_order_id(self, user_client):
        r = user_client.post(f"{BASE_URL}/api/payments/checkout",
                             json={"order_id": "not-an-objectid", "origin_url": BASE_URL})
        assert r.status_code in (400, 404), f"got {r.status_code}: {r.text[:200]}"

    def test_webhook_bad_signature_is_ignored(self, anon_client):
        r = anon_client.post(f"{BASE_URL}/api/webhook/stripe", data=b"{}")
        assert r.status_code == 200
        assert r.json().get("status") in ("ignored", "ok")


# --- Rider live location -----------------------------------------------------
class TestRiderLocation:
    def test_location_requires_delivery_role(self, user_client, payment_ctx):
        oid = payment_ctx.get("order_id", "000000000000000000000000")
        r = user_client.put(f"{BASE_URL}/api/delivery/orders/{oid}/location",
                            json={"lat": 18.52, "lng": 73.85})
        assert r.status_code == 403

    def test_location_unassigned_order_404(self, delivery_client, payment_ctx):
        oid = payment_ctx.get("order_id", "000000000000000000000000")
        r = delivery_client.put(f"{BASE_URL}/api/delivery/orders/{oid}/location",
                                json={"lat": 18.52, "lng": 73.85})
        assert r.status_code == 404

    def test_location_validation(self, delivery_client, payment_ctx):
        oid = payment_ctx.get("order_id", "000000000000000000000000")
        r = delivery_client.put(f"{BASE_URL}/api/delivery/orders/{oid}/location",
                                json={"lat": "abc"})
        assert r.status_code == 422


# --- Admin revenue trend -----------------------------------------------------
class TestAdminRevenue:
    def test_revenue_series_shape(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/admin/revenue")
        assert r.status_code == 200, r.text
        series = r.json()
        assert isinstance(series, list) and len(series) == 14
        for p in series:
            assert set(p.keys()) == {"date", "revenue", "orders"}
            assert isinstance(p["revenue"], (int, float))
            assert isinstance(p["orders"], int)
        dates = [p["date"] for p in series]
        assert len(set(dates)) == 14

    def test_revenue_requires_admin(self, user_client, anon_client):
        assert user_client.get(f"{BASE_URL}/api/admin/revenue").status_code == 403
        assert anon_client.get(f"{BASE_URL}/api/admin/revenue").status_code in (401, 403)


@pytest.fixture(scope="module")
def payment_ctx():
    return {}


@pytest.fixture(scope="module")
def created_orders():
    return []
