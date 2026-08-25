"""Kash AI Pro backend API tests — auth, doctor, pharmacy, delivery, user, admin, RBAC, lifecycle."""
import time
import pytest
from conftest import BASE_URL, _login, CREDS, mark_order_paid


# --------------------------- Auth module ---------------------------
class TestAuth:
    def test_health(self, anon_client):
        r = anon_client.get(f"{BASE_URL}/api/")
        assert r.status_code == 200
        assert "Kash" in r.json()["message"]

    @pytest.mark.parametrize("role", list(CREDS.keys()))
    def test_login_all_roles(self, role):
        data = _login(role)
        assert data["user"]["email"] == CREDS[role][0]
        assert "password_hash" not in data["user"]
        assert "_id" not in data["user"]
        assert isinstance(data["user"]["id"], str)

    def test_login_bad_password(self, anon_client):
        # use a throwaway account: wrong-password attempts against a demo account
        # would trip the new brute-force lockout and break the whole suite
        email = f"TEST_badpw_{int(time.time())}@example.com"
        reg = anon_client.post(f"{BASE_URL}/api/auth/register", json={
            "name": "TEST BadPw", "email": email, "password": "Secret@123", "role": "user"})
        assert reg.status_code == 200, reg.text[:200]
        r = anon_client.post(f"{BASE_URL}/api/auth/login",
                             json={"email": email, "password": "wrongpass"})
        assert r.status_code == 401
        assert "detail" in r.json()

    def test_login_unknown_email(self, anon_client):
        r = anon_client.post(f"{BASE_URL}/api/auth/login",
                             json={"email": "nobody_kash@example.com", "password": "x"})
        assert r.status_code == 401

    def test_me_requires_token(self, anon_client):
        r = anon_client.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 401

    def test_me_invalid_token(self, anon_client):
        r = anon_client.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": "Bearer garbage"})
        assert r.status_code == 401

    def test_me_returns_user(self, user_client):
        r = user_client.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 200
        assert r.json()["role"] == "user"

    def test_register_customer_and_login(self, anon_client):
        email = f"TEST_cust_{int(time.time()*1000)}@example.com"
        r = anon_client.post(f"{BASE_URL}/api/auth/register", json={
            "name": "TEST_Customer", "email": email, "password": "Secret@123", "role": "user"})
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert data["user"]["role"] == "user"
        assert data["user"]["is_verified"] is True
        assert "access_token" in data
        # duplicate
        r2 = anon_client.post(f"{BASE_URL}/api/auth/register", json={
            "name": "TEST_Customer", "email": email, "password": "Secret@123", "role": "user"})
        assert r2.status_code == 400
        # login works
        r3 = anon_client.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": "Secret@123"})
        assert r3.status_code == 200

    def test_register_invalid_role(self, anon_client):
        r = anon_client.post(f"{BASE_URL}/api/auth/register", json={
            "name": "X", "email": f"TEST_bad_{int(time.time())}@example.com",
            "password": "x", "role": "superuser"})
        assert r.status_code == 422

    def test_register_invalid_email(self, anon_client):
        r = anon_client.post(f"{BASE_URL}/api/auth/register", json={
            "name": "X", "email": "not-an-email", "password": "x", "role": "user"})
        assert r.status_code == 422

    def test_bcrypt_hash_format(self):
        import os, asyncio
        from motor.motor_asyncio import AsyncIOMotorClient
        from dotenv import dotenv_values
        env = dotenv_values("/app/backend/.env")

        async def check():
            c = AsyncIOMotorClient(env["MONGO_URL"])
            u = await c[env["DB_NAME"]].users.find_one({"email": CREDS["admin"][0]})
            c.close()
            return u
        u = asyncio.run(check())
        assert u is not None, "admin not seeded"
        assert u["password_hash"].startswith("$2b$"), f"unexpected hash prefix: {u['password_hash'][:4]}"


