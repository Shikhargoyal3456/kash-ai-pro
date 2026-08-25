"""Iteration-3 features: order notifications, prescription verification,
delivery ratings and admin sales breakdown (top-selling medicines)."""
import asyncio
import os
import sys
import pytest
from conftest import BASE_URL

PNG_B64 = ("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8"
           "AAAwAB/AL+cwAAAABJRU5ErkJggg==")
RX_IMAGE = "data:image/png;base64," + PNG_B64

sys.path.insert(0, "/app/backend")


def _server():
    import server  # noqa
    return server


def pay_order(order_id):
    """Invoke the real server-side _mark_order_paid so notifications + stock
    side-effects fire exactly as they do after a Stripe webhook/status poll.
    A fresh motor client is bound per call because each asyncio.run() creates a
    new event loop."""
    from motor.motor_asyncio import AsyncIOMotorClient
    from dotenv import dotenv_values
    srv = _server()
    env = dotenv_values("/app/backend/.env")
    mongo_url = os.environ.get("MONGO_URL") or env.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME") or env.get("DB_NAME")

    async def _run():
        client = AsyncIOMotorClient(mongo_url)
        original = srv.db
        srv.db = client[db_name]
        try:
            await srv._mark_order_paid(order_id)
        finally:
            srv.db = original
            client.close()

    asyncio.run(_run())


def _pick_medicine(user_client, requires_rx):
    r = user_client.get(f"{BASE_URL}/api/user/medicines")
    assert r.status_code == 200
    meds = [m for m in r.json()
            if bool(m.get("requires_prescription")) == requires_rx and m.get("stock", 0) > 2]
    if not meds:
        pytest.fail(f"No medicine with requires_prescription={requires_rx}")
    return meds[0]


def _place(user_client, med, **extra):
    body = {"items": [{"medicine_id": med["id"], "name": med["name"],
                       "price": med["price"], "qty": 1}],
            "address": "TEST_ addr, Pune", "prescription_note": None,
            "prescription_image": None}
    body.update(extra)
    return user_client.post(f"{BASE_URL}/api/user/orders", json=body)


def _notifs(client):
    r = client.get(f"{BASE_URL}/api/notifications")
    assert r.status_code == 200, r.text
    return r.json()


def _has(notifs, order_id, *keywords):
    for n in notifs:
        if n.get("order_id") == order_id and all(k.lower() in n["message"].lower() for k in keywords):
            return True
    return False


@pytest.fixture(scope="module")
def created_orders():
    return []


# ---------------------------------------------------------------------------
# Notifications API
# ---------------------------------------------------------------------------
class TestNotificationsApi:
    def test_requires_auth(self, anon_client):
        assert anon_client.get(f"{BASE_URL}/api/notifications").status_code in (401, 403)
        assert anon_client.put(f"{BASE_URL}/api/notifications/read-all").status_code in (401, 403)

    def test_shape_and_no_mongo_id(self, user_client):
        for n in _notifs(user_client):
            assert "_id" not in n
            assert isinstance(n["id"], str)
            for key in ("message", "kind", "read", "created_at"):
                assert key in n, n

    def test_read_all_clears_unread(self, user_client):
        r = user_client.put(f"{BASE_URL}/api/notifications/read-all")
        assert r.status_code == 200 and r.json().get("ok") is True
        assert all(n["read"] for n in _notifs(user_client))

    def test_mark_single_read(self, user_client, pharmacy_client):
        med = _pick_medicine(user_client, False)
        o = _place(user_client, med)
        assert o.status_code == 200, o.text
        oid = o.json()["id"]
        pay_order(oid)
        notifs = _notifs(user_client)
        target = next((n for n in notifs if not n["read"]), None)
        assert target, "expected an unread notification after payment"
        r = user_client.put(f"{BASE_URL}/api/notifications/{target['id']}/read")
        assert r.status_code == 200
        after = {n["id"]: n["read"] for n in _notifs(user_client)}
        assert after[target["id"]] is True

    def test_cannot_read_other_users_notification(self, user_client, pharmacy_client):
        ph = _notifs(pharmacy_client)
        if not ph:
            pytest.skip("no pharmacy notifications to cross-check")
        nid = ph[0]["id"]
        r = user_client.put(f"{BASE_URL}/api/notifications/{nid}/read")
        assert r.status_code == 200  # no-op update
        assert next(n for n in _notifs(pharmacy_client) if n["id"] == nid)["read"] == ph[0]["read"]

    def test_bad_notification_id_404(self, user_client):
        assert user_client.put(f"{BASE_URL}/api/notifications/not-an-oid/read").status_code == 404


