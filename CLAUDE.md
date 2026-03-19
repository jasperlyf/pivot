# CLAUDE.md — Pivot Project

This file tracks project context, decisions, and what still needs to be done.
Update this file as work progresses.

---

## Project Overview

**Pivot** is a **financial analysis tool** focused on comparison, strategy simulation, and data exploration. The UI must be premium, minimal, and fast to understand.

**Positioning:** an interactive tool to **explore, build, and present** financial strategies.
Not a trading platform, not a portfolio tracker, not a brokerage app.

**Live URLs**
- Frontend: (Vercel URL — update once confirmed)
- Backend: https://pivot-api-74sf.onrender.com
- Database: https://owekjelgocfyvphtnouw.supabase.co

---

## Core Product Model

### Two Modes
- **Planning Mode** (default) — full sidebar, all tools accessible, editing enabled
- **Presentation Mode** — triggered from a workspace detail page; sidebar collapses to only show that workspace's selected templates + Documents link; dark sidebar with "PRESENTING" badge; exit button returns to planning

### Navigation (Planning Mode)

| Route | Label | Purpose |
|---|---|---|
| `/` | Home | Workspace hub — stats, pinned workspaces, recents, quick actions |
| `/explore` | Watchlist | Multi-list watchlist with asset preview panel before adding |
| `/comparisons` | Compare | Multi-asset overlay chart, save views to workspace |
| `/workspace` | Workspaces | List + create workspaces |
| `/workspace/[id]` | Workspace Detail | Tasks / Templates / Notes / Documents tabs |
| `/index-builder` | Index Builder | Build custom weighted indexes, compare vs benchmark |
| `/portfolio` | Portfolio Builder | Build and save portfolios |
| `/index-simulator` | Index Simulator | Compare a saved index vs a searched benchmark with metrics |
| `/portfolio-simulator` | Portfolio Simulator | Simulate saved portfolio with investment amount + period |
| `/data-sources` | Dataset | Upload datasets |
| `/library/index` | Library — Index | View saved indexes (list view) |
| `/library/portfolio` | Library — Portfolio | View saved portfolios (list view) |
| `/library/dataset` | Library — Dataset | View uploaded datasets (list view) |
| `/pdf-viewer` | PDF Viewer | View workspace PDFs in browser; locked to presentation workspace in presentation mode |
| `/settings` | Settings | User preferences |

### Sidebar Groups
- **Templates** — collapsible, shows pinned templates
- **Builder** — collapsible: Index Builder, Portfolio Builder, Dataset
- **Library** — collapsible: Index, Portfolio, Dataset
- **Workspaces** — collapsible with per-workspace links + pin/star toggle

### Workspace Detail Tabs
1. **Tasks** — Apple Reminders-style task list, circle checkbox, strikethrough on complete, persisted to `workspace_tasks`
2. **Templates** — select which templates to show in presentation mode; persisted to `workspace_template_selections`; all selected by default
3. **Notes** — freeform text with explicit Save button; persisted to `workspace_notes`
4. **Documents** — upload any file to Supabase Storage; persisted to `workspace_documents`

### Templates (lib/templates.ts)
| Label | Route | Purpose |
|---|---|---|
| Watchlist | `/explore` | Single-asset deep dive |
| Compare | `/comparisons` | Multi-asset overlay |
| Portfolio Simulator | `/portfolio-simulator` | Simulate saved portfolio |
| Index Simulator | `/index-simulator` | Compare saved index vs benchmark with metrics |
| PDF Viewer | `/pdf-viewer` | View workspace PDFs |

### Index Simulator
- Select a saved custom index (read-only, no editing)
- Search any benchmark ticker
- Choose period (1M–5Y)
- Runs comparison metrics: Total Return, CAGR, Volatility, Max Drawdown, Sharpe Ratio
- Side-by-side table with delta column (index wins highlighted in indigo)

### UX Principles
- Minimal, clean — no clutter
- Avoid portfolio-tracking language
- Fast visual comparison
- No nested nav, no unnecessary pages
- Presentation mode: dark sidebar, locked to workspace context, no editing UI