# --------------------------- RBAC ---------------------------
class TestRBAC:
    @pytest.mark.parametrize("path", [
        "/api/pharmacy/medicines", "/api/pharmacy/orders", "/api/pharmacy/stats",
        "/api/admin/dashboard", "/api/admin/users", "/api/admin/orders",
        "/api/doctor/consultations", "/api/doctor/stats", "/api/doctor/prescriptions",
        "/api/delivery/orders", "/api/delivery/history", "/api/delivery/stats",
    ])
    def test_customer_forbidden(self, user_client, path):
        r = user_client.get(f"{BASE_URL}{path}")
        assert r.status_code == 403, f"{path} -> {r.status_code}"

    def test_pharmacy_cannot_place_order(self, pharmacy_client):
        r = pharmacy_client.post(f"{BASE_URL}/api/user/orders",
                                 json={"items": [], "address": "x"})
        assert r.status_code == 403

    def test_doctor_cannot_admin(self, doctor_client):
        assert doctor_client.get(f"{BASE_URL}/api/admin/users").status_code == 403

    def test_delivery_cannot_pharmacy(self, delivery_client):
        assert delivery_client.get(f"{BASE_URL}/api/pharmacy/medicines").status_code == 403

    def test_unauthenticated_blocked(self, anon_client):
        for p in ["/api/admin/dashboard", "/api/user/orders", "/api/pharmacy/medicines"]:
            assert anon_client.get(f"{BASE_URL}{p}").status_code == 401


# --------------------------- Pharmacy CRUD ---------------------------
class TestPharmacy:
    def test_seeded_inventory(self, pharmacy_client):
        r = pharmacy_client.get(f"{BASE_URL}/api/pharmacy/medicines")
        assert r.status_code == 200
        meds = r.json()
        assert len(meds) >= 10
        assert all("_id" not in m and "id" in m for m in meds)
        assert any(m["name"] == "Ashwagandha Capsules" for m in meds)

    def test_medicine_crud(self, pharmacy_client):
        payload = {"name": "TEST_Med_Tonic", "category": "Wellness", "description": "test",
                   "price": 99.5, "stock": 25, "requires_prescription": False}
        r = pharmacy_client.post(f"{BASE_URL}/api/pharmacy/medicines", json=payload)
        assert r.status_code == 200, r.text[:300]
        med = r.json()
        mid = med["id"]
        assert med["name"] == payload["name"] and med["price"] == 99.5
        assert med.get("store_name") == "Green Leaf Pharmacy"

        # GET verify persistence
        listed = pharmacy_client.get(f"{BASE_URL}/api/pharmacy/medicines").json()
        found = [m for m in listed if m["id"] == mid]
        assert found and found[0]["stock"] == 25

        # UPDATE
        payload2 = dict(payload, name="TEST_Med_Tonic_v2", price=120.0, stock=30)
        r = pharmacy_client.put(f"{BASE_URL}/api/pharmacy/medicines/{mid}", json=payload2)
        assert r.status_code == 200
        assert r.json()["name"] == "TEST_Med_Tonic_v2" and r.json()["price"] == 120.0
        listed = pharmacy_client.get(f"{BASE_URL}/api/pharmacy/medicines").json()
        found = [m for m in listed if m["id"] == mid]
        assert found[0]["name"] == "TEST_Med_Tonic_v2" and found[0]["stock"] == 30

        # DELETE
        r = pharmacy_client.delete(f"{BASE_URL}/api/pharmacy/medicines/{mid}")
        assert r.status_code == 200
        listed = pharmacy_client.get(f"{BASE_URL}/api/pharmacy/medicines").json()
        assert not [m for m in listed if m["id"] == mid]

    def test_update_nonexistent_medicine(self, pharmacy_client):
        r = pharmacy_client.put(f"{BASE_URL}/api/pharmacy/medicines/000000000000000000000000",
                                json={"name": "x", "price": 1})
        assert r.status_code == 404

    def test_update_invalid_objectid(self, pharmacy_client):
        r = pharmacy_client.put(f"{BASE_URL}/api/pharmacy/medicines/not-an-id",
                                json={"name": "x", "price": 1})
        assert r.status_code in (400, 404, 422), f"got {r.status_code} (500 = unhandled)"

    def test_add_medicine_validation(self, pharmacy_client):
        r = pharmacy_client.post(f"{BASE_URL}/api/pharmacy/medicines", json={"category": "X"})
        assert r.status_code == 422

    def test_stats(self, pharmacy_client):
        r = pharmacy_client.get(f"{BASE_URL}/api/pharmacy/stats")
        assert r.status_code == 200
        d = r.json()
        for k in ["orders", "revenue", "pending", "medicines", "low_stock"]:
            assert k in d


