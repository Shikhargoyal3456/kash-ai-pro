from dotenv import load_dotenv
from pathlib import Path
import os

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, HTTPException, Request, Depends, UploadFile, File, Form
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr, BeforeValidator
from typing import List, Optional, Annotated, Literal
from bson import ObjectId
from datetime import datetime, timezone, timedelta
import logging
import bcrypt
import jwt
import json
import tempfile
import random
import httpx
from fastapi.responses import JSONResponse

# ---------------------------------------------------------------------------
# DB setup
# ---------------------------------------------------------------------------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = "HS256"
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY')
STRIPE_API_KEY = os.environ.get('STRIPE_API_KEY', 'sk_test_emergent')

app = FastAPI(title="Kash AI")
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("kash")

PyObjectId = Annotated[str, BeforeValidator(str)]

def to_oid(value: str) -> ObjectId:
    if not ObjectId.is_valid(value):
        raise HTTPException(status_code=404, detail="Resource not found")
    return ObjectId(value)

ORDER_TRANSITIONS = {
    "placed": {"accepted", "rejected"},
    "accepted": {"ready"},
    "ready": {"picked_up"},
    "picked_up": {"in_transit"},
    "in_transit": {"delivered"},
}

async def _notify(user_id, message, kind="info", order_id=None):
    if not user_id or not ObjectId.is_valid(str(user_id)):
        return
    await db.notifications.insert_one({
        "user_id": str(user_id), "message": message, "kind": kind, "order_id": order_id,
        "read": False, "created_at": datetime.now(timezone.utc).isoformat()})

# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False

def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id, "email": email, "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(days=7), "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def public_user(doc: dict) -> dict:
    doc = dict(doc)
    doc["id"] = str(doc.pop("_id"))
    doc.pop("password_hash", None)
    return doc

