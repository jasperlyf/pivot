'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useApp, DATE_PRESETS, DateRange } from '@/lib/context';
import { createClient } from '@/lib/supabase/browser';
import { Search, X, RotateCcw, Plus, Trash2 } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart as RechartsPie, Pie, Cell,
} from 'recharts';

// ── Constants ─────────────────────────────────────────────────────────────────
const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#f97316', '#84cc16'];

const PRESETS: { label: string; holdings: { symbol: string; weight: number }[] }[] = [
  { label: 'Global Market',  holdings: [{ symbol: 'SPY', weight: 60 }, { symbol: 'ACWI', weight: 25 }, { symbol: 'EEM', weight: 15 }] },
  { label: 'Tech Growth',    holdings: [{ symbol: 'QQQ', weight: 50 }, { symbol: 'NVDA', weight: 30 }, { symbol: 'TSLA', weight: 20 }] },
  { label: 'Crypto Mix',     holdings: [{ symbol: 'BTC-USD', weight: 60 }, { symbol: 'ETH-USD', weight: 40 }] },
];

// ── Types ─────────────────────────────────────────────────────────────────────
interface Holding { symbol: string; weight: number; }
interface HistoryPoint { date: string; value: number; }
interface SavedPortfolio { id: string; name: string; holdings: Holding[]; updatedAt: string; }
interface QuoteData {
  symbol: string; name: string; price: number | null; change: number | null;
  changePct: number | null; marketCap: number | null; volume: number | null; currency: string;
}

// ── Metrics ───────────────────────────────────────────────────────────────────
function computeMetrics(series: HistoryPoint[]) {
  if (series.length < 2) return null;
  const first = series[0].value;
  const last  = series[series.length - 1].value;
  const totalReturn = parseFloat(((last / first - 1) * 100).toFixed(2));
  const days  = (new Date(series[series.length - 1].date).getTime() - new Date(series[0].date).getTime()) / 86400000;
  const years = days / 365.25;
  const cagr  = years > 0.1 ? parseFloat(((Math.pow(last / first, 1 / years) - 1) * 100).toFixed(2)) : null;
  const rets  = series.slice(1).map((p, i) => (p.value - series[i].value) / series[i].value);
  const mean  = rets.reduce((a, b) => a + b, 0) / rets.length;
  const vol   = parseFloat((Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length * (rets.length / Math.max(years, 0.1))) * 100).toFixed(2));
  let peak = first, maxDD = 0;
  for (const p of series) {
    if (p.value > peak) peak = p.value;
    const dd = (p.value - peak) / peak;
    if (dd < maxDD) maxDD = dd;
  }
  return { totalReturn, cagr, vol, maxDD: parseFloat((maxDD * 100).toFixed(2)) };
}

// ── Portfolio series computation ──────────────────────────────────────────────
function buildPortfolioSeries(holdings: Holding[], historyMap: Record<string, HistoryPoint[]>): HistoryPoint[] {
  const filled = holdings.filter((h) => historyMap[h.symbol]?.length > 0);
  if (!filled.length) return [];
  const dateSets = filled.map((h) => new Set(historyMap[h.symbol].map((p) => p.date)));
  const commonDates = [...dateSets[0]].filter((d) => dateSets.every((s) => s.has(d))).sort();
  if (commonDates.length < 2) return [];
  const totalWeight = filled.reduce((s, h) => s + h.weight, 0);
  if (totalWeight === 0) return [];
  const normalized: Record<string, Record<string, number>> = {};
  for (const h of filled) {
    const pts = historyMap[h.symbol];
    const base = pts.find((p) => p.date === commonDates[0])?.value ?? null;
    if (!base) continue;
    normalized[h.symbol] = {};
    for (const p of pts) normalized[h.symbol][p.date] = (p.value / base) * 100;
  }
  return commonDates.map((date) => ({
    date,
    value: parseFloat(filled.reduce((sum, h) => sum + (h.weight / totalWeight) * (normalized[h.symbol]?.[date] ?? 100), 0).toFixed(4)),
  }));
}

