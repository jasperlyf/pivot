# CLAUDE.md — Pivot Project

This file tracks project context, decisions, and what still needs to be done.
Update this file as work progresses.

---

## Project Overview

**Pivot** is a financial interactive dashboard built for sales demos — live market data, multi-asset comparisons, and clean visualisations.

Think: OpenBB Workspace meets Stripe Dashboard — interactive, approachable, demo-ready.

**Product positioning:** "Interactive financial decision tool" / "Portfolio strategy simulation tool" — NOT a personal investment tracker or brokerage app. No transaction history, no buy/sell logs, no P&L per trade, no cash balance.

**Live URLs**
- Frontend: (Vercel URL — update once confirmed)
- Backend: https://pivot-api-74sf.onrender.com
- Database: https://owekjelgocfyvphtnouw.supabase.co

---

## Tech Stack

| Layer    | Technology |
|----------|-----------|
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
| Dashboard | `/` | ✅ Favourites-only price chart, breakdown charts, sortable table with sparklines |
| Explore | `/explore` | ✅ Single-asset deep-dive: search, price chart, quote stats, performance metrics, holdings |
| Comparisons | `/comparisons` | ✅ Multi-asset slot picker, colour-coded chart, performance table, holdings comparison |
| Portfolio Simulator | `/portfolio`      | ✅ Multi-save named portfolios, smart weight split, live quotes, holdings summary table, donut, metrics |
| Index Lab           | `/index-builder`  | ✅ Multi-save named indexes, smart weight split, vs benchmark, alpha, metrics, donut; usable in Comparisons |
| Data Sources | `/data-sources` | ✅ Drag-drop upload, dataset list, delete |
| Settings | `/settings` | ✅ Favourites management, currency, metric, group by |

## UX Done

- [x] Sidebar collapsible with PanelLeftClose/Open toggle
- [x] TopBar removed — date range is per-page, above relevant chart
- [x] **Ticker tape** — scrolling live price bar (white, light theme) across all pages; uses favourites symbols; auto-refreshes every 60s; hover to pause
- [x] **Favourites system** — default SPY + QQQ; managed in Settings; drives dashboard chart + ticker tape
- [x] Dashboard shows all sections (chart, breakdowns, table) for favourites only; empty state links to Settings
- [x] Dashboard: settings gear icon shortcut in page header
- [x] Explore: single-asset search → price chart + quote stats grid + performance metrics + holdings table
- [x] Comparisons: slot-based pickers (open on click, not on mount), no MSCI/preset special-casing, all assets treated equally
- [x] Comparisons: performance table (1Y/3Y/5Y, best-value highlight, dismissible rows), quote stat groups, holdings comparison
- [x] MainChart: price / % return toggle, dynamic colour palette
- [x] DataTable: one row per asset, SVG sparkline trend column
- [x] **Auth** — login/signup page, route protection, sign-out in Sidebar, user email shown when expanded
- [x] **Dark mode** — full dark theme across all pages/components; Moon/Sun toggle in Sidebar
- [x] **Favourite from Explore** — amber star button adds/removes asset from dashboard favourites

---

## Global State (context.tsx)

- `symbols` / `setSymbols` — user's favourites (default: `['SPY', 'QQQ']`)
- `api` — backend base URL (`NEXT_PUBLIC_API_URL` or `http://localhost:4000`)
- `DEFAULT_SYMBOLS` — full default symbol list for suggestions
- `DEFAULT_FAVOURITES` — `['SPY', 'QQQ']` — what the dashboard defaults to
- `DATE_PRESETS` — shared array of `{ label, period, interval }` used by all pages

---

## TODO — Roadmap

### Infrastructure (do first)
- [x] **"Last updated" timestamp** on charts — shows HH:MM in chart subtitle when data loads
- [x] **Confirm Vercel build passes** and live site loads end-to-end
- [x] **Keep Render warm** — self-ping `/health` every 10 min via `setInterval` in `index.js`; uses `RENDER_EXTERNAL_URL` (Render built-in env var)
- [ ] **Tooltip crosshair** — vertical line following cursor across all series
- [x] **Animated transitions** when date range or asset selection changes — opacity fade on chart wrapper (300ms) + Recharts `animationDuration={400}` on all Line/Bar series

---

### V1 — MVP that actually hits (build next)

