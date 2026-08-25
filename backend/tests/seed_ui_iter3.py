"""Seed data for iteration-3 UI testing:
 1) a PAID Rx order with rx_status=pending (for pharmacy prescription panel)
 2) a DELIVERED unrated order (for customer rating modal)
Run: python /app/backend/tests/seed_ui_iter3.py
"""
import sys
sys.path.insert(0, "/app/backend/tests")

from conftest import BASE_URL, _client  # noqa
from test_iter3_features import pay_order, _pick_medicine, _place, RX_IMAGE  # noqa

user = _client("user")
pharm = _client("pharmacy")
deliv = _client("delivery")

# 1) paid Rx order, rx pending
med = _pick_medicine(user, True)
o1 = _place(user, med, prescription_image=RX_IMAGE).json()
pay_order(o1["id"])
print("RX_PENDING_ORDER", o1["id"], med["name"])

# 2) delivered unrated order
med2 = _pick_medicine(user, False)
o2 = _place(user, med2).json()
pay_order(o2["id"])
for st in ("accepted", "ready"):
    r = pharm.put(f"{BASE_URL}/api/pharmacy/orders/{o2['id']}/status", json={"status": st})
    assert r.status_code == 200, r.text
for st in ("picked_up", "in_transit", "delivered"):
    r = deliv.put(f"{BASE_URL}/api/delivery/orders/{o2['id']}/status", json={"status": st})
    assert r.status_code == 200, r.text
print("DELIVERED_UNRATED_ORDER", o2["id"], med2["name"])
