"""Cleanup of TEST_-prefixed artifacts created by backend_test.py."""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import dotenv_values

env = dotenv_values("/app/backend/.env")


async def main():
    c = AsyncIOMotorClient(env["MONGO_URL"])
    db = c[env["DB_NAME"]]
    # restore any order left in a bogus status by the negative-status test
    r = await db.orders.update_many({"status": {"$nin": [
        "placed", "accepted", "ready", "picked_up", "in_transit", "delivered", "rejected"]}},
        {"$set": {"status": "delivered"}})
    print("orders repaired:", r.modified_count)
    # backend lowercases emails on register, so match case-insensitively
    print("test users removed:", (await db.users.delete_many(
        {"email": {"$regex": "^(test_|qa_cust_)", "$options": "i"}})).deleted_count)
    print("test meds removed:", (await db.medicines.delete_many(
        {"name": {"$regex": "^(TEST_|QA Test)", "$options": "i"}})).deleted_count)
    c.close()

asyncio.run(main())