#### 1. Portfolio Simulator (MUST HAVE — drives retention)
- [x] New `/portfolio` page — UI label: "Portfolio Simulator" (strategy tool, NOT investment tracker)
- [x] Preset strategies: Global Market / Tech Growth / Crypto Mix (one-click quick start)
- [x] Holdings input: asset search + weight slider synced with number input + real-time total % validation
- [x] Weighted blended performance chart (all assets normalized to 100 at period start, then weighted sum)
- [x] Metrics panel: Total Return, CAGR, Volatility, Max Drawdown (only shown when weights = 100%)
- [x] Allocation donut chart (Recharts PieChart, color-coded by asset)
- [x] Persistence: multi-portfolio save with names — `portfolios` + `portfolio_assets` Supabase tables (replaced old single `portfolio_holdings` table)
- [x] Smart weight distribution: add asset → equal split; remove → redistribute; drag slider → others scale proportionally
- [x] Holdings summary table with live quotes (price, day change %, contribution to daily return)
- [x] Weighted portfolio day change metric ("Today") in metrics panel
- [x] Sidebar nav item: "Simulator" (PieChart icon)
- [x] Positioning: strategy simulation tool — no transaction history, no P&L, no cash balance

#### 2. Smart Insights (HIGH IMPACT — turns charts into decisions)
- [x] Auto-generated text callouts on Dashboard and Comparisons (`SmartInsights` component)
  - Outperformance: "QQQ outperforming SPY by +8.3% ann. return over 1Y"
  - Volatility: "BTC-USD is the most volatile at 62.4% ann. vol over 1Y"
  - Risk-adjusted: "SPY has the best risk-adjusted return (Sharpe 1.24) over 1Y"
  - Drawdown: "QQQ had a max drawdown of −28.3% over 1Y"
  - Beta: "NVDA has a beta of 1.87× vs SPY — high market sensitivity"
- [x] Fetches `/market-data/stats` client-side, maps date range to nearest 1Y/3Y/5Y window
- [x] Shown as callout bar above charts (indigo light / slate-800 dark)

#### 3. Comparison Metrics (your CORE identity)
- [x] Comparisons performance table: Ann. Return, Volatility, Sharpe, Max Drawdown, Beta, Calmar (1Y/3Y/5Y)
- [x] Custom index slots now show computed metrics from history data (not N/A)
- [x] Custom index column header shows asset count ("3-asset custom index")
- [x] Equal-width columns in comparison table (`table-fixed`)
- [x] "Best" highlighting per metric ✅

#### 4. Preloaded Data Packs (removes friction, instant value)
- [x] "Load pack" pill buttons on Dashboard and Comparisons — one click loads a curated set
  - **Global Indices** — SPY, ACWI, EEM, DIA
  - **Tech Growth** — QQQ, NVDA, TSLA, MSFT
  - **Crypto Basket** — BTC-USD, ETH-USD, SOL-USD
  - **Macro** — GLD, TLT, DXY
- [x] Dashboard empty state shows pack buttons so new users aren't stuck
- [x] Active pack pill highlights when current symbols match exactly

---

### V2 — Makes it addictive

#### 5. Scenario / Simulation (BIG engagement driver)
- [ ] New `/simulate` page
- [ ] "If I invested $10k in QQQ vs SPY on [date]"
- [ ] DCA simulator — monthly buys, shows accumulated value
- [ ] Rebalancing simulator — annual rebalance, compare vs buy-and-hold
- [ ] Uses existing history endpoint, computed client-side

#### 6. Price Alerts / Signals
- [ ] Alert rules stored per user in Supabase
- [ ] Trigger types: price above/below, % change in 24h/7d, new 52w high/low
- [ ] In-app notification on next load (email later)

#### 7. Explore — Make it feel alive
- [ ] Top gainers / losers today (from `/quotes` data)
- [ ] Most volatile assets
- [ ] Sector performance overview (ETF proxies: XLK, XLE, XLF, XLV…)
- [ ] "Trending" — most-viewed symbols (track in DB)

---

### V3 — Makes it special

#### 8. AI Layer
- [ ] "Explain this chart" — Claude API summarises visible data
- [ ] "Suggest allocation" — based on user's current holdings
- [ ] "What changed recently?" — news + price context
- [ ] MSCI Spotlight and preset suggestions (deferred from Comparisons ✅)

#### 9. Export CSV
- [ ] Download filtered chart/table data (requires auth ✅)

#### 10. More chart types
- [ ] Area chart, scatter plot (correlation view)

---

### Backend (ongoing)
- [ ] **Rate limiting** on API
- [ ] **Input validation** — sanitize upload data properly
- [ ] **Pagination** on `/pivot-data` for large datasets

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