// ── Search dropdown ────────────────────────────────────────────────────────────
function AssetSearch({ api, onSelect }: { api: string; onSelect: (symbol: string) => void }) {
  const [query, setQuery]     = useState('');
  const [results, setResults] = useState<{ symbol: string; name: string }[]>([]);
  const [open, setOpen]       = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setQuery(''); setResults([]); }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const t = setTimeout(() => {
      fetch(`${api}/market-data/search?q=${encodeURIComponent(query)}`)
        .then((r) => r.json()).then(setResults).catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [query, api]);

  const select = (symbol: string) => { onSelect(symbol); setOpen(false); setQuery(''); setResults([]); };

  return (
    <div ref={ref} className="relative">
      <div
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-950 hover:border-indigo-400 cursor-pointer transition-colors"
      >
        <Plus size={13} className="text-slate-400 dark:text-slate-500 shrink-0" />
        <span className="text-sm text-slate-400 dark:text-slate-500">Add asset</span>
      </div>
      {open && (
        <div className="absolute top-11 left-0 z-50 w-72 bg-white dark:bg-slate-900 rounded-xl shadow-xl dark:shadow-none border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="p-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 focus-within:border-indigo-400 transition-all">
              <Search size={13} className="text-slate-400 shrink-0" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search ticker or company…"
                className="flex-1 text-sm outline-none bg-transparent text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-600"
              />
            </div>
          </div>
          {results.length > 0 ? (
            <ul className="max-h-56 overflow-y-auto">
              {results.slice(0, 8).map((r, i) => (
                <li key={`${r.symbol}-${i}`}>
                  <button
                    onClick={() => select(r.symbol)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 text-left transition-colors"
                  >
                    <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 w-16 shrink-0">{r.symbol}</span>
                    <span className="text-xs text-slate-400 dark:text-slate-500 truncate">{r.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : query ? (
            <p className="text-xs text-slate-400 dark:text-slate-500 px-3 py-4 text-center">No results for &ldquo;{query}&rdquo;</p>
          ) : (
            <p className="text-xs text-slate-400 dark:text-slate-500 px-3 py-4 text-center">Type to search…</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function PortfolioPage() {
  const { api, user } = useApp();
  const supabase = createClient();

  // Multi-portfolio state
  const [savedPortfolios, setSavedPortfolios] = useState<SavedPortfolio[]>([]);
  const [currentId, setCurrentId]             = useState<string | null>(null);
  const [portfolioName, setPortfolioName]     = useState('');
  const [saving, setSaving]                   = useState(false);
  const [saved, setSaved]                     = useState(false);
  const [saveError, setSaveError]             = useState('');

  const [holdings, setHoldings]     = useState<Holding[]>([]);
  const [dateRange, setDateRange]   = useState<DateRange>(DATE_PRESETS[3]);
  const [historyMap, setHistoryMap] = useState<Record<string, HistoryPoint[]>>({});
  const [loading, setLoading]       = useState(false);
  const [quotes, setQuotes]         = useState<Record<string, QuoteData>>({});

  // Load all saved portfolios on mount, auto-load most recent
  useEffect(() => {
    if (!user) return;
    supabase
      .from('portfolios')
      .select('id, name, updated_at, portfolio_assets(asset_symbol, weight)')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .then(({ data }) => {
        if (data && data.length > 0) {
          const mapped = data.map((p: any) => ({
            id: p.id,
            name: p.name,
            updatedAt: p.updated_at,
            holdings: (p.portfolio_assets as any[]).map((h: any) => ({ symbol: h.asset_symbol, weight: h.weight })),
          }));
          setSavedPortfolios(mapped);
          // Auto-load most recent
          setCurrentId(mapped[0].id);
          setPortfolioName(mapped[0].name);
          setHoldings(mapped[0].holdings);
        }
      });
  }, [user]); // eslint-disable-line

  // Fetch history when symbols or date range change
  const symKey = holdings.map((h) => h.symbol).sort().join(',');
  const fetchHistory = useCallback(async () => {
    const symbols = holdings.map((h) => h.symbol).filter(Boolean);
    if (!symbols.length) return;
    setLoading(true);
    try {
      const res = await fetch(`${api}/market-data/history?symbols=${symbols.join(',')}&period=${dateRange.period}&interval=${dateRange.interval}`);
      const rows: { date: string; asset: string; value: number }[] = await res.json();
      const map: Record<string, HistoryPoint[]> = {};
      for (const r of rows) { if (!map[r.asset]) map[r.asset] = []; map[r.asset].push({ date: r.date, value: r.value }); }
      for (const k of Object.keys(map)) map[k].sort((a, b) => a.date.localeCompare(b.date));
      setHistoryMap(map);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [symKey, dateRange, api]); // eslint-disable-line

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  // Fetch quotes for all holdings
  useEffect(() => {
    const symbols = holdings.map((h) => h.symbol);
    if (!symbols.length) { setQuotes({}); return; }
    fetch(`${api}/market-data/quotes?symbols=${symbols.join(',')}`)
      .then((r) => r.json())
      .then((data: QuoteData[]) => {
        const map: Record<string, QuoteData> = {};
        for (const q of data) map[q.symbol] = q;
        setQuotes(map);
      })
      .catch(() => {});
  }, [symKey, api]); // eslint-disable-line

  // Derived
  const totalWeight     = holdings.reduce((s, h) => s + h.weight, 0);
  const weightOk        = totalWeight === 100;
  const portfolioSeries = weightOk ? buildPortfolioSeries(holdings, historyMap) : [];
  const metrics         = weightOk && portfolioSeries.length > 1 ? computeMetrics(portfolioSeries) : null;

  // Weighted portfolio day change (using actual weights, not normalised)
  const weightedDayChange = (() => {
    if (!weightOk || !holdings.length) return null;
    let sum = 0, covered = 0;
    for (const h of holdings) {
      const q = quotes[h.symbol];
      if (q?.changePct != null) { sum += (h.weight / 100) * q.changePct; covered += h.weight; }
    }
    return covered > 0 ? sum : null;
  })();

  // Smart weight helpers
  const equalSplit = (list: Holding[]): Holding[] => {
    const n = list.length;
    const base = Math.floor(100 / n);
    const extra = 100 - base * n;
    return list.map((h, i) => ({ ...h, weight: base + (i < extra ? 1 : 0) }));
  };

  const addHolding = (symbol: string) => {
    if (holdings.length >= 10) return;
    if (holdings.some((h) => h.symbol === symbol)) return;
    setHoldings((prev) => equalSplit([...prev, { symbol, weight: 0 }]));
  };

  const removeHolding = (i: number) => {
    setHoldings((prev) => {
      const remaining = prev.filter((_, idx) => idx !== i);
      return remaining.length ? equalSplit(remaining) : [];
    });
  };

  const setWeight = (i: number, newWeight: number) => {
    const clamped = Math.max(0, Math.min(100, newWeight));
    setHoldings((prev) => {
      const others = prev.map((h, idx) => idx === i ? null : h).filter(Boolean) as Holding[];
      const remainder = 100 - clamped;
      const otherTotal = others.reduce((s, h) => s + h.weight, 0);
      let adjusted: Holding[];
      if (otherTotal === 0 || others.length === 0) {
        const base = Math.floor(remainder / (others.length || 1));
        const extra = remainder - base * others.length;
        adjusted = others.map((h, j) => ({ ...h, weight: base + (j < extra ? 1 : 0) }));
      } else {
        adjusted = others.map((h) => ({ ...h, weight: Math.round((h.weight / otherTotal) * remainder) }));
        const drift = remainder - adjusted.reduce((s, h) => s + h.weight, 0);
        if (adjusted.length > 0) adjusted[0] = { ...adjusted[0], weight: adjusted[0].weight + drift };
      }
      let ai = 0;
      return prev.map((h, idx) => idx === i ? { ...h, weight: clamped } : adjusted[ai++]);
    });
  };

  const applyPreset = (preset: typeof PRESETS[0]) => { setHoldings(preset.holdings); setHistoryMap({}); };
  const newPortfolio = () => { setCurrentId(null); setPortfolioName(''); setHoldings([]); };
  const loadPortfolio = (p: SavedPortfolio) => { setCurrentId(p.id); setPortfolioName(p.name); setHoldings(p.holdings); };

  const deletePortfolio = async (id: string) => {
    await supabase.from('portfolios').delete().eq('id', id);
    setSavedPortfolios((prev) => prev.filter((p) => p.id !== id));
    if (currentId === id) { setCurrentId(null); setPortfolioName(''); setHoldings([]); }
  };

  const savePortfolio = async () => {
    if (!user || !portfolioName.trim()) return;
    setSaving(true);
    setSaveError('');
    let portfolioId = currentId;
    if (!portfolioId) {
      const { data, error } = await supabase
        .from('portfolios')
        .insert({ user_id: user.id, name: portfolioName.trim(), updated_at: new Date().toISOString() })
        .select().single();
      if (error) { setSaveError(error.message); setSaving(false); return; }
      portfolioId = data?.id ?? null;
      if (portfolioId) setCurrentId(portfolioId);
    } else {
      const { error } = await supabase.from('portfolios')
        .update({ name: portfolioName.trim(), updated_at: new Date().toISOString() })
        .eq('id', portfolioId);
      if (error) { setSaveError(error.message); setSaving(false); return; }
    }
    if (!portfolioId) { setSaveError('Failed to create portfolio — check DB tables exist.'); setSaving(false); return; }
    await supabase.from('portfolio_assets').delete().eq('portfolio_id', portfolioId);
    if (holdings.length) {
      await supabase.from('portfolio_assets').insert(
        holdings.map((h) => ({ portfolio_id: portfolioId!, asset_symbol: h.symbol, weight: h.weight }))
      );
    }
    setSavedPortfolios((prev) => {
      const entry = { id: portfolioId!, name: portfolioName.trim(), holdings, updatedAt: new Date().toISOString() };
      const exists = prev.find((p) => p.id === portfolioId);
      return exists ? prev.map((p) => p.id === portfolioId ? entry : p) : [entry, ...prev];
    });
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  // Weight status
  const ws = (() => {
    if (weightOk) return { label: `${totalWeight}% ✓`, cls: 'text-emerald-600 dark:text-emerald-400' };
    if (totalWeight > 100) return { label: `${totalWeight}% ↑ over`, cls: 'text-rose-600 dark:text-rose-400' };
    return { label: `${totalWeight}% ↓ under`, cls: 'text-amber-600 dark:text-amber-400' };
  })();

  const donutData = holdings.filter((h) => h.weight > 0).map((h, i) => ({
    name: h.symbol, value: h.weight, color: COLORS[i % COLORS.length],
  }));

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Portfolio Simulator</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">A portfolio strategy simulation tool for decision-making</p>
        </div>
        <div className="flex gap-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-1">
          {DATE_PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => setDateRange(p)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                dateRange.label === p.label
                  ? 'bg-indigo-600 text-white shadow-sm dark:shadow-none'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Saved portfolios panel */}
      {user && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Saved Portfolios</p>
            <button onClick={newPortfolio} className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 font-medium hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors">
              <Plus size={11} /> New
            </button>
          </div>
          {savedPortfolios.length === 0 ? (
            <p className="px-5 py-4 text-xs text-slate-400 dark:text-slate-500">No saved portfolios yet. Build one below and save it.</p>
          ) : (
            <ul className="divide-y divide-slate-50 dark:divide-slate-800">
              {savedPortfolios.map((p) => (
                <li key={p.id} className={`flex items-center justify-between px-5 py-3 ${currentId === p.id ? 'bg-indigo-50/40 dark:bg-indigo-950/20' : ''}`}>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{p.name}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 truncate">
                      {p.holdings.map((h) => `${h.symbol} ${h.weight}%`).join(' · ')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 ml-3 shrink-0">
                    <button onClick={() => loadPortfolio(p)} disabled={currentId === p.id}
                      className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${
                        currentId === p.id
                          ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-300 cursor-default'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-indigo-50 dark:hover:bg-indigo-950 hover:text-indigo-600'
                      }`}>
                      {currentId === p.id ? 'Editing' : 'Load'}
                    </button>
                    <button onClick={() => deletePortfolio(p.id)} className="text-slate-300 dark:text-slate-600 hover:text-rose-500 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Preset pills */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Quick start:</span>
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            onClick={() => applyPreset(preset)}
            className="px-3 py-1.5 rounded-full text-xs font-medium bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-indigo-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Holdings panel */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Holdings</h2>
            <span className={`text-xs font-semibold tabular-nums ${ws.cls}`}>{ws.label}</span>
          </div>

          <div className="space-y-2">
            {holdings.map((h, i) => {
              const q = quotes[h.symbol];
              const pct = q?.changePct;
              return (
                <div key={`${h.symbol}-${i}`} className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{h.symbol}</span>
                      {q?.price != null && (
                        <span className="ml-2 text-xs text-slate-400 dark:text-slate-500 tabular-nums">
                          {q.currency === 'USD' ? '$' : ''}{q.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      )}
                      {pct != null && (
                        <span className={`ml-1.5 text-xs font-medium tabular-nums ${pct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                          {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
                        </span>
                      )}
                    </div>
                    <input
                      type="number" min={0} max={100} value={h.weight}
                      onChange={(e) => setWeight(i, Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))}
                      className="w-14 text-right text-sm font-medium bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-slate-800 dark:text-slate-200 outline-none focus:border-indigo-400 tabular-nums"
                    />
                    <span className="text-xs text-slate-400">%</span>
                    <button onClick={() => removeHolding(i)} className="text-slate-300 dark:text-slate-600 hover:text-rose-400 transition-colors">
                      <X size={13} />
                    </button>
                  </div>
                  <input
                    type="range" min={0} max={100} value={h.weight}
                    onChange={(e) => setWeight(i, parseInt(e.target.value))}
                    className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                    style={{ accentColor: COLORS[i % COLORS.length] }}
                  />
                </div>
              );
            })}
          </div>

          {holdings.length < 10 && <AssetSearch api={api} onSelect={addHolding} />}

          <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800">
            <button
              onClick={() => setHoldings([])}
              className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500 hover:text-rose-500 transition-colors"
            >
              <RotateCcw size={12} /> Reset
            </button>
          </div>

          {user && (
            <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <input
                value={portfolioName}
                onChange={(e) => setPortfolioName(e.target.value)}
                placeholder="Portfolio name (e.g. My Core Strategy)"
                className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
              <div className="flex items-center justify-between">
                <button onClick={newPortfolio}
                  className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                  <Plus size={12} /> New portfolio
                </button>
                <button onClick={savePortfolio} disabled={saving || !portfolioName.trim() || !holdings.length}
                  className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                    saved ? 'bg-emerald-600 text-white' : 'bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50'
                  }`}>
                  {saved ? 'Saved ✓' : saving ? 'Saving…' : currentId ? 'Update' : 'Save'}
                </button>
              </div>
              {saveError && (
                <p className="text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950 border border-rose-100 dark:border-rose-900 rounded-lg px-3 py-2">{saveError}</p>
              )}
            </div>
          )}
        </div>

        {/* Allocation donut */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none p-5 flex flex-col items-center justify-center">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 self-start mb-4">Allocation</h2>
          {donutData.length > 0 ? (
            <>
              <RechartsPie width={200} height={180}>
                <Pie data={donutData} cx={95} cy={85} innerRadius={55} outerRadius={80} paddingAngle={2} dataKey="value" strokeWidth={0}>
                  {donutData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 12 }} formatter={(v) => [`${v}%`]} />
              </RechartsPie>
              <div className="flex flex-wrap gap-x-3 gap-y-1.5 justify-center mt-2">
                {donutData.map((d) => (
                  <div key={d.name} className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                    <span className="text-xs text-slate-600 dark:text-slate-400 font-medium">{d.name}</span>
                    <span className="text-xs text-slate-400 dark:text-slate-500 tabular-nums">{d.value}%</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
              <div className="w-20 h-20 rounded-full border-4 border-dashed border-slate-200 dark:border-slate-700" />
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">Add assets to see allocation</p>
            </div>
          )}
        </div>

        {/* Metrics 2x2 */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none p-5">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">Metrics</h2>
          {metrics ? (
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Today', value: weightedDayChange == null ? '—' : `${weightedDayChange >= 0 ? '+' : ''}${weightedDayChange.toFixed(2)}%`, cls: weightedDayChange == null ? 'text-slate-400' : weightedDayChange >= 0 ? 'text-emerald-600' : 'text-rose-600' },
                { label: 'Total Return', value: `${metrics.totalReturn >= 0 ? '+' : ''}${metrics.totalReturn}%`, cls: metrics.totalReturn >= 0 ? 'text-emerald-600' : 'text-rose-600' },
                { label: 'CAGR', value: metrics.cagr == null ? '—' : `${metrics.cagr >= 0 ? '+' : ''}${metrics.cagr}%`, cls: metrics.cagr == null ? 'text-slate-400' : metrics.cagr >= 0 ? 'text-emerald-600' : 'text-rose-600' },
                { label: 'Volatility', value: `${metrics.vol}%`, cls: 'text-slate-800 dark:text-slate-200' },
                { label: 'Max Drawdown', value: `${metrics.maxDD}%`, cls: 'text-rose-600' },
              ].map(({ label, value, cls }) => (
                <div key={label} className="bg-slate-50 dark:bg-slate-950 rounded-lg p-3 border border-slate-100 dark:border-slate-800">
                  <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">{label}</p>
                  <p className={`text-xl font-bold tabular-nums ${cls}`}>{value}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-4 gap-2">
              <div className="space-y-2 w-full">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-14 bg-slate-50 dark:bg-slate-950 rounded-lg border border-slate-100 dark:border-slate-800 animate-pulse" />
                ))}
              </div>
              {!weightOk && holdings.length > 0 && (
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Set weights to 100% to see metrics</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Performance chart */}
      {weightOk && portfolioSeries.length > 1 && (
        <div className={`bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none p-5 transition-opacity duration-300 ${loading ? 'opacity-40' : 'opacity-100'}`}>
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Performance</h2>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Indexed to 100 at start of period</p>
            </div>
            {metrics && (
              <span className={`text-sm font-bold tabular-nums ${metrics.totalReturn >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {metrics.totalReturn >= 0 ? '+' : ''}{metrics.totalReturn}% total return
              </span>
            )}
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={portfolioSeries} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} width={45} domain={['auto', 'auto']} />
              <Tooltip
                contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, fontSize: 12 }}
                formatter={(v) => [typeof v === 'number' ? v.toFixed(2) : v, 'Portfolio']}
              />
              <Line type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2.5} dot={false} animationDuration={400} animationEasing="ease-out" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Holdings summary table */}
      {holdings.length > 0 && Object.keys(quotes).length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Holdings Summary</h2>
            {weightedDayChange != null && (
              <span className={`text-sm font-bold tabular-nums ${weightedDayChange >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                Portfolio today: {weightedDayChange >= 0 ? '+' : ''}{weightedDayChange.toFixed(2)}%
              </span>
            )}
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800">
                {['Asset', 'Price', 'Day Change', 'Weight', 'Contribution'].map((col) => (
                  <th key={col} className="px-5 py-2.5 text-left text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {holdings.map((h, i) => {
                const q = quotes[h.symbol];
                const contribution = q?.changePct != null ? (h.weight / 100) * q.changePct : null;
                return (
                  <tr key={h.symbol} className="border-b border-slate-50 dark:border-slate-800 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        <div>
                          <p className="font-semibold text-slate-900 dark:text-slate-100">{h.symbol}</p>
                          {q?.name && <p className="text-xs text-slate-400 dark:text-slate-500 truncate max-w-[160px]">{q.name}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 tabular-nums text-slate-800 dark:text-slate-200 font-medium">
                      {q?.price != null ? `$${q.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                    </td>
                    <td className="px-5 py-3 tabular-nums">
                      {q?.changePct != null ? (
                        <span className={`font-medium ${q.changePct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                          {q.changePct >= 0 ? '+' : ''}{q.changePct.toFixed(2)}%
                        </span>
                      ) : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-5 py-3 tabular-nums text-slate-600 dark:text-slate-400 font-medium">{h.weight}%</td>
                    <td className="px-5 py-3 tabular-nums">
                      {contribution != null ? (
                        <span className={`font-medium ${contribution >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                          {contribution >= 0 ? '+' : ''}{contribution.toFixed(3)}%
                        </span>
                      ) : <span className="text-slate-400">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {holdings.length === 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center py-20 text-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center">
            <Plus size={22} className="text-slate-300 dark:text-slate-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Build your portfolio above</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Add assets and set weights to 100% to simulate performance</p>
          </div>
        </div>
      )}
    </div>
  );
}
