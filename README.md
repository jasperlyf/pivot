# Pivot — Financial Interactive Dashboard

A production-ready web app for uploading datasets and analyzing them interactively with pivot controls and charts.

## Tech Stack

| Layer     | Technology              |
|-----------|-------------------------|
| Frontend  | Next.js (App Router) + TailwindCSS + Recharts |
| Backend   | Node.js + Express       |
| ORM       | Prisma                  |
| Database  | PostgreSQL via Supabase |
| Hosting   | Vercel (frontend) + Render (backend) |

## Project Structure

```
pivot/
├── frontend/       # Next.js App Router
├── backend/        # Express API
├── prisma/         # Prisma schema & migrations
├── datasets/       # Seed CSV files
└── README.md
```

## Features

- Upload CSV/Excel datasets
- Interactive pivot controls (group by day/week/month)
- Aggregation: sum, average, percentage change
- Line & bar charts powered by Recharts
- Filter by asset, category, date range
- Pre-seeded with Global Markets (SPY, ACWI) and Crypto (BTC, ETH) data

## Getting Started

### Prerequisites

- Node.js 18+
- A free [Supabase](https://supabase.com) account

### Environment Variables

**Backend** (`backend/.env`):
```
DATABASE_URL=postgresql://...
PORT=4000
```

**Frontend** (`frontend/.env.local`):
```
NEXT_PUBLIC_API_URL=http://localhost:4000
```

### Run Locally

```bash
# Backend
cd backend && npm install && npm run dev

# Frontend
cd frontend && npm install && npm run dev
```

## Deployment

- **Frontend**: Deploy `frontend/` to [Vercel](https://vercel.com)
- **Backend**: Deploy `backend/` to [Render](https://render.com)
- **Database**: Hosted on [Supabase](https://supabase.com) free tier

## License

MIT