# ---------------------------------------------------------------------------
# Full lifecycle notifications (paid -> accepted -> in_transit -> delivered)
# ---------------------------------------------------------------------------
class TestLifecycleNotifications:
    def test_lifecycle(self, user_client, pharmacy_client, delivery_client, created_orders):
        med = _pick_medicine(user_client, False)
        r = _place(user_client, med)
        assert r.status_code == 200, r.text
        oid = r.json()["id"]
        created_orders.append(oid)

        # unpaid -> hidden from pharmacy
        assert oid not in [o["id"] for o in pharmacy_client.get(f"{BASE_URL}/api/pharmacy/orders").json()]

        pay_order(oid)
        assert _has(_notifs(pharmacy_client), oid, "New paid order"), "pharmacy missing paid-order notification"
        assert _has(_notifs(user_client), oid, "Payment successful")
        assert oid in [o["id"] for o in pharmacy_client.get(f"{BASE_URL}/api/pharmacy/orders").json()]

        assert pharmacy_client.put(f"{BASE_URL}/api/pharmacy/orders/{oid}/status",
                                   json={"status": "accepted"}).status_code == 200
        assert _has(_notifs(user_client), oid, "accepted")

        assert pharmacy_client.put(f"{BASE_URL}/api/pharmacy/orders/{oid}/status",
                                   json={"status": "ready"}).status_code == 200
        assert _has(_notifs(user_client), oid, "ready for pickup")

        assert delivery_client.put(f"{BASE_URL}/api/delivery/orders/{oid}/status",
                                   json={"status": "picked_up"}).status_code == 200
        assert _has(_notifs(user_client), oid, "picked up")

        assert delivery_client.put(f"{BASE_URL}/api/delivery/orders/{oid}/status",
                                   json={"status": "in_transit"}).status_code == 200
        assert _has(_notifs(user_client), oid, "out for delivery")

        assert delivery_client.put(f"{BASE_URL}/api/delivery/orders/{oid}/status",
                                   json={"status": "delivered"}).status_code == 200
        assert _has(_notifs(user_client), oid, "delivered")


