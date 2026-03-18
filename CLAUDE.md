# CLAUDE.md — Pivot Project

This file tracks project context, decisions, and what still needs to be done.
Update this file as work progresses.

---

## Todo (Active)

### 1. Workspace System
- [x] Create `workspaces` table in Supabase (id, user_id, name, created_at, updated_at)
- [x] Create `workspace_views` table (id, workspace_id, name, config JSON, created_at)
- [x] Create `workspace_notes` table (id, workspace_id, content, updated_at)
- [x] Create `workspace_documents` table (id, workspace_id, name, url, created_at)
- [x] Build `/workspace` — list page (create new, list existing)
- [x] Build `/workspace/[id]` — detail page with Views / Notes / Documents tabs

### 2. Save View Functionality
- [x] Add "Save to Workspace" button on Comparisons page
- [x] Modal: pick workspace + name the view
- [x] Save config (symbols, date range, mode) to `workspace_views`

### 3. Render Saved Views (interactive)
- [x] Load each saved view config in workspace detail
- [x] Re-render live Comparison chart from config (fully interactive)

### 4. Dashboard Redesign
- [x] Replace chart-heavy dashboard with home / control center
- [x] Sections: Overview Stats, Recent Workspaces, Recent Docs, Quick Actions

### 5. Document Upload
- [x] Create Supabase Storage bucket for workspace documents
- [x] Upload UI in workspace detail → Documents section

### 6. Notes
- [ ] Editable markdown/text field in workspace detail → Notes section
- [ ] Auto-save or explicit save button

---

## Project Overview

**Pivot** is being refactored from a chart-first dashboard into a **structured, user-driven financial workspace tool**.

**Positioning:** an interactive tool to **explore, build, and present** financial strategies.
Not a trading platform, not a portfolio tracker, not a brokerage app.

**Live URLs**
- Frontend: (Vercel URL — update once confirmed)
- Backend: https://pivot-api-74sf.onrender.com
- Database: https://owekjelgocfyvphtnouw.supabase.co

---

## Core Product Model (MUST FOLLOW)

Pivot is a **financial analysis tool** focused on comparison, strategy simulation, and data exploration. The UI must be premium, minimal, and fast to understand.

### Navigation

| Route | Label | Purpose |
|---|---|---|
| `/` | Home | Workspace hub — stats, pinned workspaces, recents, quick actions |
| `/explore` | Explore | Search assets, trending, quick chart preview |
| `/comparisons` | Compare | Direct multi-asset overlay, no weighting |
| `/workspace` | Workspaces | List + create workspaces (in sidebar below Builder group) |
| `/index-builder` | Custom Index | **Core feature** — build strategies, assign weights, compare vs benchmark (Builder group) |
| `/portfolio` | Portfolio Simulator | Simulate portfolio performance (Builder group) |
| `/data-sources` | Uploads | Upload datasets, view files, use in charts |
| `/settings` | Settings | User preferences |

Builder group is a collapsible section in the sidebar containing Custom Index and Portfolio Simulator.
No global TopBar — each page manages its own date range.

### Home — Workspace Hub
- Overview Stats: total workspaces, saved views, documents
- Favourite Workspaces: pinned workspaces in amber-bordered grid cards
- Recent Workspaces: list with star/pin toggle
- Quick Actions: New Workspace, New Comparison, Upload Document
- Recent Documents: last 5 uploaded docs across all workspaces

### Custom Index — Core Differentiator
- Build custom weighted portfolios
- Compare vs benchmark
- Performance, risk, and return metrics
- Main demo feature of the app

### UX Principles
- Minimal, clean — no clutter
- Avoid portfolio-tracking language
- Fast visual comparison
- No nested nav, no unnecessary pages

---

## Tech Stack

| Layer    | Technology |
|----------|------------|
| Frontend | Next.js 16 (App Router) + TypeScript + TailwindCSS + Recharts |
| Backend  | Node.js + Express + yahoo-finance2 |
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

### Auth (Supabase Auth + @supabase/ssr)
- `frontend/proxy.ts` — Next.js 16 middleware (exported as `proxy`, not `middleware`)
  - Redirects unauthenticated users to `/login`; redirects authenticated users away from `/login`
- `frontend/lib/supabase/browser.ts` — `createBrowserClient` for client components
- `frontend/lib/supabase/server.ts` — `createServerClient` with `next/headers` cookie store
- `user_favourites` table in Supabase with RLS: `auth.uid() = user_id`
- Context (`lib/context.tsx`) loads/saves favourites on auth state change