# --------------------------- User browse ---------------------------
class TestUserBrowse:
    def test_browse(self, user_client):
        r = user_client.get(f"{BASE_URL}/api/user/medicines")
        assert r.status_code == 200
        meds = r.json()
        assert len(meds) >= 10
        assert all(m["stock"] > 0 for m in meds)

    def test_search(self, user_client):
        r = user_client.get(f"{BASE_URL}/api/user/medicines", params={"search": "tulsi"})
        assert r.status_code == 200
        res = r.json()
        assert len(res) >= 1
        assert all("tulsi" in m["name"].lower() for m in res)

    def test_category_filter(self, user_client):
        r = user_client.get(f"{BASE_URL}/api/user/medicines", params={"category": "Immunity"})
        assert r.status_code == 200
        assert all(m["category"] == "Immunity" for m in r.json())
        r_all = user_client.get(f"{BASE_URL}/api/user/medicines", params={"category": "All"})
        assert len(r_all.json()) >= len(r.json())

    def test_categories(self, user_client):
        r = user_client.get(f"{BASE_URL}/api/user/categories")
        assert r.status_code == 200
        cats = r.json()
        assert cats[0] == "All" and "Immunity" in cats

    def test_empty_cart_rejected(self, user_client):
        r = user_client.post(f"{BASE_URL}/api/user/orders", json={"items": [], "address": "A"})
        assert r.status_code == 400

    def test_order_bad_medicine_id(self, user_client):
        r = user_client.post(f"{BASE_URL}/api/user/orders", json={
            "items": [{"medicine_id": "000000000000000000000000", "name": "x", "price": 1, "qty": 1}],
            "address": "A"})
        assert r.status_code == 404

    def test_track_nonexistent_order(self, user_client):
        r = user_client.get(f"{BASE_URL}/api/user/orders/000000000000000000000000/track")
        assert r.status_code == 404


# --------------------------- Doctor + AI ---------------------------
class TestDoctor:
    def test_samhita_analyze(self, doctor_client):
        r = doctor_client.post(f"{BASE_URL}/api/doctor/samhita/analyze", json={
            "patient_name": "TEST_Patient", "symptoms": "burning stomach, acidity, poor sleep for 2 weeks"},
            timeout=180)
        assert r.status_code == 200, r.text[:500]
        d = r.json()
        assert d["patient_name"] == "TEST_Patient"
        assert isinstance(d["diagnosis"], str) and len(d["diagnosis"]) > 10, f"empty diagnosis: {d}"
        assert isinstance(d["treatment"], list) and len(d["treatment"]) > 0
        assert isinstance(d["diet"], list) and len(d["diet"]) > 0
        assert isinstance(d["lifestyle"], list) and len(d["lifestyle"]) > 0
        assert "_id" not in d and d["id"]
        # persisted in consultations
        lst = doctor_client.get(f"{BASE_URL}/api/doctor/consultations").json()
        assert any(c["id"] == d["id"] for c in lst)

    def test_samhita_validation(self, doctor_client):
        r = doctor_client.post(f"{BASE_URL}/api/doctor/samhita/analyze", json={"symptoms": "x"})
        assert r.status_code == 422

    def test_prescription_create_and_list(self, doctor_client):
        r = doctor_client.post(f"{BASE_URL}/api/doctor/prescription", json={
            "patient_name": "TEST_Patient", "medicines": "Triphala 1tsp", "instructions": "After dinner"})
        assert r.status_code == 200
        p = r.json()
        assert p["medicines"] == "Triphala 1tsp" and p["id"]
        lst = doctor_client.get(f"{BASE_URL}/api/doctor/prescriptions").json()
        assert any(x["id"] == p["id"] for x in lst)

    def test_doctor_stats(self, doctor_client):
        r = doctor_client.get(f"{BASE_URL}/api/doctor/stats")
        assert r.status_code == 200
        d = r.json()
        assert d["consultations"] >= 1 and d["prescriptions"] >= 1 and d["patients"] >= 1

    def test_voice_requires_audio(self, doctor_client):
        r = doctor_client.post(f"{BASE_URL}/api/doctor/consultation/voice", data={"patient_name": "x"})
        assert r.status_code == 422