# ---------------------------------------------------------------------------
# Prescription verification
# ---------------------------------------------------------------------------
class TestPrescriptionVerification:
    def _paid_rx_order(self, user_client):
        med = _pick_medicine(user_client, True)
        r = _place(user_client, med, prescription_image=RX_IMAGE)
        assert r.status_code == 200, r.text
        o = r.json()
        assert o["rx_status"] == "pending", o
        pay_order(o["id"])
        return o["id"]

    def test_ready_blocked_while_pending_then_allowed_after_approve(self, user_client, pharmacy_client, created_orders):
        oid = self._paid_rx_order(user_client)
        created_orders.append(oid)
        assert pharmacy_client.put(f"{BASE_URL}/api/pharmacy/orders/{oid}/status",
                                   json={"status": "accepted"}).status_code == 200
        blocked = pharmacy_client.put(f"{BASE_URL}/api/pharmacy/orders/{oid}/status", json={"status": "ready"})
        assert blocked.status_code == 400, blocked.text
        assert "prescription" in blocked.json()["detail"].lower()

        ap = pharmacy_client.put(f"{BASE_URL}/api/pharmacy/orders/{oid}/prescription", json={"action": "approve"})
        assert ap.status_code == 200, ap.text
        assert ap.json()["rx_status"] == "approved"
        assert "_id" not in ap.json()
        assert _has(_notifs(user_client), oid, "prescription", "approved")

        ok = pharmacy_client.put(f"{BASE_URL}/api/pharmacy/orders/{oid}/status", json={"status": "ready"})
        assert ok.status_code == 200 and ok.json()["status"] == "ready"

    def test_reject_cancels_order_restocks_and_notifies(self, user_client, pharmacy_client, created_orders):
        med = _pick_medicine(user_client, True)
        before = med["stock"]
        r = _place(user_client, med, prescription_image=RX_IMAGE)
        assert r.status_code == 200
        oid = r.json()["id"]
        created_orders.append(oid)
        pay_order(oid)  # decrements stock by 1

        rej = pharmacy_client.put(f"{BASE_URL}/api/pharmacy/orders/{oid}/prescription", json={"action": "reject"})
        assert rej.status_code == 200, rej.text
        body = rej.json()
        assert body["rx_status"] == "rejected" and body["status"] == "rejected"
        assert _has(_notifs(user_client), oid, "rejected")

        meds = {m["id"]: m for m in user_client.get(f"{BASE_URL}/api/user/medicines").json()}
        assert meds[med["id"]]["stock"] == before, "stock not restored after rejection"

        blocked = pharmacy_client.put(f"{BASE_URL}/api/pharmacy/orders/{oid}/status", json={"status": "ready"})
        assert blocked.status_code == 400

    def test_no_prescription_attached_400(self, user_client, pharmacy_client, created_orders):
        med = _pick_medicine(user_client, False)
        r = _place(user_client, med)
        oid = r.json()["id"]
        created_orders.append(oid)
        pay_order(oid)
        bad = pharmacy_client.put(f"{BASE_URL}/api/pharmacy/orders/{oid}/prescription", json={"action": "approve"})
        assert bad.status_code == 400 and "no prescription" in bad.json()["detail"].lower()

    def test_role_and_validation(self, user_client, pharmacy_client, anon_client, created_orders):
        med = _pick_medicine(user_client, True)
        r = _place(user_client, med, prescription_image=RX_IMAGE)
        oid = r.json()["id"]
        created_orders.append(oid)
        assert user_client.put(f"{BASE_URL}/api/pharmacy/orders/{oid}/prescription",
                               json={"action": "approve"}).status_code == 403
        assert anon_client.put(f"{BASE_URL}/api/pharmacy/orders/{oid}/prescription",
                               json={"action": "approve"}).status_code in (401, 403)
        assert pharmacy_client.put(f"{BASE_URL}/api/pharmacy/orders/{oid}/prescription",
                                   json={"action": "maybe"}).status_code == 422
        assert pharmacy_client.put(f"{BASE_URL}/api/pharmacy/orders/507f1f77bcf86cd799439011/prescription",
                                   json={"action": "approve"}).status_code == 404


