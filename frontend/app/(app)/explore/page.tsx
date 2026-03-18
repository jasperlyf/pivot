'use client';

import { useEffect, useState, useRef } from 'react';
import { useApp, DATE_PRESETS, DateRange } from '@/lib/context';
import { Search, X, TrendingUp, TrendingDown, Star, Bookmark, Check, RefreshCw } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { createClient } from '@/lib/supabase/browser';

interface HistoryRow  { date: string; asset: string; name: string; category: string; value: number; }
interface QuoteData {
  symbol: string; name: string; category: string;
  price: number | null; change: number | null; changePct: number | null;
  prevClose: number | null; open: number | null;
  dayHigh: number | null; dayLow: number | null;
  volume: number | null; avgVolume: number | null;
  marketCap: number | null; week52High: number | null; week52Low: number | null;
  expenseRatio: number | null; currency: string;
}
interface AssetStats {
  symbol: string; dataPoints: number; periodsCovered: string[];
  annualisedReturn: Record<string, number | null>;
  annualisedVolatility: Record<string, number | null>;
  sharpeRatio: Record<string, number | null>;
  maxDrawdown: Record<string, number | null>;
  beta: Record<string, number | null>;
  calmarRatio: Record<string, number | null>;
}
interface HoldingItem { symbol: string; name: string; pct: number | null; }
interface HoldingsData {
  symbol: string; holdings: HoldingItem[];
  equityPct: number | null; bondPct: number | null; cashPct: number | null;
}