# --------------------------- Full lifecycle ---------------------------
class TestOrderLifecycle:
    order_id = None

    def test_01_place_order(self, user_client):
        meds = user_client.get(f"{BASE_URL}/api/user/medicines", params={"search": "Tulsi"}).json()
        med = meds[0]
        stock_before = med["stock"]
        payload = {"items": [{"medicine_id": med["id"], "name": med["name"],
                              "price": med["price"], "qty": 2}],
                   "address": "TEST 42 Baker Street, Pune", "prescription_note": None}
        r = user_client.post(f"{BASE_URL}/api/user/orders", json=payload)
        assert r.status_code == 200, r.text[:300]
        o = r.json()
        TestOrderLifecycle.order_id = o["id"]
        assert o["status"] == "placed"
        assert o["total"] == round(med["price"] * 2, 2)
        assert o["timeline"][0]["status"] == "placed"
        assert o["store_name"] == "Green Leaf Pharmacy"
        assert o["payment_status"] == "pending"
        # stock is reserved only AFTER payment, so it stays unchanged at placement
        after = user_client.get(f"{BASE_URL}/api/user/medicines", params={"search": "Tulsi"}).json()[0]
        assert after["stock"] == stock_before

        # visible in my orders + track
        mine = user_client.get(f"{BASE_URL}/api/user/orders").json()
        assert any(x["id"] == o["id"] for x in mine)
        t = user_client.get(f"{BASE_URL}/api/user/orders/{o['id']}/track")
        assert t.status_code == 200 and t.json()["status"] == "placed"

    def test_02_pharmacy_sees_and_accepts(self, pharmacy_client):
        oid = TestOrderLifecycle.order_id
        assert oid
        # payment gating (iteration 2): unpaid orders are hidden from the pharmacy
        orders = pharmacy_client.get(f"{BASE_URL}/api/pharmacy/orders").json()
        assert not any(x["id"] == oid for x in orders), "unpaid order leaked to pharmacy"
        mark_order_paid(oid)
        orders = pharmacy_client.get(f"{BASE_URL}/api/pharmacy/orders").json()
        assert any(x["id"] == oid for x in orders), "order not visible to pharmacy"
        r = pharmacy_client.put(f"{BASE_URL}/api/pharmacy/orders/{oid}/status", json={"status": "accepted"})
        assert r.status_code == 200
        assert r.json()["status"] == "accepted"

    def test_03_pharmacy_ready(self, pharmacy_client):
        oid = TestOrderLifecycle.order_id
        r = pharmacy_client.put(f"{BASE_URL}/api/pharmacy/orders/{oid}/status", json={"status": "ready"})
        assert r.status_code == 200 and r.json()["status"] == "ready"
        assert [t["status"] for t in r.json()["timeline"]] == ["placed", "accepted", "ready"]

    def test_04_delivery_sees_available(self, delivery_client):
        oid = TestOrderLifecycle.order_id
        r = delivery_client.get(f"{BASE_URL}/api/delivery/orders")
        assert r.status_code == 200
        d = r.json()
        assert any(x["id"] == oid for x in d["available"]), "ready order not in delivery available list"

    def test_05_pickup_transit_deliver(self, delivery_client):
        oid = TestOrderLifecycle.order_id
        for st in ["picked_up", "in_transit", "delivered"]:
            r = delivery_client.put(f"{BASE_URL}/api/delivery/orders/{oid}/status", json={"status": st})
            assert r.status_code == 200, r.text[:300]
            assert r.json()["status"] == st
        o = r.json()
        assert o["delivery_boy_name"] == "Ravi Kumar"
        hist = delivery_client.get(f"{BASE_URL}/api/delivery/history").json()
        assert any(x["id"] == oid for x in hist)
        stats = delivery_client.get(f"{BASE_URL}/api/delivery/stats").json()
        assert stats["delivered"] >= 1 and stats["earnings"] == stats["delivered"] * 40

    def test_06_customer_sees_delivered(self, user_client):
        oid = TestOrderLifecycle.order_id
        t = user_client.get(f"{BASE_URL}/api/user/orders/{oid}/track").json()
        assert t["status"] == "delivered"
        assert [x["status"] for x in t["timeline"]] == [
            "placed", "accepted", "ready", "picked_up", "in_transit", "delivered"]

    def test_07_pharmacy_revenue_reflects(self, pharmacy_client):
        s = pharmacy_client.get(f"{BASE_URL}/api/pharmacy/stats").json()
        assert s["revenue"] > 0

    def test_08_other_pharmacy_cannot_change_foreign_order(self, pharmacy_client):
        r = pharmacy_client.put(f"{BASE_URL}/api/pharmacy/orders/000000000000000000000000/status",
                                json={"status": "accepted"})
        assert r.status_code == 404

    def test_09_invalid_status_value_rejected(self, pharmacy_client):
        """Backend should not accept arbitrary status strings."""
        oid = TestOrderLifecycle.order_id
        r = pharmacy_client.put(f"{BASE_URL}/api/pharmacy/orders/{oid}/status",
                                json={"status": "banana"})
        assert r.status_code in (400, 422), f"arbitrary status accepted -> {r.status_code}"


