# CLAUDE.md — Pivot Project

This file tracks project context, decisions, and what still needs to be done.
Update this file as work progresses.

---

## Project Overview

**Pivot** is a financial interactive dashboard for uploading datasets (CSV/Excel) and analyzing them with pivot controls and charts.

Think: Notion + Stripe Dashboard + Tableau-lite

**Live URLs**
- Frontend: (Vercel URL — update once confirmed)
- Backend: https://pivot-api-74sf.onrender.com
- Database: https://owekjelgocfyvphtnouw.supabase.co

---

## Tech Stack

| Layer    | Technology |
|----------|-----------|
| Frontend | Next.js 16 (App Router) + TypeScript + TailwindCSS + Recharts |
| Backend  | Node.js + Express |
| Database | PostgreSQL via Supabase |
| DB Client | @supabase/supabase-js (HTTPS — replaces Prisma TCP which failed on this network) |
| Hosting  | Vercel (frontend) + Render (backend) |

---

## Architecture Notes

### Why @supabase/supabase-js instead of Prisma
Supabase NANO plan uses IPv6-only direct connections. The local dev network doesn't support IPv6 routing, and the connection pooler returned "Tenant or user not found". Switched to Supabase JS client (HTTPS REST API) which works on all networks.

### Database
- Tables created manually via Supabase SQL Editor (not via Prisma migrate)
- Seed data (192 records) also inserted via SQL Editor
- Schema: `datasets` (id, name, created_at) + `records` (id, dataset_id, date, asset_name, value, category)

### Backend env vars (Render)
```
PORT=4000
SUPABASE_URL=https://owekjelgocfyvphtnouw.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<in Render dashboard>
```

### Frontend env vars (Vercel)
```
NEXT_PUBLIC_API_URL=https://pivot-api-74sf.onrender.com
```

### Local dev env vars
- Backend: `backend/.env` (gitignored)
- Frontend: `frontend/.env.local` (gitignored)

---

## Completed Steps

- [x] Step 1: GitHub repo, folder structure, .gitignore, README
- [x] Step 2: Supabase MCP server config + agent skills
- [x] Step 3: Backend — Express API, routes (datasets, pivot-data, upload), pivot logic
- [x] Step 4: Seed data — SPY, ACWI, BTC, ETH monthly prices Jan 2021–Dec 2024 (192 records)
- [x] Step 5: Frontend UI — full dashboard with sidebar, all pages, charts
- [x] Step 6: Deploy — Render (backend) + Vercel (frontend)

---

## Pages Built

| Page | Route | Status |
|------|-------|--------|
| Dashboard | `/` | ✅ KPI cards, line/bar chart, breakdown charts, sortable table |
| Explore | `/explore` | ✅ Chip controls, instant chart updates |
| Comparisons | `/comparisons` | ✅ Split panel + overlay, indexed returns |
| Data Sources | `/data-sources` | ✅ Drag-drop upload, dataset list, delete |
| Settings | `/settings` | ✅ Currency, default metric, default group by |

---

## TODO — Still Needs Work

### High priority
- [x] **Date range filter** in top bar — preset pills (All time, 2021, 2022, 2023, 2024, Last 2 years)
- [ ] **Confirm Vercel build passes** and live site loads data end-to-end
- [ ] **Keep Render warm** — free tier spins down after 15min inactivity; add a ping service (e.g. UptimeRobot)

### UI improvements (from original spec)
- [ ] **Drag-and-drop fields** on Explore page (currently chip buttons, not draggable)
- [ ] **Save / Share** button in top bar
- [ ] **KPI cards** — make them more dynamic (currently hardcoded to SPY/BTC)
- [ ] **Chart animations** — smooth transitions when controls change
- [ ] **Light/dark mode toggle** (currently light only)
- [ ] **Custom domain** on Vercel

### Features not yet built
- [ ] **Index A vs B comparison** (Comparisons page — marked future in spec)
- [ ] **Auth** — user logins / private workspaces
- [ ] **Export** — download filtered data as CSV
- [ ] **More chart types** — scatter, area chart
- [ ] **Column mapping** on upload (currently expects exact column names: date, asset_name, value, category)

### Backend
- [ ] **Pagination** on `/pivot-data` for large datasets
- [ ] **Input validation** — sanitize upload data properly
- [ ] **Rate limiting** on API

---

## Seed Data Reference

Dataset ID: `seed_dataset_001`
Dataset name: `Market Prices 2021–2024`

| Asset | Category | Records |
|-------|----------|---------|
| SPY   | equity   | 48      |
| ACWI  | equity   | 48      |
| BTC   | crypto   | 48      |
| ETH   | crypto   | 48      |

---

## Local Dev Commands

```bash
# Backend (port 4000)
cd backend && npm run dev

# Frontend (port 3000)
cd frontend && npm run dev
```

---

## Key Decisions Log

| Date | Decision | Reason |
|------|----------|--------|
| 2026-03-18 | Replaced Prisma with @supabase/supabase-js | IPv6/network issue — TCP connections to Supabase failing locally |
| 2026-03-18 | Created DB tables via SQL Editor | Prisma migrate couldn't connect for same reason |
| 2026-03-18 | Seeded data via SQL Editor | Same connection issue |
| 2026-03-18 | Deployed backend to Render, frontend to Vercel | As planned in README |