function fmtPrice(v: number | null) {
  if (v == null) return '—';
  return v >= 1000 ? `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : `$${v.toFixed(2)}`;
}
function fmtLarge(v: number | null) {
  if (v == null) return '—';
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9)  return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6)  return `$${(v / 1e6).toFixed(1)}M`;
  return `$${v.toLocaleString()}`;
}
function fmtVol(v: number | null) {
  if (v == null) return '—';
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return `${v}`;
}
function fmtPct(v: number | null)   { return v == null ? '—' : `${(v * 100).toFixed(1)}%`; }
function fmtRatio(v: number | null) { return v == null ? '—' : v.toFixed(2); }

const QUOTE_SECTIONS = [
  {
    label: 'Price',
    fields: [
      { label: 'Open',       key: 'open'      as keyof QuoteData, fmt: fmtPrice },
      { label: 'Day High',   key: 'dayHigh'   as keyof QuoteData, fmt: fmtPrice },
      { label: 'Day Low',    key: 'dayLow'    as keyof QuoteData, fmt: fmtPrice },
      { label: 'Prev Close', key: 'prevClose' as keyof QuoteData, fmt: fmtPrice },
    ],
  },
  {
    label: '52-Week',
    fields: [
      { label: '52W High', key: 'week52High' as keyof QuoteData, fmt: fmtPrice },
      { label: '52W Low',  key: 'week52Low'  as keyof QuoteData, fmt: fmtPrice },
    ],
  },
  {
    label: 'Market',
    fields: [
      { label: 'Market Cap',    key: 'marketCap'    as keyof QuoteData, fmt: fmtLarge },
      { label: 'Volume',        key: 'volume'       as keyof QuoteData, fmt: fmtVol },
      { label: 'Avg Volume',    key: 'avgVolume'    as keyof QuoteData, fmt: fmtVol },
      { label: 'Expense Ratio', key: 'expenseRatio' as keyof QuoteData, fmt: (v: any) => v != null ? `${v}%` : '—' },
    ],
  },
];

const PERF_ROWS = [
  { label: 'Ann. Return',  key: 'annualisedReturn'     as keyof AssetStats, fmt: fmtPct,   hint: 'Geometric annualised return' },
  { label: 'Volatility',   key: 'annualisedVolatility' as keyof AssetStats, fmt: fmtPct,   hint: 'Annualised std dev of monthly returns' },
  { label: 'Sharpe Ratio', key: 'sharpeRatio'          as keyof AssetStats, fmt: fmtRatio, hint: 'Excess return / vol (4.5% risk-free)' },
  { label: 'Max Drawdown', key: 'maxDrawdown'          as keyof AssetStats, fmt: fmtPct,   hint: 'Peak-to-trough decline' },
  { label: 'Beta vs SPY',  key: 'beta'                 as keyof AssetStats, fmt: fmtRatio, hint: 'Sensitivity to S&P 500 moves' },
  { label: 'Calmar Ratio', key: 'calmarRatio'          as keyof AssetStats, fmt: fmtRatio, hint: 'Ann. return / |max drawdown|' },
];

const POPULAR = ['SPY', 'QQQ', 'ACWI', 'BTC-USD', 'ETH-USD', 'NVDA', 'AAPL', 'TSLA', 'GLD', 'TLT'];

function Range52W({ low, high, price }: { low: number | null; high: number | null; price: number | null }) {
  if (low == null || high == null || price == null || high === low) return <span className="text-slate-300 dark:text-slate-600">—</span>;
  const pct = Math.max(0, Math.min(100, ((price - low) / (high - low)) * 100));
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <span className="text-[10px] text-slate-400 dark:text-slate-500 tabular-nums w-12 text-right shrink-0">{fmtPrice(low)}</span>
      <div className="relative flex-1 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full">
        <div
          className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-indigo-500 border-2 border-white dark:border-slate-900 shadow-sm"
          style={{ left: `calc(${pct}% - 5px)` }}
        />
      </div>
      <span className="text-[10px] text-slate-400 dark:text-slate-500 tabular-nums w-12 shrink-0">{fmtPrice(high)}</span>
    </div>
  );
}

function MiniSparkline({ data, positive }: { data: { v: number }[]; positive: boolean }) {
  if (!data.length) return null;
  return (
    <LineChart width={80} height={32} data={data}>
      <Line type="monotone" dataKey="v" stroke={positive ? '#10b981' : '#f43f5e'} strokeWidth={1.5} dot={false} animationDuration={0} />
    </LineChart>
  );
}

export default function ExplorePage() {
  const { api, symbols, setSymbols, user } = useApp();
  const supabase = createClient();

  const [symbol, setSymbol]         = useState('');
  const [dateRange, setDateRange]   = useState<DateRange>(DATE_PRESETS[3]);
  const [chartMode, setChartMode]   = useState<'price' | 'pct'>('price');
  const [statsWindow, setStatsWindow] = useState<'1Y' | '3Y' | '5Y'>('1Y');

  const [query, setQuery]           = useState('');
  const [results, setResults]       = useState<{ symbol: string; name: string }[]>([]);
  const [focused, setFocused]       = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const [history,  setHistory]  = useState<HistoryRow[]>([]);
  const [quote,    setQuote]    = useState<QuoteData | null>(null);
  const [stats,    setStats]    = useState<AssetStats | null>(null);
  const [holdings, setHoldings] = useState<HoldingsData | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  // Watchlist state
  const [watchlistQuotes, setWatchlistQuotes]     = useState<QuoteData[]>([]);
  const [watchlistHistory, setWatchlistHistory]   = useState<Record<string, { v: number }[]>>({});
  const [watchlistLoading, setWatchlistLoading]   = useState(false);
  const [watchlistUpdatedAt, setWatchlistUpdatedAt] = useState<Date | null>(null);

  // Save view state
  const [saveOpen, setSaveOpen]           = useState(false);
  const [saveWorkspaces, setSaveWorkspaces] = useState<{ id: string; name: string }[]>([]);
  const [saveWsId, setSaveWsId]           = useState('');
  const [saveViewName, setSaveViewName]   = useState('');
  const [saving, setSaving]               = useState(false);
  const [saveDone, setSaveDone]           = useState(false);

  // Close search on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setFocused(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // Fetch watchlist quotes + sparklines whenever favourites change
  useEffect(() => {
    if (!symbols.length) { setWatchlistQuotes([]); return; }
    loadWatchlist();
  }, [symbols, api]); // eslint-disable-line

  async function loadWatchlist() {
    setWatchlistLoading(true);
    const joined = symbols.join(',');
    const [quotesRes, histRes] = await Promise.all([
      fetch(`${api}/market-data/quotes?symbols=${joined}`).then((r) => r.json()).catch(() => []),
      fetch(`${api}/market-data/history?symbols=${joined}&period=1m&interval=1d`).then((r) => r.json()).catch(() => []),
    ]);
    setWatchlistQuotes(quotesRes ?? []);
    // Build per-symbol sparkline arrays from history
    const map: Record<string, { v: number }[]> = {};
    for (const row of (histRes as HistoryRow[])) {
      if (!map[row.asset]) map[row.asset] = [];
      map[row.asset].push({ v: row.value });
    }
    setWatchlistHistory(map);
    setWatchlistUpdatedAt(new Date());
    setWatchlistLoading(false);
  }

  // Search debounce
  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const t = setTimeout(() => {
      fetch(`${api}/market-data/search?q=${encodeURIComponent(query)}`)
        .then((r) => r.json()).then(setResults).catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [query, api]);

  const selectSymbol = (s: string) => {
    setSymbol(s);
    setQuery(s);
    setFocused(false);
    setResults([]);
    setHistory([]);
    setQuote(null);
    setStats(null);
    setHoldings(null);
    setSaveDone(false);
  };

  const clearSymbol = () => {
    setSymbol('');
    setQuery('');
    setHistory([]);
    setQuote(null);
    setStats(null);
    setHoldings(null);
  };

  // Fetch history for selected symbol
  useEffect(() => {
    if (!symbol) return;
    setLoadingHistory(true);
    fetch(`${api}/market-data/history?symbols=${symbol}&period=${dateRange.period}&interval=${dateRange.interval}`)
      .then((r) => r.json())
      .then((d) => { setHistory(d); setLoadingHistory(false); setUpdatedAt(new Date()); })
      .catch(() => setLoadingHistory(false));
  }, [symbol, dateRange, api]);

  useEffect(() => {
    if (!symbol) return;
    fetch(`${api}/market-data/quotes?symbols=${symbol}`)
      .then((r) => r.json())
      .then((d: QuoteData[]) => setQuote(d[0] ?? null))
      .catch(() => {});
  }, [symbol, api]);

  useEffect(() => {
    if (!symbol) return;
    fetch(`${api}/market-data/stats?symbols=${symbol}`)
      .then((r) => r.json())
      .then((d: AssetStats[]) => setStats(d[0] ?? null))
      .catch(() => {});
  }, [symbol, api]);

  useEffect(() => {
    if (!symbol) return;
    fetch(`${api}/market-data/holdings?symbol=${symbol}`)
      .then((r) => r.json())
      .then(setHoldings)
      .catch(() => {});
  }, [symbol, api]);

  const chartData = (() => {
    const rows = [...history].sort((a, b) => a.date.localeCompare(b.date));
    if (chartMode === 'price') return rows.map((r) => ({ date: r.date, value: r.value }));
    if (!rows.length) return [];
    const base = rows[0].value;
    return rows.map((r) => ({ date: r.date, value: parseFloat(((r.value / base) * 100).toFixed(2)) }));
  })();

  const periodReturn = chartMode === 'pct' && chartData.length > 1
    ? parseFloat((chartData[chartData.length - 1].value - 100).toFixed(2))
    : null;

  const pos = quote ? (quote.changePct ?? 0) >= 0 : true;
  const showDropdown = focused && (results.length > 0 || !query.trim());

  async function openSaveModal() {
    if (!user) return;
    const { data } = await supabase
      .from('workspaces')
      .select('id, name')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });
    setSaveWorkspaces(data ?? []);
    setSaveWsId(data?.[0]?.id ?? '');
    setSaveViewName(symbol);
    setSaveDone(false);
    setSaveOpen(true);
  }

  async function saveView() {
    if (!saveWsId || !saveViewName.trim()) return;
    setSaving(true);
    const config = { symbols: [symbol], period: dateRange.period, interval: dateRange.interval, mode: chartMode };
    await supabase.from('workspace_views').insert({ workspace_id: saveWsId, name: saveViewName.trim(), config });
    await supabase.from('workspaces').update({ updated_at: new Date().toISOString() }).eq('id', saveWsId);
    setSaving(false);
    setSaveDone(true);
  }

  return (
    <div className="space-y-5">
      {/* Header + search */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Explore</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Search any asset to see its full profile</p>
        </div>

        <div ref={searchRef} className="relative w-80">
          <div className={`flex items-center gap-2 bg-white dark:bg-slate-900 border rounded-xl px-3 py-2.5 transition-all ${
            focused ? 'border-indigo-400 ring-2 ring-indigo-50 dark:ring-indigo-950 shadow-sm' : 'border-slate-200 dark:border-slate-700 shadow-sm'
          }`}>
            <Search size={14} className="text-slate-400 dark:text-slate-500 shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setFocused(true)}
              placeholder="Search ticker or company…"
              className="flex-1 text-sm outline-none bg-transparent text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-600"
            />
            {query && (
              <button onClick={clearSymbol} className="text-slate-300 dark:text-slate-600 hover:text-slate-500 transition-colors">
                <X size={13} />
              </button>
            )}
          </div>

          {showDropdown && (
            <div className="absolute top-12 left-0 right-0 z-50 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              {results.length > 0 ? (
                <ul className="max-h-60 overflow-y-auto">
                  {results.slice(0, 8).map((r, i) => (
                    <li key={`${r.symbol}-${i}`}>
                      <button onClick={() => selectSymbol(r.symbol)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 text-left transition-colors">
                        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 w-16 shrink-0">{r.symbol}</span>
                        <span className="text-xs text-slate-400 dark:text-slate-500 truncate">{r.name}</span>
                        {symbols.includes(r.symbol) && <Star size={11} className="ml-auto shrink-0 fill-amber-400 text-amber-400" />}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="px-4 py-3">
                  <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-2">Popular</p>
                  <div className="flex flex-wrap gap-1.5">
                    {POPULAR.map((s) => (
                      <button key={s} onClick={() => selectSymbol(s)}
                        className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
                          symbols.includes(s)
                            ? 'bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                        }`}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Watchlist table — shown when no symbol selected */}
      {!symbol && (
        <>
          {symbols.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center py-20 text-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center">
                <Star size={20} className="text-slate-300 dark:text-slate-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No favourites yet</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Search for an asset and star it to add it here</p>
              </div>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              {/* Table header */}
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <Star size={13} className="fill-amber-400 text-amber-400" />
                  <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Watchlist</h2>
                  <span className="text-xs text-slate-400 dark:text-slate-500">{symbols.length} asset{symbols.length !== 1 ? 's' : ''}</span>
                </div>
                <button
                  onClick={loadWatchlist}
                  disabled={watchlistLoading}
                  title="Refresh prices"
                  className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-40"
                >
                  <RefreshCw size={13} className={watchlistLoading ? 'animate-spin' : ''} />
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/50">
                      <th className="px-5 py-2.5 text-left text-xs font-medium text-slate-400 dark:text-slate-500">Symbol</th>
                      <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-400 dark:text-slate-500">Price</th>
                      <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-400 dark:text-slate-500">Change</th>
                      <th className="px-4 py-2.5 text-center text-xs font-medium text-slate-400 dark:text-slate-500">1M</th>
                      <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-400 dark:text-slate-500">Volume</th>
                      <th className="px-5 py-2.5 text-right text-xs font-medium text-slate-400 dark:text-slate-500">Market Cap</th>
                      <th className="px-5 py-2.5 text-center text-xs font-medium text-slate-400 dark:text-slate-500">52W Range</th>
                    </tr>
                  </thead>
                  <tbody>
                    {watchlistLoading && watchlistQuotes.length === 0
                      ? symbols.map((s) => (
                          <tr key={s} className="border-b border-slate-50 dark:border-slate-800">
                            <td className="px-5 py-3.5">
                              <div className="h-4 w-12 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
                            </td>
                            {[1,2,3,4,5,6].map((i) => (
                              <td key={i} className="px-4 py-3.5">
                                <div className="h-4 w-16 bg-slate-100 dark:bg-slate-800 rounded animate-pulse ml-auto" />
                              </td>
                            ))}
                          </tr>
                        ))
                      : watchlistQuotes.map((q) => {
                          const positive = (q.changePct ?? 0) >= 0;
                          const sparkData = watchlistHistory[q.symbol] ?? [];
                          return (
                            <tr
                              key={q.symbol}
                              onClick={() => selectSymbol(q.symbol)}
                              className="border-b border-slate-50 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer transition-colors group"
                            >
                              {/* Symbol + name */}
                              <td className="px-5 py-3.5">
                                <div className="flex items-center gap-2">
                                  <div>
                                    <p className="text-sm font-bold text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{q.symbol}</p>
                                    <p className="text-xs text-slate-400 dark:text-slate-500 truncate max-w-[140px]">{q.name}</p>
                                  </div>
                                </div>
                              </td>

                              {/* Price */}
                              <td className="px-4 py-3.5 text-right">
                                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 tabular-nums">{fmtPrice(q.price)}</span>
                              </td>

                              {/* Change */}
                              <td className="px-4 py-3.5 text-right">
                                <div className={`flex flex-col items-end ${positive ? 'text-emerald-600' : 'text-rose-600'}`}>
                                  <span className="text-sm font-semibold tabular-nums">
                                    {q.changePct != null ? `${positive ? '+' : ''}${q.changePct.toFixed(2)}%` : '—'}
                                  </span>
                                  <span className="text-xs tabular-nums opacity-75">
                                    {q.change != null ? `${positive ? '+' : ''}${fmtPrice(q.change)}` : ''}
                                  </span>
                                </div>
                              </td>

                              {/* Sparkline */}
                              <td className="px-4 py-3.5">
                                <div className="flex justify-center">
                                  <MiniSparkline data={sparkData} positive={positive} />
                                </div>
                              </td>

                              {/* Volume */}
                              <td className="px-4 py-3.5 text-right">
                                <div className="flex flex-col items-end">
                                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300 tabular-nums">{fmtVol(q.volume)}</span>
                                  <span className="text-[10px] text-slate-400 dark:text-slate-500 tabular-nums">avg {fmtVol(q.avgVolume)}</span>
                                </div>
                              </td>

                              {/* Market cap */}
                              <td className="px-5 py-3.5 text-right">
                                <span className="text-xs font-medium text-slate-700 dark:text-slate-300 tabular-nums">{fmtLarge(q.marketCap)}</span>
                              </td>

                              {/* 52W Range */}
                              <td className="px-5 py-3.5">
                                <Range52W low={q.week52Low} high={q.week52High} price={q.price} />
                              </td>
                            </tr>
                          );
                        })
                    }
                  </tbody>
                </table>
              </div>

              {watchlistUpdatedAt && (
                <div className="px-5 py-2.5 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400 dark:text-slate-600">
                  Updated {watchlistUpdatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Back to watchlist + quick-switch chips when a symbol is loaded */}
      {symbol && symbols.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={clearSymbol}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors font-medium"
          >
            ← Watchlist
          </button>
          <span className="text-slate-200 dark:text-slate-700">|</span>
          {symbols.map((s) => (
            <button
              key={s}
              onClick={() => selectSymbol(s)}
              className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors border ${
                symbol === s
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-indigo-300 hover:text-indigo-600 dark:hover:text-indigo-400'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Asset header */}
      {symbol && quote && (() => {
        const isFav = symbols.includes(symbol);
        const toggleFav = () =>
          setSymbols(isFav ? symbols.filter((s) => s !== symbol) : [...symbols, symbol]);
        return (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm px-6 py-5 flex items-center justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{symbol}</h2>
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 capitalize">{quote.category}</span>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{quote.name}</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-end gap-3">
                <span className="text-3xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">{fmtPrice(quote.price)}</span>
                <div className={`flex items-center gap-1 pb-1 text-sm font-semibold ${pos ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {pos ? <TrendingUp size={15} /> : <TrendingDown size={15} />}
                  <span>{pos ? '+' : ''}{quote.changePct}% today</span>
                </div>
              </div>
              <button
                onClick={toggleFav}
                title={isFav ? 'Remove from favourites' : 'Add to favourites'}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition-all ${
                  isFav
                    ? 'bg-amber-50 dark:bg-amber-950 border-amber-200 text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-900'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-amber-300 hover:text-amber-500'
                }`}
              >
                <Star size={13} className={isFav ? 'fill-amber-400 text-amber-400' : ''} />
                {isFav ? 'Favourited' : 'Add to favourites'}
              </button>
              <button
                onClick={openSaveModal}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:border-indigo-300 hover:text-indigo-600 dark:hover:text-indigo-400 bg-white dark:bg-slate-900 transition-all"
              >
                <Bookmark size={13} /> Save View
              </button>
            </div>
          </div>
        );
      })()}

      {/* Chart */}
      {symbol && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="flex items-center gap-3">
              {periodReturn != null && (
                <span className={`text-sm font-semibold ${periodReturn >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {periodReturn >= 0 ? '+' : ''}{periodReturn}% this period
                </span>
              )}
              {updatedAt && (
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  Updated {updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg overflow-hidden text-xs font-medium">
                <button onClick={() => setChartMode('price')} className={`px-3 py-1.5 transition-colors ${chartMode === 'price' ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-800 dark:text-slate-200' : 'text-slate-500 dark:text-slate-400'}`}>Price</button>
                <button onClick={() => setChartMode('pct')}   className={`px-3 py-1.5 transition-colors ${chartMode === 'pct'   ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-800 dark:text-slate-200' : 'text-slate-500 dark:text-slate-400'}`}>% Return</button>
              </div>
              <div className="flex gap-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-1">
                {DATE_PRESETS.map((p) => (
                  <button key={p.label} onClick={() => setDateRange(p)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${dateRange.label === p.label ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className={`transition-opacity duration-300 ${loadingHistory ? 'opacity-40' : 'opacity-100'}`}>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} width={chartMode === 'price' ? 60 : 40}
                    tickFormatter={chartMode === 'price' ? (v) => `$${Number(v).toLocaleString()}` : (v) => `${v}`} />
                  <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, fontSize: 12 }}
                    formatter={(v) => chartMode === 'price'
                      ? [`$${Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}`, symbol]
                      : [`${v}`, symbol]} />
                  <Line type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2} dot={false} animationDuration={400} animationEasing="ease-out" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-64 flex items-center justify-center text-slate-400 dark:text-slate-500 text-sm">
                {loadingHistory ? 'Loading…' : 'No data'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Quote stats */}
      {symbol && quote && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {QUOTE_SECTIONS.map(({ label, fields }) => {
            const visible = fields.filter(({ key }) => quote[key] != null);
            if (!visible.length) return null;
            return (
              <div key={label} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-5">
                <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">{label}</p>
                <div className="space-y-2.5">
                  {visible.map(({ label: fl, key, fmt }) => (
                    <div key={key} className="flex items-center justify-between">
                      <span className="text-xs text-slate-500 dark:text-slate-400">{fl}</span>
                      <span className="text-sm font-semibold text-slate-800 dark:text-slate-200 tabular-nums">{fmt(quote[key] as any)}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Performance stats */}
      {symbol && stats && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Performance</p>
            <div className="flex gap-1">
              {(['1Y', '3Y', '5Y'] as const).map((w) => (
                <button key={w} onClick={() => setStatsWindow(w)}
                  className={`text-xs px-2.5 py-1 rounded-md font-semibold transition-colors ${statsWindow === w ? 'bg-indigo-600 text-white' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'}`}>
                  {w}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {PERF_ROWS.map(({ label, key, fmt, hint }) => {
              const covered = stats.periodsCovered?.includes(statsWindow);
              const val = covered ? (stats[key] as Record<string, number | null>)[statsWindow] : null;
              const isReturn = key === 'annualisedReturn';
              const isDD = key === 'maxDrawdown';
              const isSharpe = key === 'sharpeRatio';
              const color = isDD ? 'text-rose-600'
                : isReturn && val != null ? (val >= 0 ? 'text-emerald-600' : 'text-rose-600')
                : isSharpe && val != null ? (val >= 1 ? 'text-emerald-600' : val >= 0.5 ? 'text-amber-600' : 'text-rose-600')
                : 'text-slate-900 dark:text-slate-100';
              return (
                <div key={key as string} className="space-y-1">
                  <p className="text-xs text-slate-400 dark:text-slate-500" title={hint}>{label}</p>
                  <p className={`text-xl font-bold tabular-nums ${color}`}>
                    {covered ? fmt(val) : <span className="text-slate-300 dark:text-slate-600 text-sm font-normal">N/A</span>}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Holdings */}
      {symbol && holdings && holdings.holdings.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="px-5 pt-5 pb-3">
            <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Top Holdings</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{holdings.holdings.length} positions</p>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-y border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60">
                <th className="px-5 py-2.5 text-left text-xs font-medium text-slate-400 dark:text-slate-500">Ticker</th>
                <th className="px-5 py-2.5 text-left text-xs font-medium text-slate-400 dark:text-slate-500">Company</th>
                <th className="px-5 py-2.5 text-right text-xs font-medium text-slate-400 dark:text-slate-500">Weight</th>
              </tr>
            </thead>
            <tbody>
              {holdings.holdings.map((h) => {
                const maxPct = Math.max(...holdings.holdings.map((x) => x.pct ?? 0));
                return (
                  <tr key={h.symbol} className="border-b border-slate-50 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                    <td className="px-5 py-2.5 text-xs font-bold text-slate-900 dark:text-slate-100">{h.symbol}</td>
                    <td className="px-5 py-2.5 text-xs text-slate-500 dark:text-slate-400 truncate max-w-xs">{h.name}</td>
                    <td className="px-5 py-2.5 text-right">
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 tabular-nums">{h.pct != null ? `${h.pct.toFixed(2)}%` : '—'}</span>
                        {h.pct != null && (
                          <div className="w-24 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-indigo-400/60" style={{ width: `${Math.round((h.pct / maxPct) * 100)}%` }} />
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {(holdings.equityPct != null || holdings.bondPct != null || holdings.cashPct != null) && (
            <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex gap-6 text-xs text-slate-500 dark:text-slate-400">
              {holdings.equityPct != null && <span>Equity <span className="font-semibold text-slate-700 dark:text-slate-300">{holdings.equityPct}%</span></span>}
              {holdings.bondPct   != null && <span>Bonds  <span className="font-semibold text-slate-700 dark:text-slate-300">{holdings.bondPct}%</span></span>}
              {holdings.cashPct   != null && <span>Cash   <span className="font-semibold text-slate-700 dark:text-slate-300">{holdings.cashPct}%</span></span>}
            </div>
          )}
        </div>
      )}

      {/* Save View Modal */}
      {saveOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5">
            {saveDone ? (
              <div className="flex flex-col items-center gap-3 py-4">
                <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-950 flex items-center justify-center">
                  <Check size={22} className="text-emerald-600" />
                </div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">View saved!</p>
                <button onClick={() => setSaveOpen(false)} className="mt-1 text-xs text-indigo-500 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium transition-colors">
                  Close
                </button>
              </div>
            ) : (
              <>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Save to Workspace</h3>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Save this asset view to a workspace</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <span className="text-xs px-2.5 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 font-medium border border-indigo-100 dark:border-indigo-900">{symbol}</span>
                  <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-medium">{dateRange.label}</span>
                  <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-medium capitalize">{chartMode === 'pct' ? '% Return' : 'Price'}</span>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block mb-1.5">View name</label>
                    <input
                      value={saveViewName}
                      onChange={(e) => setSaveViewName(e.target.value)}
                      placeholder="e.g. SPY 1Y price chart"
                      className="w-full text-sm border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-600 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50 dark:focus:ring-indigo-950 transition-all"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block mb-1.5">Workspace</label>
                    {saveWorkspaces.length === 0 ? (
                      <p className="text-xs text-slate-400 dark:text-slate-500">No workspaces yet. Create one first.</p>
                    ) : (
                      <select
                        value={saveWsId}
                        onChange={(e) => setSaveWsId(e.target.value)}
                        className="w-full text-sm border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-400 transition-all"
                      >
                        {saveWorkspaces.map((w) => (
                          <option key={w.id} value={w.id}>{w.name}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button onClick={() => setSaveOpen(false)} className="px-4 py-2 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
                    Cancel
                  </button>
                  <button
                    onClick={saveView}
                    disabled={saving || !saveWsId || !saveViewName.trim()}
                    className="px-4 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg transition-colors"
                  >
                    {saving ? 'Saving…' : 'Save View'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
