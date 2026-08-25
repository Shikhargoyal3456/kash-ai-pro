import os
import requests
import pytest
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE_URL = base_url.rstrip("/")

CREDS = {
    "admin": ("shiksgoel85@gmail.com", "KashAdmin@2026"),
    "doctor": ("doctor@kash.ai", "password123"),
    "pharmacy": ("pharmacy@kash.ai", "password123"),
    "delivery": ("delivery@kash.ai", "password123"),
    "user": ("user@kash.ai", "password123"),
}


def _login(role):
    email, password = CREDS[role]
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=60)
    if r.status_code != 200:
        pytest.fail(f"Login failed for {role}: {r.status_code} {r.text[:300]}")
    data = r.json()
    assert "access_token" in data and data["user"]["role"] == role
    return data


def _client(role):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json",
                      "Authorization": f"Bearer {_login(role)['access_token']}"})
    return s


@pytest.fixture(scope="session")
def base_url():
    return BASE_URL


@pytest.fixture(scope="session")
def admin_client():
    return _client("admin")


@pytest.fixture(scope="session")
def doctor_client():
    return _client("doctor")


@pytest.fixture(scope="session")
def pharmacy_client():
    return _client("pharmacy")


@pytest.fixture(scope="session")
def delivery_client():
    return _client("delivery")


@pytest.fixture(scope="session")
def user_client():
    return _client("user")


@pytest.fixture(scope="session")
def anon_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s
