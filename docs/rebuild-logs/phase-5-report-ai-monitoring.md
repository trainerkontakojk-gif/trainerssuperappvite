# Phase 5 — Report AI (Monitoring Usage)

## Goal
Build AI usage monitoring dashboard and API endpoints for tracking token consumption, costs, and pricing management.

## What was built

### API Endpoints (`/api/v1/ai`)
- `GET /monitoring/aggregation?year=&month=&module=` — aggregation per user (calls, tokens, cost), joined with profiles
- `GET /monitoring/pricing` — full pricing editor list (AI_MODELS + DB overrides)
- `PUT /monitoring/pricing` — upsert pricing for a model (admin/trainer only)
- `GET /monitoring/billing` — current USD/IDR rate
- `POST /monitoring/billing` — insert new billing rate (admin/trainer only)

### Frontend Page (`/monitoring`)
- Tab "Penggunaan Token": KPI cards (total calls, tokens, cost, active users), month/year filter, user search, per-user aggregation table
- Tab "Harga & Kurs": USD/IDR rate editor + per-model pricing table with inline edit
- Nav bar updated with "Monitoring" link

### Bundle: 331 kB ✅ build passes

## Next Steps
- Phase 6: Upload Excel SIDAK