---

## Database Tables

| Table | Purpose |
|---|---|
| `workspaces` | id, user_id, name, pinned, created_at, updated_at |
| `workspace_notes` | id, workspace_id, content, updated_at |
| `workspace_documents` | id, workspace_id, name, url, created_at |
| `workspace_tasks` | id, workspace_id, content, completed, created_at |
| `workspace_template_selections` | workspace_id (PK), hrefs text[] |
| `portfolios` | id, user_id, name, updated_at |
| `portfolio_assets` | id, portfolio_id, asset_symbol, weight |
| `custom_indexes` | id, user_id, name, updated_at |
| `index_holdings` | id, index_id, asset_symbol, weight |
| `datasets` | id, name, created_at |
| `records` | id, dataset_id, date, asset_name, value, category |
| `user_favourites` | user_id, symbol, order, created_at |
| `user_settings` | user_id, currency, metric, group_by, theme, updated_at |

All user-owned tables have RLS: `auth.uid() = user_id` or via workspace ownership.

**Required SQL (run in Supabase SQL Editor if not yet created):**
```sql
-- Tasks
create table workspace_tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade not null,
  content text not null,
  completed boolean not null default false,
  created_at timestamptz not null default now()
);
alter table workspace_tasks enable row level security;
create policy "Users manage own workspace tasks" on workspace_tasks for all
  using (workspace_id in (select id from workspaces where user_id = auth.uid()));

-- Template selections
create table workspace_template_selections (
  workspace_id uuid primary key references workspaces(id) on delete cascade,
  hrefs text[] not null default '{}'
);
alter table workspace_template_selections enable row level security;
create policy "Users manage own template selections" on workspace_template_selections for all
  using (workspace_id in (select id from workspaces where user_id = auth.uid()));
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router) + TypeScript + TailwindCSS + Recharts |
| Backend | Node.js + Express + yahoo-finance2 |
| Database | PostgreSQL via Supabase |
| DB Client | @supabase/supabase-js (HTTPS REST — replaced Prisma due to IPv6 issues) |
| Hosting | Vercel (frontend) + Render (backend) |

---

## Architecture Notes

### Why @supabase/supabase-js instead of Prisma
Supabase NANO plan uses IPv6-only direct connections. Local dev network doesn't support IPv6, and the connection pooler returned "Tenant or user not found". Switched to Supabase JS client (HTTPS REST API).

### Auth (Supabase Auth + @supabase/ssr)
- `frontend/proxy.ts` — Next.js 16 middleware (exported as `proxy`, not `middleware`)
  - Redirects unauthenticated → `/login`; authenticated away from `/login`
- `frontend/lib/supabase/browser.ts` — `createBrowserClient` for client components
- `frontend/lib/supabase/server.ts` — `createServerClient` with `next/headers` cookie store

### Context (lib/context.tsx)
Provides global state:
- `user`, `signOut` — auth
- `symbols`, `setSymbols` — watchlist favourites (persisted to `user_favourites`)
- `settings`, `saveSettings` — user preferences
- `globalDateRange`, `setGlobalDateRange`
- `templateFavourites`, `toggleTemplateFavourite` — pinned templates in sidebar
- `presentationMode`, `presentationWorkspaceId`, `presentationWorkspaceName`, `presentationTemplateHrefs` — presentation state
- `enterPresentation(workspaceId, name, hrefs)`, `exitPresentation()` — mode toggle

### Presentation Mode Flow
1. User opens a workspace detail page
2. Clicks **Present** button (top right of workspace header)
3. `enterPresentation()` called with workspace id, name, and selected template hrefs
4. Sidebar switches to dark presentation layout showing only selected templates + Documents
5. PDF Viewer auto-selects the presentation workspace and locks the workspace selector
6. Exit via sidebar button or workspace header button → `exitPresentation()` + navigate back to workspace

### Backend env vars (Render)
```
PORT=4000
SUPABASE_URL=https://owekjelgocfyvphtnouw.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<in Render dashboard>
```

### Frontend env vars (Vercel / .env.local)
```
NEXT_PUBLIC_API_URL=https://pivot-api-74sf.onrender.com
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

