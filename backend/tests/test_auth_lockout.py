"""Auth playbook checks: brute-force lockout uses a throwaway email only."""
import uuid
import requests
from conftest import BASE_URL


def _clear(email):
    from pymongo import MongoClient
    from dotenv import dotenv_values
    env = dotenv_values("/app/backend/.env")
    db = MongoClient(env["MONGO_URL"])[env["DB_NAME"]]
    db.login_attempts.delete_many({"email": email})


def test_bruteforce_lockout_after_5_fails():
    email = f"TEST_throwaway_{uuid.uuid4().hex[:8]}@example.com"
    codes = []
    try:
        for _ in range(6):
            r = requests.post(f"{BASE_URL}/api/auth/login",
                              json={"email": email, "password": "wrong-pass"}, timeout=30)
            codes.append(r.status_code)
        assert codes[:5] == [401] * 5, codes
        assert codes[5] == 429, codes
    finally:
        _clear(email)


def test_bcrypt_hash_never_returned_by_api():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": "user@kash.ai", "password": "password123"}, timeout=30)
    assert r.status_code == 200
    body = r.json()
    assert "password_hash" not in body["user"] and "password" not in body["user"]
    me = requests.get(f"{BASE_URL}/api/auth/me",
                      headers={"Authorization": f"Bearer {body['access_token']}"}, timeout=30)
    assert me.status_code == 200 and "password_hash" not in me.json()
