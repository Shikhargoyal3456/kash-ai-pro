# Kash AI Pro — PRD

## Original Problem Statement
Build "Kash AI Pro", a dual healthcare + e-pharmacy platform: a voice-first AI assistant for Ayurvedic doctors (Hindi voice consultation, Samhita diet/lifestyle/treatment analysis, patient records, prescriptions) plus a Zomato-style pharmacy marketplace connecting customers, pharmacy stores and delivery partners. 5 roles (doctor, pharmacy, delivery, user/customer, admin), JWT auth with role-based access, glassmorphism UI.

## Architecture
- Frontend: React 19 (CRA + CRACO, "@/" alias), Tailwind, shadcn/ui, recharts, sonner, lucide-react.
- Backend: FastAPI + Motor (MongoDB). Bearer JWT auth (localStorage "kash_token").
- AI: OpenAI Whisper (whisper-1, Hindi) for voice transcription + GPT-5.4 for Samhita analysis, via emergentintegrations + EMERGENT_LLM_KEY.
- Design: "Organic & Earthy" glassmorphism — primary #2C5545, accent #E88D67, Outfit + Plus Jakarta Sans fonts.

## User Personas
- Ayurvedic Doctor — voice/text consultations, AI case sheets, prescriptions.
- Pharmacy Store — inventory CRUD, order fulfilment.
- Delivery Partner — pick up/deliver orders, earnings.
- Customer — browse/search/order medicines, track delivery.
- Admin — platform oversight, user management, analytics.

## Core Requirements (static)
- Role-based auth + protected routes; admin seeding.
- Doctor: voice consultation, Samhita analysis, consultations list, prescriptions.
- Pharmacy: medicine CRUD, order accept/reject/ready, stats.
- Delivery: available/active orders, pickup->transit->deliver, history, earnings.
- User: browse/search/category filter, cart, checkout, order tracking.
- Admin: dashboard stats, analytics charts, user block/verify, order monitoring.

## Implemented (2026-08-25)
- Full 5-role JWT auth + RBAC, admin (shiksgoel85@gmail.com) seeded, demo data seeded (Green Leaf Pharmacy + 10 medicines + doctor/pharmacy/delivery/user demo accounts).
- All 5 dashboards, landing page, login/register with role selection.
- Voice consultation (Whisper) + Samhita analysis (GPT-5.4) — AI verified working.
- Full cross-role order lifecycle: placed->accepted->ready->picked_up->in_transit->delivered.
- Hardening: ObjectId guards (404), order status Literal + transition validation (400/422), brute-force lockout (5 fails -> 429/15min), server-side order validation (DB price recompute, stock check, Rx-note requirement, single-store cart), rider ownership guard.
- Tested: testing agent iteration_1 — 100% frontend flows, backend happy-paths + hardening regression pass.

## Backlog
- P2: real prescription file upload (currently text note); payments (Stripe/Razorpay).
- P3: doctor patient-history timeline, delivery live map/geolocation, richer analytics (revenue over time).
- Migrate deprecated on_event startup/shutdown to lifespan handlers.

## Next Tasks
- Terms & Conditions + Privacy Policy pages (offered to user), notification deep-links, split server.py into routers.

## Implemented (2026-08-26)
- **Order Notifications**: `notifications` collection + `_notify()`; bell in header (polls every 8s, unread badge, dropdown, mark-all-read) for all roles. Events: paid (→pharmacy+customer), accepted/ready/picked_up/in_transit/delivered (→customer). Live toast on new notification.
- **Prescription Verification**: pharmacy Approve/Reject on the order's Rx panel; marking an order "ready" is blocked until rx_status=approved; reject cancels order + restocks (only if paid) + notifies customer.
- **Delivery Ratings**: customer rates rider + pharmacy (1-5 stars + comment) after delivery; one-time; feeds delivery avg rating; notifies rider/store.
- **Sales Breakdown**: admin `GET /admin/top-medicines`; Top-Selling Medicines horizontal bar chart beside Revenue Trend.
- Tested: iteration_3 — 101/101 backend tests, 100% frontend flows, no blocking defects.
