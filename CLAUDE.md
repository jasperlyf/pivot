# CLAUDE.md — Pivot Project

This file tracks project context, decisions, and what still needs to be done.
Update this file as work progresses.

---

## Todo (Active)

### 1. Workspace System
- [ ] Create `workspaces` table in Supabase (id, user_id, name, created_at, updated_at)
- [ ] Create `workspace_views` table (id, workspace_id, name, config JSON, created_at)
- [ ] Create `workspace_notes` table (id, workspace_id, content, updated_at)
- [ ] Create `workspace_documents` table (id, workspace_id, name, url, created_at)
- [ ] Build `/workspace` — list page (create new, list existing)
- [ ] Build `/workspace/[id]` — detail page with Views / Notes / Documents tabs

### 2. Save View Functionality
- [ ] Add "Save to Workspace" button on Comparisons page
- [ ] Modal: pick workspace + name the view
- [ ] Save config (symbols, date range, mode) to `workspace_views`

### 3. Render Saved Views (interactive)
- [ ] Load each saved view config in workspace detail
- [ ] Re-render live Comparison chart from config (fully interactive)

### 4. Dashboard Redesign
- [ ] Replace chart-heavy dashboard with home / control center
- [ ] Sections: Overview Stats, Recent Workspaces, Pinned Workspaces, Recent Docs, Quick Actions

### 5. Document Upload
- [ ] Create Supabase Storage bucket for workspace documents
- [ ] Upload UI in workspace detail → Documents section

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

### 1) EXPLORE — users analyze markets
Pages:
- Comparisons (multi-asset charts, metrics)
- Explore (single asset deep dive)

### 2) CREATE — users construct strategies
Pages:
- Portfolio Simulator
- Custom Index Builder

### 3) PRESENT — Workspace (NEW CORE LAYER)

**Workspace = interactive financial presentation + organisation layer.**

This is the most important feature in the refactor.

A Workspace acts like a **client case folder** — it contains everything needed for a discussion or presentation.

#### Workspace contains:

**Views (CORE)** — saved analysis configurations (initially Comparison views only)
- Stores: symbols, date range, mode (price / %), relevant settings
- Store configuration ONLY — do NOT store chart data
- Re-render live charts when loaded
- Views must remain fully interactive (not snapshots or images)

**Notes** — text/markdown for talking points, investment thesis, client notes

**Documents / Data** — PDFs, images, CSVs linked to the workspace

**Key principle:** all entities link via `workspace_id` (views, notes, documents, datasets). No complex tagging system.

**Critical concept:** Workspace views are live and interactive — "live dashboards arranged like slides."

---

## Navigation (Updated)

```
Dashboard
Explore
Comparisons

Builder (Portfolio + Index)

Workspace  ← NEW CORE PAGE

Data
Settings
```

---

## Dashboard Redesign (Required)

Dashboard becomes a **home / control center** with **no heavy charts**.

Sections:
1. **Overview Stats** — total workspaces, total views, total documents
2. **Recent Workspaces** (primary) — name, last updated, number of views — clickable
3. **Favourite / Pinned Workspaces** — quick access
4. **Recent Documents** — file name, associated workspace
5. **Quick Actions** — create workspace, create comparison, upload document

Constraints:
- NO heavy charts on dashboard
- NO duplication of comparison features

---

## MVP Scope (Strict)

Build ONLY:
- Workspace list page
- Workspace detail page
- Save comparison view into workspace
- Render saved views (interactive)
- Basic notes
- Basic document upload (Supabase storage)
- Dashboard redesign

Do NOT build:
- Document parsing
- AI features
- Complex tagging
- Multiple view types (Comparison only)

---

## Implementation Priority

1. Workspace system
2. Save View functionality
3. Dashboard redesign
4. Document upload
5. Notes

---

## Future Direction (DO NOT IMPLEMENT NOW)

Pivot will evolve into a **client financial presentation platform**.

Future features:
- Insurance / financial document parsing
- AI-generated summaries
- Advisor workflows

Target users: financial advisors, consultants, sales teams

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

## Current Pages (Pre-Refactor)

| Page | Route | Status |
|------|-------|--------|
| Dashboard | `/` | ✅ Built (chart-heavy; will be redesigned) |
| Explore | `/explore` | ✅ Single-asset deep dive |
| Comparisons | `/comparisons` | ✅ Multi-asset comparisons |
| Portfolio Simulator | `/portfolio` | ✅ Built |
| Index Lab | `/index-builder` | ✅ Built |
| Data Sources | `/data-sources` | ✅ Built |
| Settings | `/settings` | ✅ Built |

---

## Workspace (To Build)

### Workspace List Page
- Create new workspace
- List existing workspaces

### Workspace Detail Page
Sections:
- **Views** — list of saved views, each renders a live interactive chart
- **Notes** — editable text/markdown
- **Documents** — uploaded files list + preview

### Save View
- From Comparisons: save current configuration into a Workspace
- Store config only, do not store chart data

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