# ---------------------------------------------------------------------------
# Delivery ratings
# ---------------------------------------------------------------------------
class TestDeliveryRatings:
    def _delivered_order(self, user_client, pharmacy_client, delivery_client, created_orders):
        med = _pick_medicine(user_client, False)
        oid = _place(user_client, med).json()["id"]
        created_orders.append(oid)
        pay_order(oid)
        for c, st in ((pharmacy_client, "accepted"), (pharmacy_client, "ready")):
            assert c.put(f"{BASE_URL}/api/pharmacy/orders/{oid}/status", json={"status": st}).status_code == 200
        for st in ("picked_up", "in_transit", "delivered"):
            assert delivery_client.put(f"{BASE_URL}/api/delivery/orders/{oid}/status",
                                       json={"status": st}).status_code == 200
        return oid

    def test_rate_non_delivered_400(self, user_client, created_orders):
        med = _pick_medicine(user_client, False)
        oid = _place(user_client, med).json()["id"]
        created_orders.append(oid)
        pay_order(oid)
        r = user_client.post(f"{BASE_URL}/api/user/orders/{oid}/rate",
                             json={"rider_rating": 5, "store_rating": 5})
        assert r.status_code == 400 and "delivered" in r.json()["detail"].lower()

    def test_rate_once_persists_and_second_time_400(self, user_client, pharmacy_client, delivery_client,
                                                    created_orders):
        oid = self._delivered_order(user_client, pharmacy_client, delivery_client, created_orders)
        r = user_client.post(f"{BASE_URL}/api/user/orders/{oid}/rate",
                             json={"rider_rating": 4, "store_rating": 5, "comment": "TEST_ great"})
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["rated"] is True and b["rider_rating"] == 4 and b["store_rating"] == 5
        assert b["rating_comment"] == "TEST_ great"
        assert "_id" not in b

        # persisted
        orders = {o["id"]: o for o in user_client.get(f"{BASE_URL}/api/user/orders").json()}
        assert orders[oid]["rated"] is True and orders[oid]["rider_rating"] == 4

        # notifications to rider & store
        assert _has(_notifs(delivery_client), oid, "4")
        assert _has(_notifs(pharmacy_client), oid, "5")

        # rider stats reflect rating
        stats = delivery_client.get(f"{BASE_URL}/api/delivery/stats")
        assert stats.status_code == 200 and 1 <= stats.json()["rating"] <= 5

        again = user_client.post(f"{BASE_URL}/api/user/orders/{oid}/rate",
                                 json={"rider_rating": 1, "store_rating": 1})
        assert again.status_code == 400 and "already rated" in again.json()["detail"].lower()

    def test_validation_and_roles(self, user_client, pharmacy_client, anon_client, created_orders):
        med = _pick_medicine(user_client, False)
        oid = _place(user_client, med).json()["id"]
        created_orders.append(oid)
        assert user_client.post(f"{BASE_URL}/api/user/orders/{oid}/rate",
                                json={"rider_rating": 0, "store_rating": 3}).status_code == 422
        assert user_client.post(f"{BASE_URL}/api/user/orders/{oid}/rate",
                                json={"rider_rating": 6, "store_rating": 3}).status_code == 422
        assert pharmacy_client.post(f"{BASE_URL}/api/user/orders/{oid}/rate",
                                    json={"rider_rating": 3, "store_rating": 3}).status_code == 403
        assert anon_client.post(f"{BASE_URL}/api/user/orders/{oid}/rate",
                                json={"rider_rating": 3, "store_rating": 3}).status_code in (401, 403)
        assert user_client.post(f"{BASE_URL}/api/user/orders/507f1f77bcf86cd799439011/rate",
                                json={"rider_rating": 3, "store_rating": 3}).status_code == 404


# ---------------------------------------------------------------------------
# Admin sales breakdown
# ---------------------------------------------------------------------------
class TestTopMedicines:
    def test_shape_sorted_and_matches_paid_orders(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/admin/top-medicines")
        assert r.status_code == 200, r.text
        rows = r.json()
        assert isinstance(rows, list) and len(rows) <= 8
        qtys = [row["qty"] for row in rows]
        assert qtys == sorted(qtys, reverse=True), rows
        for row in rows:
            assert isinstance(row["name"], str) and row["qty"] > 0
            assert isinstance(row["revenue"], (int, float))

    def test_reflects_new_paid_order(self, admin_client, user_client, created_orders):
        med = _pick_medicine(user_client, False)
        before = {row["name"]: row["qty"] for row in admin_client.get(f"{BASE_URL}/api/admin/top-medicines").json()}
        oid = _place(user_client, med).json()["id"]
        created_orders.append(oid)
        pay_order(oid)
        after = {row["name"]: row["qty"] for row in admin_client.get(f"{BASE_URL}/api/admin/top-medicines").json()}
        if med["name"] in after:
            assert after[med["name"]] >= before.get(med["name"], 0) + 1
        else:
            pytest.fail(f"{med['name']} missing from top-medicines after a paid order (top8 cutoff?)")

    def test_requires_admin(self, user_client, pharmacy_client, anon_client):
        assert user_client.get(f"{BASE_URL}/api/admin/top-medicines").status_code == 403
        assert pharmacy_client.get(f"{BASE_URL}/api/admin/top-medicines").status_code == 403
        assert anon_client.get(f"{BASE_URL}/api/admin/top-medicines").status_code in (401, 403)