### Local dev env vars
- Backend: `backend/.env` (gitignored)
- Frontend: `frontend/.env.local` (gitignored)
  - `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` required for auth

---

## Current Pages

| Page | Route | Status |
|------|-------|--------|
| Home | `/` | ✅ Workspace hub (stats, pinned, recents, quick actions) |
| Explore | `/explore` | ✅ Single-asset deep dive |
| Compare | `/comparisons` | ✅ Multi-asset overlay + Save View to workspace |
| Workspaces | `/workspace` | ✅ List + create workspaces |
| Workspace Detail | `/workspace/[id]` | ✅ Views / Notes / Documents tabs |
| Custom Index | `/index-builder` | ✅ Built |
| Portfolio Simulator | `/portfolio` | ✅ Built |
| Data Sources | `/data-sources` | ✅ Built |
| Settings | `/settings` | ✅ Built |

---

## Live Market Data

Source: Yahoo Finance via `yahoo-finance2` npm package (free, no API key)
Cache: 5-min in-memory TTL

Default favourites: SPY, QQQ
Full default symbol list: SPY, QQQ, ACWI, BTC-USD, ETH-USD, GLD

Routes:
- `GET /market-data/quotes?symbols=SPY,QQQ` — real-time quote + daily change + 52w + volume + market cap
- `GET /market-data/history?symbols=SPY&period=1y&interval=1mo` — historical OHLCV
- `GET /market-data/search?q=nvidia` — ticker search
- `GET /market-data/holdings?symbol=SPY` — top holdings for ETFs (gracefully empty for stocks/crypto)
- `GET /market-data/stats?symbols=SPY,QQQ` — computed metrics: ann. return, volatility, Sharpe, max drawdown, beta vs SPY, Calmar (1Y/3Y/5Y windows)

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
| 2026-03-18 | Removed global TopBar — each page owns its date range | Better UX, pages have different time context needs |
| 2026-03-18 | Explore and Comparisons use independent local symbol pools | Each page has its own context; don't want dashboard symbols bleeding in |
| 2026-03-18 | Researched OpenBB Workspace for widget/telemetry inspiration | Pivot targets same space but more interactive and demo-friendly |
| 2026-03-18 | Added ticker tape (light theme, scrolling, hover-to-pause) | Yahoo Finance-style live price bar across all pages |
| 2026-03-18 | Ticker tape uses `symbols` from context (favourites) | Single source of truth — tape and dashboard always in sync |
| 2026-03-18 | Removed MSCI/preset special-casing from Comparisons | Will be reintroduced via AI layer; currently all assets treated equally |
| 2026-03-18 | Explore redesigned as single-asset deep-dive | More focused UX — search one asset, see everything about it |
| 2026-03-18 | Dashboard defaults to SPY + QQQ as favourites | Most recognisable benchmarks for any audience; fully configurable in Settings |
| 2026-03-18 | Dashboard shows all sections (chart, breakdowns, table) for favourites only | Cohesive view — everything on the page is about the user's tracked assets |
| 2026-03-18 | Added Supabase Auth (`@supabase/ssr`) — email/password, route protection via `proxy.ts` | Prerequisite for CSV import, saved favourites, and future private workspaces |
| 2026-03-18 | Favourites persisted to `user_favourites` Supabase table with RLS | Each user sees only their own favourites; default SPY+QQQ on first login |
| 2026-03-18 | Implemented light/dark mode via `next-themes` + Tailwind v4 `@custom-variant dark` | Finance dashboards expected in dark mode; toggle in Sidebar (Moon/Sun icon) |
| 2026-03-18 | Added favourite toggle button on Explore page | Users can add assets to dashboard directly from search without going to Settings |
| 2026-03-18 | Product refactor: Explore → Create → Present, Workspace added | New core product model and navigation |
| 2026-03-18 | Added Workspaces to sidebar below Builder group | Users need direct nav access to workspace list |
| 2026-03-18 | Renamed Dashboard → Home; Home is workspace hub not market overview | Home should centre the user's work, not market data |
| 2026-03-18 | Removed TickerTape and global TopBar from layout | TickerTape distracting; each page owns its own date range |
| 2026-03-18 | Builder collapsible group in sidebar (Custom Index + Portfolio Simulator) | Keeps nav clean while preserving both builder tools |