# --------------------------- Admin ---------------------------
class TestAdmin:
    def test_dashboard(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/admin/dashboard")
        assert r.status_code == 200
        d = r.json()
        assert d["users"] >= 5 and d["medicines"] >= 10
        assert set(["doctor", "pharmacy", "delivery", "user", "admin"]).issubset(d["by_role"].keys())
        assert isinstance(d["order_status"], dict)
        assert "consultations" in d and "revenue" in d

    def test_users_list_no_hash(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/admin/users")
        assert r.status_code == 200
        users = r.json()
        assert all("password_hash" not in u and "_id" not in u and "id" in u for u in users)

    def test_orders_list(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/admin/orders")
        assert r.status_code == 200
        assert all("_id" not in o for o in r.json())

    def test_block_unblock_and_verify(self, admin_client, anon_client):
        # create a throwaway user to block
        email = f"TEST_block_{int(time.time()*1000)}@example.com"
        reg = anon_client.post(f"{BASE_URL}/api/auth/register", json={
            "name": "TEST_Block", "email": email, "password": "Secret@123", "role": "pharmacy"})
        assert reg.status_code == 200
        uid = reg.json()["user"]["id"]
        assert reg.json()["user"]["is_verified"] is False  # pharmacy needs verification

        # verify
        r = admin_client.put(f"{BASE_URL}/api/admin/users/{uid}/status", json={"is_verified": True})
        assert r.status_code == 200 and r.json()["is_verified"] is True

        # block
        r = admin_client.put(f"{BASE_URL}/api/admin/users/{uid}/status", json={"is_blocked": True})
        assert r.status_code == 200 and r.json()["is_blocked"] is True
        # blocked user cannot login
        lr = anon_client.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": "Secret@123"})
        assert lr.status_code == 403

        # unblock
        r = admin_client.put(f"{BASE_URL}/api/admin/users/{uid}/status", json={"is_blocked": False})
        assert r.status_code == 200 and r.json()["is_blocked"] is False
        lr = anon_client.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": "Secret@123"})
        assert lr.status_code == 200
        # persisted in list
        users = admin_client.get(f"{BASE_URL}/api/admin/users").json()
        u = [x for x in users if x["id"] == uid][0]
        assert u["is_blocked"] is False and u["is_verified"] is True

    def test_status_no_changes(self, admin_client):
        users = admin_client.get(f"{BASE_URL}/api/admin/users").json()
        uid = users[0]["id"]
        r = admin_client.put(f"{BASE_URL}/api/admin/users/{uid}/status", json={})
        assert r.status_code == 400

    def test_bulk_medicines_validation(self, admin_client):
        r = admin_client.post(f"{BASE_URL}/api/admin/medicines/bulk", json=[{"category": "x"}])
        assert r.status_code == 422


# --------------------------- Security posture ---------------------------
class TestSecurity:
    def test_brute_force_lockout(self, anon_client):
        """5+ wrong passwords should lock/rate-limit the account (429/423).
        Uses a throwaway email so demo accounts are never locked out."""
        email = f"TEST_lock_{int(time.time())}@example.com"
        anon_client.post(f"{BASE_URL}/api/auth/register", json={
            "name": "TEST Lock", "email": email, "password": "Secret@123", "role": "user"})
        codes = []
        for _ in range(6):
            r = anon_client.post(f"{BASE_URL}/api/auth/login",
                                 json={"email": email, "password": "badpass!"})
            codes.append(r.status_code)
        assert any(c in (423, 429) for c in codes), f"no lockout/rate-limit: {codes}"

    def test_cors_credentials_config(self, anon_client):
        r = anon_client.options(f"{BASE_URL}/api/auth/login", headers={
            "Origin": "https://evil.example.com",
            "Access-Control-Request-Method": "POST"})
        acao = r.headers.get("access-control-allow-origin")
        acac = r.headers.get("access-control-allow-credentials")
        assert not (acao == "*" and acac == "true"), \
            f"wildcard origin with credentials=true (ACAO={acao}, ACAC={acac})"