async def get_current_user(request: Request) -> dict:
    token = None
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
    if not token:
        token = request.cookies.get("session_token") or request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    # 1) Emergent/Google session token (opaque, stored in user_sessions)
    session = await db.user_sessions.find_one({"session_token": token})
    if session:
        expires_at = session.get("expires_at")
        if isinstance(expires_at, str):
            expires_at = datetime.fromisoformat(expires_at)
        if expires_at and expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at and expires_at < datetime.now(timezone.utc):
            raise HTTPException(status_code=401, detail="Session expired")
        user = await db.users.find_one({"_id": ObjectId(session["user_id"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        if user.get("is_blocked"):
            raise HTTPException(status_code=403, detail="Account is blocked")
        return user
    # 2) JWT (email/password login)
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        if user.get("is_blocked"):
            raise HTTPException(status_code=403, detail="Account is blocked")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

def require_roles(*roles):
    async def checker(user: dict = Depends(get_current_user)) -> dict:
        if user.get("role") not in roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user
    return checker

# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------
Role = Literal["doctor", "pharmacy", "delivery", "user", "admin"]

class RegisterRequest(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: Role
    # optional role-specific
    specialization: Optional[str] = None
    clinic_name: Optional[str] = None
    store_name: Optional[str] = None
    address: Optional[str] = None
    license_number: Optional[str] = None
    vehicle_type: Optional[str] = None

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class MedicineIn(BaseModel):
    name: str
    category: str = "General"
    description: str = ""
    price: float
    stock: int = 0
    requires_prescription: bool = False
    image: Optional[str] = None

class OrderItem(BaseModel):
    medicine_id: str
    name: str
    price: float
    qty: int

class OrderIn(BaseModel):
    items: List[OrderItem]
    address: str
    prescription_note: Optional[str] = None
    prescription_image: Optional[str] = None

class OrderStatusIn(BaseModel):
    status: Literal["accepted", "rejected", "ready", "picked_up", "in_transit", "delivered"]

class SamhitaIn(BaseModel):
    patient_name: str
    symptoms: str

class PrescriptionIn(BaseModel):
    patient_name: str
    medicines: str
    instructions: str

class UserStatusIn(BaseModel):
    is_blocked: Optional[bool] = None
    is_verified: Optional[bool] = None

# ---------------------------------------------------------------------------
# LLM helpers
# ---------------------------------------------------------------------------
async def llm_analyze(system: str, prompt: str) -> str:
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"kash-{datetime.now().timestamp()}",
                   system_message=system).with_model("openai", "gpt-5.4")
    return await chat.send_message(UserMessage(text=prompt))

def extract_json(text: str) -> dict:
    try:
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1:
            return json.loads(text[start:end + 1])
    except Exception:
        pass
    return {}

# ---------------------------------------------------------------------------
# Auth routes
# ---------------------------------------------------------------------------
@api_router.post("/auth/register")
async def register(body: RegisterRequest):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    doc = {
        "name": body.name, "email": email, "password_hash": hash_password(body.password),
        "role": body.role, "is_verified": body.role in ("user", "doctor"),
        "is_blocked": False, "created_at": datetime.now(timezone.utc).isoformat(),
        "profile": {
            "specialization": body.specialization, "clinic_name": body.clinic_name,
            "store_name": body.store_name, "address": body.address,
            "license_number": body.license_number, "vehicle_type": body.vehicle_type,
            "is_available": True, "rating": 5.0,
        },
    }
    res = await db.users.insert_one(doc)
    doc["_id"] = res.inserted_id
    token = create_access_token(str(res.inserted_id), email, body.role)
    return {"access_token": token, "user": public_user(doc)}

@api_router.post("/auth/login")
async def login(body: LoginRequest):
    email = body.email.lower()
    attempt = await db.login_attempts.find_one({"email": email})
    now = datetime.now(timezone.utc)
    if attempt and attempt.get("count", 0) >= 5:
        locked_until = attempt.get("locked_until")
        if locked_until and now < datetime.fromisoformat(locked_until):
            raise HTTPException(status_code=429, detail="Too many failed attempts. Try again in 15 minutes.")
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        count = (attempt.get("count", 0) if attempt else 0) + 1
        update = {"count": count, "updated_at": now.isoformat()}
        if count >= 5:
            update["locked_until"] = (now + timedelta(minutes=15)).isoformat()
        await db.login_attempts.update_one({"email": email}, {"$set": update}, upsert=True)
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if user.get("is_blocked"):
        raise HTTPException(status_code=403, detail="Your account has been blocked by admin")
    await db.login_attempts.delete_one({"email": email})
    token = create_access_token(str(user["_id"]), email, user["role"])
    return {"access_token": token, "user": public_user(user)}

@api_router.post("/auth/logout")
async def logout(request: Request):
    auth_header = request.headers.get("Authorization", "")
    token = auth_header[7:] if auth_header.startswith("Bearer ") else request.cookies.get("session_token")
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    resp = JSONResponse({"message": "Logged out"})
    resp.delete_cookie("session_token", path="/")
    return resp

@api_router.post("/auth/google-session")
async def google_session(request: Request):
    session_id = request.headers.get("X-Session-ID")
    if not session_id:
        raise HTTPException(status_code=400, detail="Missing X-Session-ID")
    try:
        async with httpx.AsyncClient(timeout=15) as http:
            r = await http.get(
                "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                headers={"X-Session-ID": session_id})
    except Exception:
        raise HTTPException(status_code=502, detail="Auth service unavailable")
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid or expired Google session")
    data = r.json()
    email = (data.get("email") or "").lower()
    if not email:
        raise HTTPException(status_code=400, detail="Google account has no email")
    user = await db.users.find_one({"email": email})
    if user is None:
        res = await db.users.insert_one({
            "name": data.get("name") or email, "email": email, "password_hash": "",
            "role": "user", "is_verified": True, "is_blocked": False,
            "auth_provider": "google", "picture": data.get("picture"),
            "created_at": datetime.now(timezone.utc).isoformat(), "profile": {},
        })
        user = await db.users.find_one({"_id": res.inserted_id})
    elif data.get("picture") and not user.get("picture"):
        await db.users.update_one({"_id": user["_id"]}, {"$set": {"picture": data.get("picture")}})
    if user.get("is_blocked"):
        raise HTTPException(status_code=403, detail="Your account has been blocked by admin")
    session_token = data["session_token"]
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.update_one(
        {"session_token": session_token},
        {"$set": {"session_token": session_token, "user_id": str(user["_id"]),
                  "expires_at": expires_at.isoformat(),
                  "created_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True)
    resp = JSONResponse({"access_token": session_token, "user": public_user(user)})
    resp.set_cookie("session_token", session_token, httponly=True, secure=True,
                    samesite="none", path="/", max_age=7 * 24 * 3600)
    return resp

@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return public_user(user)

# ---------------------------------------------------------------------------
# Doctor routes
# ---------------------------------------------------------------------------
SAMHITA_SYSTEM = (
    "You are an expert Ayurvedic physician trained in classical Samhitas (Charaka, Sushruta). "
    "Given patient symptoms, return a JSON object with keys: diagnosis (string, mention likely dosha imbalance "
    "and probable condition), treatment (array of strings, herbal/ayurvedic remedies), diet (array of strings, "
    "foods to favour and avoid), lifestyle (array of strings, daily routine/yoga recommendations). "
    "Keep it practical and safe. Respond with ONLY the JSON object."
)

@api_router.post("/doctor/consultation/voice")
async def voice_consultation(
    audio: UploadFile = File(...),
    patient_name: str = Form("Unknown Patient"),
    user: dict = Depends(require_roles("doctor")),
):
    from emergentintegrations.llm.openai.speech_to_text import OpenAISpeechToText
    suffix = Path(audio.filename or "audio.webm").suffix or ".webm"
    data = await audio.read()
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    tmp.write(data)
    tmp.close()
    try:
        stt = OpenAISpeechToText(api_key=EMERGENT_LLM_KEY)
        result = await stt.transcribe(file=tmp.name, model="whisper-1", response_format="text", language="hi")
        transcript = result if isinstance(result, str) else getattr(result, "text", str(result))
    except Exception as e:
        logger.exception("transcription failed")
        raise HTTPException(status_code=500, detail=f"Transcription failed: {e}")
    finally:
        os.unlink(tmp.name)

    try:
        raw = await llm_analyze(SAMHITA_SYSTEM, f"Patient: {patient_name}\nSpoken complaint (Hindi): {transcript}")
        analysis = extract_json(raw)
    except Exception as e:
        logger.exception("analysis failed")
        analysis = {}

    doc = {
        "doctor_id": str(user["_id"]), "doctor_name": user["name"], "patient_name": patient_name,
        "transcript": transcript, "diagnosis": analysis.get("diagnosis", ""),
        "treatment": analysis.get("treatment", []), "diet": analysis.get("diet", []),
        "lifestyle": analysis.get("lifestyle", []), "created_at": datetime.now(timezone.utc).isoformat(),
    }
    res = await db.consultations.insert_one(doc)
    doc["id"] = str(res.inserted_id)
    doc.pop("_id", None)
    return doc

@api_router.post("/doctor/samhita/analyze")
async def samhita_analyze(body: SamhitaIn, user: dict = Depends(require_roles("doctor"))):
    raw = await llm_analyze(SAMHITA_SYSTEM, f"Patient: {body.patient_name}\nSymptoms: {body.symptoms}")
    analysis = extract_json(raw)
    doc = {
        "doctor_id": str(user["_id"]), "doctor_name": user["name"], "patient_name": body.patient_name,
        "transcript": body.symptoms, "diagnosis": analysis.get("diagnosis", ""),
        "treatment": analysis.get("treatment", []), "diet": analysis.get("diet", []),
        "lifestyle": analysis.get("lifestyle", []), "created_at": datetime.now(timezone.utc).isoformat(),
    }
    res = await db.consultations.insert_one(doc)
    doc["id"] = str(res.inserted_id)
    doc.pop("_id", None)
    return doc

@api_router.get("/doctor/consultations")
async def doctor_consultations(user: dict = Depends(require_roles("doctor"))):
    docs = await db.consultations.find({"doctor_id": str(user["_id"])}).sort("created_at", -1).to_list(200)
    for d in docs:
        d["id"] = str(d.pop("_id"))
    return docs

@api_router.post("/doctor/prescription")
async def create_prescription(body: PrescriptionIn, user: dict = Depends(require_roles("doctor"))):
    doc = {
        "doctor_id": str(user["_id"]), "doctor_name": user["name"], "patient_name": body.patient_name,
        "medicines": body.medicines, "instructions": body.instructions,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    res = await db.prescriptions.insert_one(doc)
    doc["id"] = str(res.inserted_id)
    doc.pop("_id", None)
    return doc

@api_router.get("/doctor/prescriptions")
async def doctor_prescriptions(user: dict = Depends(require_roles("doctor"))):
    docs = await db.prescriptions.find({"doctor_id": str(user["_id"])}).sort("created_at", -1).to_list(200)
    for d in docs:
        d["id"] = str(d.pop("_id"))
    return docs

@api_router.get("/doctor/stats")
async def doctor_stats(user: dict = Depends(require_roles("doctor"))):
    did = str(user["_id"])
    consultations = await db.consultations.count_documents({"doctor_id": did})
    prescriptions = await db.prescriptions.count_documents({"doctor_id": did})
    patients = len(await db.consultations.distinct("patient_name", {"doctor_id": did}))
    return {"consultations": consultations, "prescriptions": prescriptions, "patients": patients}

# ---------------------------------------------------------------------------
# Pharmacy routes
# ---------------------------------------------------------------------------
@api_router.get("/pharmacy/medicines")
async def pharmacy_medicines(user: dict = Depends(require_roles("pharmacy"))):
    docs = await db.medicines.find({"store_id": str(user["_id"])}).sort("name", 1).to_list(500)
    for d in docs:
        d["id"] = str(d.pop("_id"))
    return docs

@api_router.post("/pharmacy/medicines")
async def add_medicine(body: MedicineIn, user: dict = Depends(require_roles("pharmacy"))):
    doc = body.model_dump()
    doc["store_id"] = str(user["_id"])
    doc["store_name"] = user.get("profile", {}).get("store_name") or user["name"]
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    res = await db.medicines.insert_one(doc)
    doc["id"] = str(res.inserted_id)
    doc.pop("_id", None)
    return doc

@api_router.put("/pharmacy/medicines/{mid}")
async def update_medicine(mid: str, body: MedicineIn, user: dict = Depends(require_roles("pharmacy"))):
    r = await db.medicines.update_one(
        {"_id": to_oid(mid), "store_id": str(user["_id"])}, {"$set": body.model_dump()})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Medicine not found")
    doc = await db.medicines.find_one({"_id": to_oid(mid)})
    doc["id"] = str(doc.pop("_id"))
    return doc

@api_router.delete("/pharmacy/medicines/{mid}")
async def delete_medicine(mid: str, user: dict = Depends(require_roles("pharmacy"))):
    await db.medicines.delete_one({"_id": to_oid(mid), "store_id": str(user["_id"])})
    return {"message": "deleted"}

@api_router.get("/pharmacy/orders")
async def pharmacy_orders(user: dict = Depends(require_roles("pharmacy"))):
    docs = await db.orders.find(
        {"store_id": str(user["_id"]), "payment_status": {"$ne": "pending"}}).sort("created_at", -1).to_list(500)
    for d in docs:
        d["id"] = str(d.pop("_id"))
    return docs

@api_router.put("/pharmacy/orders/{oid}/status")
async def pharmacy_order_status(oid: str, body: OrderStatusIn, user: dict = Depends(require_roles("pharmacy"))):
    order = await db.orders.find_one({"_id": to_oid(oid), "store_id": str(user["_id"])})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if body.status == "ready" and order.get("rx_status") == "pending":
        raise HTTPException(status_code=400, detail="Approve the prescription before marking this order ready")
    if body.status == "ready" and order.get("rx_status") == "rejected":
        raise HTTPException(status_code=400, detail="Prescription was rejected for this order")
    await _advance_order(oid, body.status)
    if body.status == "accepted":
        await _notify(order["user_id"], "Your order was accepted by the pharmacy", "order", oid)
    elif body.status == "ready":
        await _notify(order["user_id"], "Your order is packed and ready for pickup", "order", oid)
    elif body.status == "rejected":
        if order.get("payment_status") == "paid":
            for it in order.get("items", []):
                await db.medicines.update_one({"_id": to_oid(it["medicine_id"])}, {"$inc": {"stock": it["qty"]}})
        await _notify(order["user_id"], "Sorry, your order was rejected by the pharmacy", "warning", oid)
    return await _get_order(oid)

@api_router.get("/pharmacy/stats")
async def pharmacy_stats(user: dict = Depends(require_roles("pharmacy"))):
    sid = str(user["_id"])
    orders = await db.orders.find({"store_id": sid}).to_list(1000)
    revenue = sum(o.get("total", 0) for o in orders if o.get("payment_status") == "paid")
    pending = len([o for o in orders if o.get("status") == "placed"])
    medicines = await db.medicines.count_documents({"store_id": sid})
    low_stock = await db.medicines.count_documents({"store_id": sid, "stock": {"$lt": 10}})
    return {"orders": len(orders), "revenue": round(revenue, 2), "pending": pending,
            "medicines": medicines, "low_stock": low_stock}

# ---------------------------------------------------------------------------
# Delivery routes
# ---------------------------------------------------------------------------
@api_router.get("/delivery/orders")
async def delivery_orders(user: dict = Depends(require_roles("delivery"))):
    did = str(user["_id"])
    available = await db.orders.find(
        {"status": "ready", "delivery_boy_id": None}).sort("created_at", -1).to_list(200)
    mine = await db.orders.find(
        {"delivery_boy_id": did, "status": {"$in": ["picked_up", "in_transit"]}}).sort("created_at", -1).to_list(200)
    for d in available + mine:
        d["id"] = str(d.pop("_id"))
    return {"available": available, "active": mine}

@api_router.put("/delivery/orders/{oid}/status")
async def delivery_order_status(oid: str, body: OrderStatusIn, user: dict = Depends(require_roles("delivery"))):
    did = str(user["_id"])
    order = await db.orders.find_one({"_id": to_oid(oid)})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if body.status == "picked_up":
        if order.get("delivery_boy_id") not in (None, did):
            raise HTTPException(status_code=403, detail="Order already assigned to another rider")
        if order.get("delivery_boy_id") is None:
            await db.orders.update_one({"_id": to_oid(oid)},
                                       {"$set": {"delivery_boy_id": did, "delivery_boy_name": user["name"]}})
    elif order.get("delivery_boy_id") != did:
        raise HTTPException(status_code=403, detail="This delivery is not assigned to you")
    await _advance_order(oid, body.status)
    if body.status == "picked_up":
        await _notify(order["user_id"], f"{user['name']} picked up your order", "order", oid)
    elif body.status == "in_transit":
        await _notify(order["user_id"], "Your order is out for delivery", "order", oid)
    elif body.status == "delivered":
        await db.orders.update_one({"_id": to_oid(oid)}, {"$set": {"rider_location": None}})
        await _notify(order["user_id"], "Your order was delivered — please rate your experience", "success", oid)
    return await _get_order(oid)

@api_router.get("/delivery/history")
async def delivery_history(user: dict = Depends(require_roles("delivery"))):
    docs = await db.orders.find(
        {"delivery_boy_id": str(user["_id"]), "status": "delivered"}).sort("created_at", -1).to_list(200)
    for d in docs:
        d["id"] = str(d.pop("_id"))
    return docs

@api_router.get("/delivery/stats")
async def delivery_stats(user: dict = Depends(require_roles("delivery"))):
    did = str(user["_id"])
    delivered = await db.orders.find({"delivery_boy_id": did, "status": "delivered"}).to_list(1000)
    active = await db.orders.count_documents(
        {"delivery_boy_id": did, "status": {"$in": ["picked_up", "in_transit"]}})
    earnings = round(len(delivered) * 40, 2)
    rated = [o["rider_rating"] for o in delivered if o.get("rider_rating")]
    rating = round(sum(rated) / len(rated), 1) if rated else 5.0
    return {"delivered": len(delivered), "active": active, "earnings": earnings, "rating": rating}

# ---------------------------------------------------------------------------
# User routes
# ---------------------------------------------------------------------------
@api_router.get("/user/medicines")
async def browse_medicines(search: str = "", category: str = "", user: dict = Depends(get_current_user)):
    query = {"stock": {"$gt": 0}}
    if search:
        query["name"] = {"$regex": search, "$options": "i"}
    if category and category != "All":
        query["category"] = category
    docs = await db.medicines.find(query).sort("name", 1).to_list(500)
    for d in docs:
        d["id"] = str(d.pop("_id"))
    return docs

@api_router.get("/user/categories")
async def categories(user: dict = Depends(get_current_user)):
    cats = await db.medicines.distinct("category")
    return ["All"] + sorted([c for c in cats if c])

@api_router.post("/user/orders")
async def place_order(body: OrderIn, user: dict = Depends(require_roles("user"))):
    if not body.items:
        raise HTTPException(status_code=400, detail="Cart is empty")
    db_meds = {}
    for it in body.items:
        med = await db.medicines.find_one({"_id": to_oid(it.medicine_id)})
        if not med:
            raise HTTPException(status_code=404, detail=f"Medicine not found: {it.name}")
        if it.qty < 1:
            raise HTTPException(status_code=400, detail="Invalid quantity")
        if med.get("stock", 0) < it.qty:
            raise HTTPException(status_code=400, detail=f"Only {med.get('stock', 0)} left of {med['name']}")
        if med.get("requires_prescription") and not (body.prescription_image or (body.prescription_note or "").strip()):
            raise HTTPException(status_code=400, detail=f"{med['name']} requires a prescription upload")
        db_meds[it.medicine_id] = med
    store_ids = {m["store_id"] for m in db_meds.values()}
    if len(store_ids) > 1:
        raise HTTPException(status_code=400, detail="Please order from one pharmacy at a time")
    store = next(iter(db_meds.values()))
    items = []
    total = 0.0
    for it in body.items:
        med = db_meds[it.medicine_id]
        price = float(med["price"])
        total += price * it.qty
        items.append({"medicine_id": it.medicine_id, "name": med["name"], "price": price, "qty": it.qty})
    total = round(total, 2)
    now = datetime.now(timezone.utc).isoformat()
    needs_rx = any(m.get("requires_prescription") for m in db_meds.values())
    base_lat, base_lng = 18.5204, 73.8567
    store_loc = {"lat": base_lat, "lng": base_lng}
    dest_loc = {"lat": round(base_lat + random.uniform(-0.045, 0.045), 5),
                "lng": round(base_lng + random.uniform(-0.045, 0.045), 5)}
    doc = {
        "user_id": str(user["_id"]), "user_name": user["name"],
        "store_id": store["store_id"], "store_name": store.get("store_name", ""),
        "delivery_boy_id": None, "delivery_boy_name": None,
        "items": items, "total": total,
        "address": body.address, "prescription_note": body.prescription_note,
        "prescription_image": body.prescription_image,
        "rx_status": "pending" if needs_rx else None,
        "rated": False, "rider_rating": None, "store_rating": None, "rating_comment": None,
        "payment_status": "pending",
        "store_location": store_loc, "dest_location": dest_loc, "rider_location": None,
        "status": "placed", "created_at": now,
        "timeline": [{"status": "placed", "at": now}],
    }
    res = await db.orders.insert_one(doc)
    doc["id"] = str(res.inserted_id)
    doc.pop("_id", None)
    return doc

@api_router.get("/user/orders")
async def my_orders(user: dict = Depends(require_roles("user"))):
    docs = await db.orders.find({"user_id": str(user["_id"])}).sort("created_at", -1).to_list(200)
    for d in docs:
        d["id"] = str(d.pop("_id"))
    return docs

@api_router.get("/user/orders/{oid}/track")
async def track_order(oid: str, user: dict = Depends(require_roles("user"))):
    order = await db.orders.find_one({"_id": to_oid(oid), "user_id": str(user["_id"])})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    order["id"] = str(order.pop("_id"))
    return order

# ---------------------------------------------------------------------------
# Admin routes
# ---------------------------------------------------------------------------
@api_router.get("/admin/dashboard")
async def admin_dashboard(user: dict = Depends(require_roles("admin"))):
    users = await db.users.count_documents({})
    orders = await db.orders.find({}).to_list(5000)
    revenue = round(sum(o.get("total", 0) for o in orders if o.get("payment_status") == "paid"), 2)
    medicines = await db.medicines.count_documents({})
    by_role = {}
    for r in ["doctor", "pharmacy", "delivery", "user", "admin"]:
        by_role[r] = await db.users.count_documents({"role": r})
    status_counts = {}
    for o in orders:
        status_counts[o.get("status", "?")] = status_counts.get(o.get("status", "?"), 0) + 1
    return {"users": users, "orders": len(orders), "revenue": revenue, "medicines": medicines,
            "by_role": by_role, "order_status": status_counts,
            "consultations": await db.consultations.count_documents({})}

@api_router.get("/admin/users")
async def admin_users(user: dict = Depends(require_roles("admin"))):
    docs = await db.users.find({}).sort("created_at", -1).to_list(1000)
    return [public_user(d) for d in docs]

@api_router.put("/admin/users/{uid}/status")
async def admin_user_status(uid: str, body: UserStatusIn, user: dict = Depends(require_roles("admin"))):
    updates = {}
    if body.is_blocked is not None:
        updates["is_blocked"] = body.is_blocked
    if body.is_verified is not None:
        updates["is_verified"] = body.is_verified
    if not updates:
        raise HTTPException(status_code=400, detail="No changes")
    await db.users.update_one({"_id": to_oid(uid)}, {"$set": updates})
    doc = await db.users.find_one({"_id": to_oid(uid)})
    return public_user(doc)

@api_router.get("/admin/orders")
async def admin_orders(user: dict = Depends(require_roles("admin"))):
    docs = await db.orders.find({}).sort("created_at", -1).to_list(1000)
    for d in docs:
        d["id"] = str(d.pop("_id"))
    return docs

@api_router.post("/admin/medicines/bulk")
async def admin_bulk_medicines(items: List[MedicineIn], user: dict = Depends(require_roles("admin"))):
    docs = []
    for it in items:
        d = it.model_dump()
        d["store_id"] = "admin-catalog"
        d["store_name"] = "Kash Central Pharmacy"
        d["created_at"] = datetime.now(timezone.utc).isoformat()
        docs.append(d)
    if docs:
        await db.medicines.insert_many(docs)
    return {"inserted": len(docs)}

# ---------------------------------------------------------------------------
# Payments (Stripe), rider location & revenue analytics
# ---------------------------------------------------------------------------
class PaymentCheckoutIn(BaseModel):
    order_id: str
    origin_url: str

class LocationIn(BaseModel):
    lat: float
    lng: float

def _stripe():
    from emergentintegrations.payments.stripe.checkout import StripeCheckout
    return StripeCheckout(api_key=STRIPE_API_KEY)

async def _mark_order_paid(order_id: str):
    order = await db.orders.find_one_and_update(
        {"_id": to_oid(order_id), "payment_status": {"$ne": "paid"}},
        {"$set": {"payment_status": "paid"}})
    if order:  # first time flipping to paid -> reserve stock now
        for it in order.get("items", []):
            await db.medicines.update_one({"_id": to_oid(it["medicine_id"])}, {"$inc": {"stock": -it["qty"]}})
        await _notify(order["store_id"], f"New paid order from {order['user_name']} — ₹{order['total']}", "order", order_id)
        await _notify(order["user_id"], f"Payment successful for your ₹{order['total']} order", "success", order_id)

@api_router.post("/payments/checkout")
async def payments_checkout(body: PaymentCheckoutIn, user: dict = Depends(require_roles("user"))):
    from emergentintegrations.payments.stripe.checkout import CheckoutSessionRequest
    order = await db.orders.find_one({"_id": to_oid(body.order_id), "user_id": str(user["_id"])})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.get("payment_status") == "paid":
        raise HTTPException(status_code=400, detail="Order already paid")
    amount = float(order["total"])
    origin = body.origin_url.rstrip("/")
    req = CheckoutSessionRequest(
        amount=amount, currency="inr",
        success_url=f"{origin}/payment/success?session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{origin}/payment/cancel",
        metadata={"order_id": body.order_id, "user_id": str(user["_id"])},
    )
    session = await _stripe().create_checkout_session(req)
    await db.payment_transactions.insert_one({
        "session_id": session.session_id, "order_id": body.order_id, "user_id": str(user["_id"]),
        "amount": amount, "currency": "inr", "status": "initiated", "payment_status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"checkout_url": session.url, "session_id": session.session_id}

@api_router.get("/payments/status/{session_id}")
async def payments_status(session_id: str, user: dict = Depends(require_roles("user"))):
    record = await db.payment_transactions.find_one({"session_id": session_id})
    if not record:
        raise HTTPException(status_code=404, detail="Transaction not found")
    if record.get("user_id") != str(user["_id"]):
        raise HTTPException(status_code=403, detail="Not your transaction")
    if record.get("payment_status") != "paid":
        try:
            status = await _stripe().get_checkout_status(session_id)
            if status.payment_status == "paid" or status.status == "complete":
                await db.payment_transactions.update_one(
                    {"session_id": session_id, "payment_status": {"$ne": "paid"}},
                    {"$set": {"status": "completed", "payment_status": "paid",
                              "updated_at": datetime.now(timezone.utc).isoformat()}})
                await _mark_order_paid(record["order_id"])
                record = await db.payment_transactions.find_one({"session_id": session_id})
        except HTTPException:
            raise
        except Exception as e:
            logger.warning(f"stripe status poll failed: {e}")
    return {"session_id": session_id, "status": record["status"], "payment_status": record["payment_status"]}

@api_router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig = request.headers.get("Stripe-Signature")
    try:
        resp = await _stripe().handle_webhook(payload, sig)
    except Exception as e:
        logger.warning(f"webhook error: {e}")
        return {"status": "ignored"}
    if resp.session_id and resp.payment_status == "paid":
        rec = await db.payment_transactions.find_one({"session_id": resp.session_id})
        if rec and rec.get("payment_status") != "paid":
            await db.payment_transactions.update_one({"session_id": resp.session_id},
                {"$set": {"status": "completed", "payment_status": "paid"}})
            await _mark_order_paid(rec["order_id"])
    return {"status": "ok"}

@api_router.put("/delivery/orders/{oid}/location")
async def update_location(oid: str, body: LocationIn, user: dict = Depends(require_roles("delivery"))):
    order = await db.orders.find_one({"_id": to_oid(oid)})
    if not order or order.get("delivery_boy_id") != str(user["_id"]):
        raise HTTPException(status_code=404, detail="Order not found")
    await db.orders.update_one({"_id": to_oid(oid)},
                               {"$set": {"rider_location": {"lat": body.lat, "lng": body.lng}}})
    return {"ok": True}

@api_router.get("/admin/revenue")
async def admin_revenue(user: dict = Depends(require_roles("admin"))):
    from collections import defaultdict
    orders = await db.orders.find({"payment_status": "paid"}).to_list(5000)
    daily = defaultdict(lambda: {"revenue": 0.0, "orders": 0})
    for o in orders:
        day = (o.get("created_at") or "")[:10]
        daily[day]["revenue"] += o.get("total", 0)
        daily[day]["orders"] += 1
    today = datetime.now(timezone.utc).date()
    series = []
    for i in range(13, -1, -1):
        d = (today - timedelta(days=i)).isoformat()
        series.append({"date": d[5:], "revenue": round(daily.get(d, {}).get("revenue", 0), 2),
                       "orders": daily.get(d, {}).get("orders", 0)})
    return series

# ---------------------------------------------------------------------------
# Notifications, prescription verification, ratings & sales breakdown
# ---------------------------------------------------------------------------
class PrescriptionActionIn(BaseModel):
    action: Literal["approve", "reject"]

class RatingIn(BaseModel):
    rider_rating: int = Field(ge=1, le=5)
    store_rating: int = Field(ge=1, le=5)
    comment: Optional[str] = None

@api_router.get("/notifications")
async def get_notifications(user: dict = Depends(get_current_user)):
    docs = await db.notifications.find({"user_id": str(user["_id"])}).sort("created_at", -1).to_list(50)
    for d in docs:
        d["id"] = str(d.pop("_id"))
    return docs

@api_router.put("/notifications/read-all")
async def read_all_notifications(user: dict = Depends(get_current_user)):
    await db.notifications.update_many({"user_id": str(user["_id"]), "read": False}, {"$set": {"read": True}})
    return {"ok": True}

@api_router.put("/notifications/{nid}/read")
async def read_notification(nid: str, user: dict = Depends(get_current_user)):
    await db.notifications.update_one({"_id": to_oid(nid), "user_id": str(user["_id"])}, {"$set": {"read": True}})
    return {"ok": True}

@api_router.put("/pharmacy/orders/{oid}/prescription")
async def verify_prescription(oid: str, body: PrescriptionActionIn, user: dict = Depends(require_roles("pharmacy"))):
    order = await db.orders.find_one({"_id": to_oid(oid), "store_id": str(user["_id"])})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if not (order.get("prescription_image") or order.get("prescription_note")):
        raise HTTPException(status_code=400, detail="No prescription attached to this order")
    if body.action == "approve":
        await db.orders.update_one({"_id": to_oid(oid)}, {"$set": {"rx_status": "approved"}})
        await _notify(order["user_id"], "Your prescription was approved by the pharmacy", "success", oid)
    else:
        now = datetime.now(timezone.utc).isoformat()
        await db.orders.update_one({"_id": to_oid(oid)}, {
            "$set": {"rx_status": "rejected", "status": "rejected"},
            "$push": {"timeline": {"status": "rejected", "at": now}}})
        if order.get("payment_status") == "paid":
            for it in order.get("items", []):
                await db.medicines.update_one({"_id": to_oid(it["medicine_id"])}, {"$inc": {"stock": it["qty"]}})
        await _notify(order["user_id"], "Your prescription was rejected — order cancelled", "warning", oid)
    return await _get_order(oid)

@api_router.post("/user/orders/{oid}/rate")
async def rate_order(oid: str, body: RatingIn, user: dict = Depends(require_roles("user"))):
    order = await db.orders.find_one({"_id": to_oid(oid), "user_id": str(user["_id"])})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.get("status") != "delivered":
        raise HTTPException(status_code=400, detail="You can only rate delivered orders")
    if order.get("rated"):
        raise HTTPException(status_code=400, detail="You already rated this order")
    await db.orders.update_one({"_id": to_oid(oid)}, {"$set": {
        "rated": True, "rider_rating": body.rider_rating, "store_rating": body.store_rating,
        "rating_comment": body.comment}})
    if order.get("delivery_boy_id"):
        await _notify(order["delivery_boy_id"], f"You received a {body.rider_rating}★ delivery rating", "success", oid)
    await _notify(order["store_id"], f"Your store received a {body.store_rating}★ rating", "success", oid)
    return await _get_order(oid)

@api_router.get("/admin/top-medicines")
async def top_medicines(user: dict = Depends(require_roles("admin"))):
    from collections import defaultdict
    orders = await db.orders.find({"payment_status": "paid"}).to_list(5000)
    agg = defaultdict(lambda: {"qty": 0, "revenue": 0.0})
    for o in orders:
        for it in o.get("items", []):
            agg[it["name"]]["qty"] += it["qty"]
            agg[it["name"]]["revenue"] += it["price"] * it["qty"]
    rows = [{"name": k, "qty": v["qty"], "revenue": round(v["revenue"], 2)} for k, v in agg.items()]
    rows.sort(key=lambda x: x["qty"], reverse=True)
    return rows[:8]

# ---------------------------------------------------------------------------
# Order helpers
# ---------------------------------------------------------------------------
async def _advance_order(oid: str, status: str):
    order = await db.orders.find_one({"_id": to_oid(oid)})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    current = order.get("status")
    if status not in ORDER_TRANSITIONS.get(current, set()):
        raise HTTPException(status_code=400, detail=f"Cannot change status from '{current}' to '{status}'")
    now = datetime.now(timezone.utc).isoformat()
    await db.orders.update_one(
        {"_id": to_oid(oid)},
        {"$set": {"status": status}, "$push": {"timeline": {"status": status, "at": now}}})

async def _get_order(oid: str):
    doc = await db.orders.find_one({"_id": to_oid(oid)})
    doc["id"] = str(doc.pop("_id"))
    return doc

# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------
@api_router.get("/")
async def root():
    return {"message": "Kash AI API"}

app.include_router(api_router)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    admin_email = os.environ["ADMIN_EMAIL"].lower()
    admin_password = os.environ["ADMIN_PASSWORD"]
    existing = await db.users.find_one({"email": admin_email})
    if existing is None:
        await db.users.insert_one({
            "name": "Kash Admin", "email": admin_email, "password_hash": hash_password(admin_password),
            "role": "admin", "is_verified": True, "is_blocked": False,
            "created_at": datetime.now(timezone.utc).isoformat(), "profile": {},
        })
        logger.info("Seeded admin user")
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one({"email": admin_email},
                                  {"$set": {"password_hash": hash_password(admin_password)}})
    await _seed_demo()

async def _seed_demo():
    """Seed demo pharmacy + medicines + delivery + user for instant demo."""
    if await db.users.find_one({"email": "pharmacy@kash.ai"}):
        return
    demo = [
        ("Green Leaf Pharmacy", "pharmacy@kash.ai", "pharmacy", {"store_name": "Green Leaf Pharmacy", "address": "12 MG Road, Pune", "license_number": "PH-2231"}),
        ("Dr. Anil Sharma", "doctor@kash.ai", "doctor", {"specialization": "Ayurveda", "clinic_name": "Ayush Wellness"}),
        ("Ravi Kumar", "delivery@kash.ai", "delivery", {"vehicle_type": "Bike", "is_available": True, "rating": 4.8}),
        ("Priya Nair", "user@kash.ai", "user", {}),
    ]
    ids = {}
    for name, email, role, profile in demo:
        res = await db.users.insert_one({
            "name": name, "email": email, "password_hash": hash_password("password123"),
            "role": role, "is_verified": True, "is_blocked": False,
            "created_at": datetime.now(timezone.utc).isoformat(), "profile": profile,
        })
        ids[role] = str(res.inserted_id)
    store_id = ids["pharmacy"]
    meds = [
        ("Ashwagandha Capsules", "Immunity", "Reduces stress and boosts stamina", 249, 80, False),
        ("Triphala Churna", "Digestive", "Supports digestion and detox", 149, 120, False),
        ("Chyawanprash", "Immunity", "Herbal immunity booster", 399, 60, False),
        ("Brahmi Syrup", "Neuro", "Improves memory and focus", 299, 45, False),
        ("Giloy Tablets", "Immunity", "Natural immunity enhancer", 199, 5, False),
        ("Neem Capsules", "Skin", "Blood purifier for clear skin", 179, 90, False),
        ("Amla Juice", "Immunity", "Rich in Vitamin C", 220, 70, False),
        ("Shatavari Powder", "Wellness", "Hormonal balance for women", 349, 40, False),
        ("Arjuna Bark Extract", "Cardiac", "Supports heart health", 289, 30, True),
        ("Tulsi Drops", "Respiratory", "Relief from cough and cold", 129, 150, False),
    ]
    docs = []
    for n, c, d, p, s, rx in meds:
        docs.append({"name": n, "category": c, "description": d, "price": p, "stock": s,
                     "requires_prescription": rx, "image": None, "store_id": store_id,
                     "store_name": "Green Leaf Pharmacy",
                     "created_at": datetime.now(timezone.utc).isoformat()})
    await db.medicines.insert_many(docs)
    logger.info("Seeded demo data")

@app.on_event("shutdown")
async def shutdown():
    client.close()
