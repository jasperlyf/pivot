'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/lib/context';

interface Quote {
  symbol: string;
  name: string;
  price: number | null;
  changePct: number | null;
}

interface HistoryPoint { date: string; value: number; }

// Fixed broad market overview — independent of user favourites
const TAPE_SYMBOLS = ['SPY', 'QQQ', 'ACWI', 'BTC-USD', 'ETH-USD', 'GLD', 'TLT', 'IWM', 'EEM', 'DIA'];

function Sparkline({ points, positive }: { points: HistoryPoint[]; positive: boolean }) {
  if (points.length < 2) return <span className="w-14 inline-block" />;
  const vals = points.map((p) => p.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const w = 56, h = 24, pad = 2;
  const pts = vals.map((v, i) => {
    const x = pad + (i / (vals.length - 1)) * (w - pad * 2);
    const y = pad + (1 - (v - min) / range) * (h - pad * 2);
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={w} height={h} className="overflow-visible shrink-0">
      <polyline points={pts} fill="none"
        stroke={positive ? '#10b981' : '#ef4444'}
        strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TickerItem({ quote, history }: { quote: Quote; history: HistoryPoint[] }) {
  const pos = (quote.changePct ?? 0) >= 0;
  const price = quote.price != null
    ? quote.price >= 1000
      ? `$${quote.price.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
      : `$${quote.price.toFixed(2)}`
    : '—';

  return (
    <div className="flex items-center gap-3 px-5 border-r border-slate-100 dark:border-slate-800 shrink-0">
      <div className="leading-snug">
        <p className="text-xs font-bold text-slate-800 dark:text-slate-200 tracking-wide">{quote.symbol}</p>
        <div className="flex items-baseline gap-1.5">
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 tabular-nums">{price}</span>
          <span className={`text-[11px] font-semibold tabular-nums ${pos ? 'text-emerald-500' : 'text-rose-500'}`}>
            {quote.changePct != null ? `${pos ? '+' : ''}${quote.changePct}%` : ''}
          </span>
        </div>
      </div>
      <Sparkline points={history} positive={pos} />
    </div>
  );
}

export default function TickerTape() {
  const { api } = useApp();
  const [quotes, setQuotes]   = useState<Quote[]>([]);
  const [history, setHistory] = useState<Record<string, HistoryPoint[]>>({});

  useEffect(() => {
    const sym = TAPE_SYMBOLS.join(',');

    fetch(`${api}/market-data/quotes?symbols=${sym}`)
      .then((r) => r.json())
      .then((data: Quote[]) => setQuotes(data))
      .catch(() => {});

    fetch(`${api}/market-data/history?symbols=${sym}&period=1m&interval=1d`)
      .then((r) => r.json())
      .then((rows: { date: string; asset: string; value: number }[]) => {
        const map: Record<string, HistoryPoint[]> = {};
        for (const r of rows) {
          if (!map[r.asset]) map[r.asset] = [];
          map[r.asset].push({ date: r.date, value: r.value });
        }
        for (const k of Object.keys(map)) map[k].sort((a, b) => a.date.localeCompare(b.date));
        setHistory(map);
      })
      .catch(() => {});
  }, [api]);

  // Refresh quotes every 60s
  useEffect(() => {
    const id = setInterval(() => {
      fetch(`${api}/market-data/quotes?symbols=${TAPE_SYMBOLS.join(',')}`)
        .then((r) => r.json())
        .then((data: Quote[]) => setQuotes(data))
        .catch(() => {});
    }, 60_000);
    return () => clearInterval(id);
  }, [api]);

  if (!quotes.length) return (
    <div className="h-11 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shrink-0" />
  );

  // 4 copies — animation scrolls exactly one copy (-25%), so copy 2 fills the
  // position copy 1 started at → truly seamless at any viewport width.
  const items = [...quotes, ...quotes, ...quotes, ...quotes];

  return (
    <div className="h-11 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 overflow-hidden relative flex items-center shrink-0">
      <div className="absolute left-0 top-0 h-full w-10 bg-gradient-to-r from-white dark:from-slate-900 to-transparent z-10 pointer-events-none" />
      <div className="absolute right-0 top-0 h-full w-10 bg-gradient-to-l from-white dark:from-slate-900 to-transparent z-10 pointer-events-none" />

      <div className="flex items-center animate-ticker" style={{ width: 'max-content' }}>
        {items.map((q, i) => (
          <TickerItem
            key={`${q.symbol}-${i}`}
            quote={q}
            history={history[q.symbol] ?? []}
          />
        ))}
      </div>
    </div>
  );
}