---

## Current Pages

| Page | Route | Status |
|---|---|---|
| Home | `/` | ✅ Workspace hub |
| Watchlist | `/explore` | ✅ Multi-list, preview panel before add |
| Compare | `/comparisons` | ✅ Multi-asset overlay + save view |
| Workspaces | `/workspace` | ✅ List + create |
| Workspace Detail | `/workspace/[id]` | ✅ Tasks / Templates / Notes / Documents |
| Index Builder | `/index-builder` | ✅ Build + save custom indexes |
| Portfolio Builder | `/portfolio` | ✅ Build + save portfolios |
| Index Simulator | `/index-simulator` | ✅ Compare index vs benchmark metrics |
| Portfolio Simulator | `/portfolio-simulator` | ✅ Simulate portfolio with investment amount |
| Library — Index | `/library/index` | ✅ List view of saved indexes |
| Library — Portfolio | `/library/portfolio` | ✅ List view of saved portfolios |
| Library — Dataset | `/library/dataset` | ✅ List view of uploaded datasets |
| Data Sources | `/data-sources` | ✅ Upload datasets |
| PDF Viewer | `/pdf-viewer` | ✅ View PDFs; locked to workspace in presentation mode |
| Settings | `/settings` | ✅ User preferences |

---

## Live Market Data

Source: Yahoo Finance via `yahoo-finance2` (free, no API key)
Cache: 5-min in-memory TTL

Backend routes:
- `GET /market-data/quotes?symbols=SPY,QQQ` — real-time quote + daily change + 52w + volume + market cap
- `GET /market-data/history?symbols=SPY&period=1y&interval=1mo` — historical OHLCV
- `GET /market-data/search?q=nvidia` — ticker search
- `GET /market-data/holdings?symbol=SPY` — top ETF holdings
- `GET /market-data/stats?symbols=SPY,QQQ` — ann. return, volatility, Sharpe, max drawdown, beta, Calmar

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
|---|---|---|
| 2026-03-18 | Replaced Prisma with @supabase/supabase-js | IPv6/network issue — TCP connections failing locally |
| 2026-03-18 | Removed global TopBar — each page owns its date range | Better UX, pages have different time context needs |
| 2026-03-18 | Explore redesigned as multi-list watchlist with preview panel | Preview before add; cleaner UX than immediate add |
| 2026-03-18 | Builder collapsible group in sidebar | Keeps nav clean |
| 2026-03-18 | Renamed Dashboard → Home; workspace hub not market overview | Home should centre the user's work |
| 2026-03-18 | Removed TickerTape and global TopBar | Distracting; each page owns its context |
| 2026-03-19 | Workspace detail redesigned: Views tab → Tasks + Templates tabs | Tasks for todo tracking; Templates for presentation curation |
| 2026-03-19 | Presentation mode added — dark sidebar, locked to workspace context | Clean presentation UX without exposing planning tools |
| 2026-03-19 | Template selections persisted to `workspace_template_selections` DB table | All selected by default; user can deselect per workspace |
| 2026-03-19 | PDF Viewer auto-selects + locks to presentation workspace | Prevents cross-workspace document leakage in presentation mode |
| 2026-03-19 | Index Simulator created as separate page from Index Builder | Builder = create/edit; Simulator = view/compare vs benchmark |
| 2026-03-19 | Index Simulator shows metrics table (not investment simulation) | Indexes are strategy tools; metrics comparison is more relevant than $ simulation |
| 2026-03-19 | Library pages (index, portfolio, dataset) use flat list layout | Consistent with other list views; shows pills + hover actions |
| 2026-03-19 | Saved indexes/portfolios panels removed from Builder pages | Library pages handle saved item browsing; builders stay focused |
