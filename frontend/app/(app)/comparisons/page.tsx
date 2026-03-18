'use client';

import { useEffect, useState, useRef } from 'react';
import { useApp, DATE_PRESETS, DateRange } from '@/lib/context';
import { createClient } from '@/lib/supabase/browser';
import { Search, Plus, X, Bookmark, Check } from 'lucide-react';
import SmartInsights from '@/components/SmartInsights';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts';

// ── Types ─────────────────────────────────────────────────────────────────────
interface HistoryRow  { date: string; asset: string; value: number; }
interface HoldingItem { symbol: string; name: string; pct: number | null; }
interface HoldingsData {
  symbol: string; holdings: HoldingItem[];
  equityPct: number | null; bondPct: number | null; cashPct: number | null;
}
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
  error?: string;
}
interface CustomIndex {
  id: string;
  name: string;
  holdings: { symbol: string; weight: number }[];
}

// ── Constants ─────────────────────────────────────────────────────────────────
const COLORS  = ['#6366f1', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#f97316', '#84cc16'];

const DATA_PACKS = [
  { label: 'Global Indices', symbols: ['SPY', 'ACWI', 'EEM', 'DIA'] },
  { label: 'Tech Growth',    symbols: ['QQQ', 'NVDA', 'TSLA', 'MSFT'] },
  { label: 'Crypto Basket',  symbols: ['BTC-USD', 'ETH-USD', 'SOL-USD'] },
  { label: 'Macro',          symbols: ['GLD', 'TLT', 'DXY'] },
];
const POPULAR = ['SPY', 'QQQ', 'ACWI', 'EFA', 'EEM', 'IWM', 'BTC-USD', 'ETH-USD', 'GLD', 'TLT', 'NVDA'];

// ── Formatters ────────────────────────────────────────────────────────────────
function fmtPrice(v: number | null) {
  if (v == null) return '—';
  return v >= 1000 ? `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : `$${v.toFixed(2)}`;
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

// ── Quote stat groups ─────────────────────────────────────────────────────────
const STAT_GROUPS: { group: string; rows: { label: string; key: keyof QuoteData; fmt: (v: any) => string }[] }[] = [
  {
    group: 'Price',
    rows: [
      { label: 'Last Price',  key: 'price',     fmt: fmtPrice },
      { label: 'Day Change',  key: 'changePct', fmt: (v) => v != null ? `${v >= 0 ? '+' : ''}${v}%` : '—' },
      { label: 'Open',        key: 'open',      fmt: fmtPrice },
      { label: 'Day High',    key: 'dayHigh',   fmt: fmtPrice },
      { label: 'Day Low',     key: 'dayLow',    fmt: fmtPrice },
      { label: 'Prev Close',  key: 'prevClose', fmt: fmtPrice },
    ],
  },
  {
    group: '52-Week',
    rows: [
      { label: '52W High', key: 'week52High', fmt: fmtPrice },
      { label: '52W Low',  key: 'week52Low',  fmt: fmtPrice },
    ],
  },
  {
    group: 'Market',
    rows: [
      { label: 'Market Cap',    key: 'marketCap',    fmt: fmtLarge },
      { label: 'Volume',        key: 'volume',       fmt: fmtVol },
      { label: 'Avg Volume',    key: 'avgVolume',    fmt: fmtVol },
      { label: 'Expense Ratio', key: 'expenseRatio', fmt: (v) => v != null ? `${v}%` : '—' },
    ],
  },
];

// ── Performance stat rows ─────────────────────────────────────────────────────
const PERF_ROWS: { label: string; key: keyof AssetStats; fmt: (v: any) => string; hint: string;
  best: 'high' | 'low' | 'one' | 'lowneg' }[] = [
  { label: 'Ann. Return',  key: 'annualisedReturn',     fmt: fmtPct,   hint: 'Geometric annualised return',           best: 'high' },
  { label: 'Volatility',   key: 'annualisedVolatility', fmt: fmtPct,   hint: 'Annualised std dev of monthly returns', best: 'low'  },
  { label: 'Sharpe Ratio', key: 'sharpeRatio',          fmt: fmtRatio, hint: 'Excess return / vol (4.5% risk-free)',  best: 'high' },
  { label: 'Max Drawdown', key: 'maxDrawdown',          fmt: fmtPct,   hint: 'Peak-to-trough decline',                best: 'lowneg' },
  { label: 'Beta vs SPY',  key: 'beta',                 fmt: fmtRatio, hint: 'Sensitivity to S&P 500 moves',          best: 'one'  },
  { label: 'Calmar Ratio', key: 'calmarRatio',          fmt: fmtRatio, hint: 'Ann. return / |max drawdown|',          best: 'high' },
];

// ── Asset picker ───────────────────────────────────────────────────────────────
function AssetPicker({ value, color, onSelect, onRemove, api, canRemove, customIndexes = [] }: {
  value: string; color: string; onSelect: (s: string) => void;
  onRemove: () => void; api: string; canRemove: boolean;
  customIndexes?: CustomIndex[];
}) {
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

  const select = (s: string) => { onSelect(s); setOpen(false); setQuery(''); setResults([]); };

  const displayLabel = (val: string) => {
    if (val.startsWith('idx:')) {
      const id = val.slice(4);
      return customIndexes.find((i) => i.id === id)?.name ?? 'Custom Index';
    }
    return val;
  };

  return (
    <div ref={ref} className="relative">
      <div
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-indigo-300 cursor-pointer transition-colors min-w-[140px] group"
      >
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
        <span className={`flex-1 text-sm font-semibold truncate ${value ? 'text-slate-800 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500'}`}>
          {value ? displayLabel(value) : 'Pick asset'}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          <Search size={11} className="text-slate-300 dark:text-slate-600 group-hover:text-indigo-400 transition-colors" />
          {canRemove && (
            <button onClick={(e) => { e.stopPropagation(); onRemove(); }}
              className="text-slate-300 dark:text-slate-600 hover:text-rose-400 transition-colors">
              <X size={11} />
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="absolute top-12 left-0 z-50 w-72 bg-white dark:bg-slate-900 rounded-xl shadow-xl dark:shadow-none border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="p-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-50 dark:focus-within:ring-indigo-950 transition-all">
              <Search size={13} className="text-slate-400 dark:text-slate-500 shrink-0" />
              <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="Search ticker or company…"
                className="flex-1 text-sm outline-none bg-transparent text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-600" />
            </div>
          </div>
          {results.length > 0 ? (
            <ul className="max-h-56 overflow-y-auto">
              {results.slice(0, 8).map((r, i) => (
                <li key={`${r.symbol}-${i}`}>
                  <button onClick={() => select(r.symbol)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 text-left transition-colors">
                    <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 w-16 shrink-0">{r.symbol}</span>
                    <span className="text-xs text-slate-400 dark:text-slate-500 truncate">{r.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : query ? (
            <p className="text-xs text-slate-400 dark:text-slate-500 px-3 py-4 text-center">No results for "{query}"</p>
          ) : (
            <div className="max-h-72 overflow-y-auto">
              {/* Your Indexes section */}
              {customIndexes.length > 0 && (
                <div className="px-3 pt-3 pb-1 border-b border-slate-100 dark:border-slate-800">
                  <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-2">Your Indexes</p>
                  <div className="space-y-1">
                    {customIndexes.map((idx) => (
                      <button key={idx.id} onClick={() => select(`idx:${idx.id}`)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-950 text-left transition-colors group">
                        <span className="w-2 h-2 rounded-full bg-indigo-400 shrink-0" />
                        <span className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{idx.name}</span>
                        <span className="text-xs text-slate-400 dark:text-slate-500 ml-auto shrink-0">{idx.holdings.length} assets</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {/* Popular tickers */}
              <div className="px-3 py-3">
                <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-2">Popular</p>
                <div className="flex flex-wrap gap-1.5">
                  {POPULAR.map((s) => (
                    <button key={s} onClick={() => select(s)}
                      className="text-xs px-2.5 py-1 rounded-md font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ComparisonsPage() {
  const { api, user } = useApp();
  const supabase = createClient();

  const [dateRange, setDateRange]     = useState<DateRange>(DATE_PRESETS[3]);
  const [mode, setMode]               = useState<'price' | 'pct'>('pct');
  const [slots, setSlots]             = useState<string[]>(['', '']);
  const [hiddenStats, setHiddenStats] = useState<Set<string>>(new Set());
  const [statsWindow, setStatsWindow] = useState<'1Y' | '3Y' | '5Y'>('3Y');

  // Save View modal
  const [saveOpen, setSaveOpen]           = useState(false);
  const [saveWorkspaces, setSaveWorkspaces] = useState<{ id: string; name: string }[]>([]);
  const [saveWsId, setSaveWsId]           = useState('');
  const [saveViewName, setSaveViewName]   = useState('');
  const [saveDone, setSaveDone]           = useState(false);
  const [saving, setSaving]               = useState(false);

  // Custom indexes
  const [customIndexes, setCustomIndexes] = useState<CustomIndex[]>([]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('custom_indexes')
      .select('id, name, index_holdings(asset_symbol, weight)')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .then(({ data }) => {
        if (data) {
          setCustomIndexes(data.map((idx: any) => ({
            id: idx.id,
            name: idx.name,
            holdings: (idx.index_holdings as any[]).map((h: any) => ({ symbol: h.asset_symbol, weight: h.weight })),
          })));
        }
      });
  }, [user]); // eslint-disable-line

  const setSlot    = (i: number, s: string) => setSlots((p) => p.map((v, idx) => idx === i ? s : v));
  const removeSlot = (i: number) => setSlots((p) => p.length > 1 ? p.filter((_, idx) => idx !== i) : p);
  const addSlot    = () => setSlots((p) => [...p, '']);

  const activeSymbols = slots.filter(Boolean);

  // Helper: display key for a slot (index name or ticker)
  const slotDisplayKey = (slot: string): string => {
    if (slot.startsWith('idx:')) {
      const id = slot.slice(4);
      return customIndexes.find((i) => i.id === id)?.name ?? 'Custom Index';
    }
    return slot;
  };

  // Compute all symbols needed (regular + component symbols from index slots)
  const regularSymbols = activeSymbols.filter((s) => !s.startsWith('idx:'));
  const indexComponentSymbols = activeSymbols
    .filter((s) => s.startsWith('idx:'))
    .flatMap((s) => {
      const id = s.slice(4);
      return customIndexes.find((i) => i.id === id)?.holdings.map((h) => h.symbol) ?? [];
    });
  const allNeededSymbols = [...new Set([...regularSymbols, ...indexComponentSymbols])];
  const symKey = allNeededSymbols.sort().join(',');

  const [allData,      setAllData]      = useState<HistoryRow[]>([]);
  const [quotes,       setQuotes]       = useState<Record<string, QuoteData>>({});
  const [holdings,     setHoldings]     = useState<Record<string, HoldingsData>>({});
  const [stats,        setStats]        = useState<Record<string, AssetStats>>({});
  const [statsLoading, setStatsLoading] = useState(false);
  const [chartLoading, setChartLoading] = useState(false);

  useEffect(() => {
    if (!activeSymbols.length) return;
    if (!allNeededSymbols.length) return;
    setChartLoading(true);
    fetch(`${api}/market-data/history?symbols=${allNeededSymbols.join(',')}&period=${dateRange.period}&interval=${dateRange.interval}`)
      .then((r) => r.json())
      .then((d) => { setAllData(Array.isArray(d) ? d : []); setChartLoading(false); })
      .catch(() => setChartLoading(false));
  }, [symKey, dateRange, api]); // eslint-disable-line

  // Fetch quotes only for regular (non-index) slots
  useEffect(() => {
    const missing = regularSymbols.filter((s) => !quotes[s]);
    if (!missing.length) return;
    fetch(`${api}/market-data/quotes?symbols=${missing.join(',')}`)
      .then((r) => r.json())
      .then((data: QuoteData[]) => setQuotes((p) => { const n = { ...p }; data.forEach((q) => { n[q.symbol] = q; }); return n; }))
      .catch(() => {});
  }, [symKey, api]); // eslint-disable-line

  // Fetch holdings only for regular (non-index) slots
  useEffect(() => {
    regularSymbols.filter((s) => !holdings[s]).forEach((sym) => {
      fetch(`${api}/market-data/holdings?symbol=${sym}`)
        .then((r) => r.json())
        .then((d: HoldingsData) => setHoldings((p) => ({ ...p, [sym]: d })))
        .catch(() => {});
    });
  }, [symKey, api]); // eslint-disable-line

  // Fetch stats only for regular (non-index) slots
  useEffect(() => {
    const missing = regularSymbols.filter((s) => !stats[s]);
    if (!missing.length) return;
    setStatsLoading(true);
    fetch(`${api}/market-data/stats?symbols=${missing.join(',')}`)
      .then((r) => r.json())
      .then((data: AssetStats[]) => setStats((p) => { const n = { ...p }; data.forEach((d) => { n[d.symbol] = d; }); return n; }))
      .catch(() => {})
      .finally(() => setStatsLoading(false));
  }, [symKey, api]); // eslint-disable-line

  // Build a history map for all fetched data (needed for custom index computation)
  const allNeededHistoryMap = (() => {
    const map: Record<string, { date: string; value: number }[]> = {};
    for (const r of (Array.isArray(allData) ? allData : [])) {
      if (!map[r.asset]) map[r.asset] = [];
      map[r.asset].push({ date: r.date, value: r.value });
    }
    return map;
  })();

  // Chart data
  const chartData = (() => {
    const sorted = [...allData]
      .filter((r) => regularSymbols.includes(r.asset))
      .sort((a, b) => a.date.localeCompare(b.date));

    if (mode === 'price') {
      const m = new Map<string, Record<string, number>>();
      for (const r of sorted) {
        if (!m.has(r.date)) m.set(r.date, { date: r.date } as unknown as Record<string, number>);
        m.get(r.date)![r.asset] = r.value;
      }
      // No index series in price mode (no common unit)
      return [...m.values()];
    }

    // pct / normalized mode
    const base: Record<string, number> = {};
    const m = new Map<string, Record<string, number>>();
    for (const r of sorted) {
      if (!base[r.asset]) base[r.asset] = r.value;
      if (!m.has(r.date)) m.set(r.date, { date: r.date } as unknown as Record<string, number>);
      m.get(r.date)![r.asset] = parseFloat(((r.value / base[r.asset]) * 100).toFixed(2));
    }

    // Add custom index series
    const byDate = m;
    for (const slot of activeSymbols.filter((s) => s.startsWith('idx:'))) {
      const id = slot.slice(4);
      const idx = customIndexes.find((i) => i.id === id);
      if (!idx) continue;
      const label = idx.name;
      const filled = idx.holdings.filter((h) => allNeededHistoryMap[h.symbol]?.length > 0);
      if (!filled.length) continue;

      const dateSets = filled.map((h) => new Set(allNeededHistoryMap[h.symbol].map((p) => p.date)));
      const commonDates = [...dateSets[0]].filter((d) => dateSets.every((s) => s.has(d))).sort();
      const totalW = filled.reduce((s, h) => s + h.weight, 0);
      if (!totalW || !commonDates.length) continue;

      const bases: Record<string, number> = {};
      for (const h of filled) {
        bases[h.symbol] = allNeededHistoryMap[h.symbol].find((p) => p.date === commonDates[0])?.value ?? 1;
      }

      for (const date of commonDates) {
        if (!byDate.has(date)) byDate.set(date, { date } as unknown as Record<string, number>);
        const val = filled.reduce((sum, h) => {
          const pt = allNeededHistoryMap[h.symbol].find((p) => p.date === date);
          return sum + (h.weight / totalW) * ((pt?.value ?? bases[h.symbol]) / bases[h.symbol]) * 100;
        }, 0);
        byDate.get(date)![label] = parseFloat(val.toFixed(2));
      }
    }

    return [...m.values()];
  })();

  const returns: Record<string, number | null> = {};
  if (mode === 'pct' && chartData.length > 1) {
    for (const slot of activeSymbols) {
      const key = slotDisplayKey(slot);
      const last = [...chartData].reverse().find((d) => d[key] != null)?.[key] as number | undefined;
      returns[slot] = last != null ? parseFloat((last - 100).toFixed(1)) : null;
    }
  }

  // Holdings — only regular ETF slots
  const etfsWithHoldings = regularSymbols.filter((s) => holdings[s]?.holdings.length);
  const stockMap = new Map<string, { name: string; weights: Record<string, number> }>();
  for (const etf of etfsWithHoldings) {
    for (const h of holdings[etf].holdings) {
      if (!stockMap.has(h.symbol)) stockMap.set(h.symbol, { name: h.name ?? h.symbol, weights: {} });
      stockMap.get(h.symbol)!.weights[etf] = h.pct ?? 0;
    }
  }
  const holdingRows = [...stockMap.entries()]
    .map(([sym, { name, weights }]) => ({ sym, name, weights, total: Object.values(weights).reduce((a, b) => a + b, 0), inCount: Object.keys(weights).length }))
    .sort((a, b) => b.total - a.total);

  // Compute performance metrics for custom index slots from raw history (mode-independent)
  const indexMetrics = (() => {
    const result: Record<string, { annualisedReturn: number | null; annualisedVolatility: number | null; sharpeRatio: number | null; maxDrawdown: number | null }> = {};
    for (const slot of activeSymbols.filter((s) => s.startsWith('idx:'))) {
      const idx = customIndexes.find((ci) => ci.id === slot.slice(4));
      if (!idx) continue;
      const filled = idx.holdings.filter((h) => allNeededHistoryMap[h.symbol]?.length > 0);
      if (!filled.length) continue;
      const dateSets = filled.map((h) => new Set(allNeededHistoryMap[h.symbol].map((p) => p.date)));
      const commonDates = [...dateSets[0]].filter((d) => dateSets.every((s) => s.has(d))).sort();
      const totalW = filled.reduce((s, h) => s + h.weight, 0);
      if (!totalW || commonDates.length < 6) continue;
      const bases: Record<string, number> = {};
      for (const h of filled) bases[h.symbol] = allNeededHistoryMap[h.symbol].find((p) => p.date === commonDates[0])?.value ?? 1;
      const series = commonDates.map((date) => ({
        date,
        value: filled.reduce((sum, h) => {
          const pt = allNeededHistoryMap[h.symbol].find((p) => p.date === date);
          return sum + (h.weight / totalW) * ((pt?.value ?? bases[h.symbol]) / bases[h.symbol]) * 100;
        }, 0),
      }));
      if (series.length < 6) continue;
      const first = series[0].value, last = series[series.length - 1].value;
      const days = (new Date(series[series.length - 1].date).getTime() - new Date(series[0].date).getTime()) / 86400000;
      const years = Math.max(days / 365.25, 0.1);
      const annRet = Math.pow(last / first, 1 / years) - 1;
      const rets = series.slice(1).map((p, i) => (p.value - series[i].value) / series[i].value);
      const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
      const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1);
      const annVol = Math.sqrt(variance) * Math.sqrt(rets.length / years);
      const rfPeriod = Math.pow(1.045, years / rets.length) - 1;
      const excess = rets.map((r) => r - rfPeriod);
      const exMean = excess.reduce((a, b) => a + b, 0) / excess.length;
      const exVar = excess.reduce((a, b) => a + (b - exMean) ** 2, 0) / (excess.length - 1);
      const sharpe = annVol > 0 ? (exMean / Math.sqrt(exVar)) * Math.sqrt(rets.length / years) : null;
      let peak = first, maxDD = 0;
      for (const p of series) { if (p.value > peak) peak = p.value; const dd = (p.value - peak) / peak; if (dd < maxDD) maxDD = dd; }
      result[slot] = { annualisedReturn: annRet, annualisedVolatility: annVol, sharpeRatio: sharpe, maxDrawdown: maxDD };
    }
    return result;
  })();

  // Best-value highlighting for perf stats (only for regular symbols)
  const bestFor = (rowKey: keyof AssetStats, best: string) => {
    const vals = regularSymbols.map((s) => {
      const v = stats[s]?.[rowKey] as Record<string, number | null> | undefined;
      return v ? (v[statsWindow] ?? null) : null;
    }).filter((v) => v != null) as number[];
    if (vals.length < 2) return null;
    if (best === 'high')   return Math.max(...vals);
    if (best === 'low')    return Math.min(...vals);
    if (best === 'lowneg') return Math.max(...vals);
    if (best === 'one')    return vals.reduce((a, b) => Math.abs(b - 1) < Math.abs(a - 1) ? b : a);
    return null;
  };

  const sharpeColor = (v: number | null) => {
    if (v == null) return 'text-slate-800 dark:text-slate-200';
    if (v >= 1)    return 'text-emerald-600 font-semibold';
    if (v >= 0.5)  return 'text-amber-600';
    return 'text-rose-600';
  };

  const hasData = activeSymbols.length > 0;

  async function openSaveModal() {
    if (!user) return;
    const { data } = await supabase
      .from('workspaces')
      .select('id, name')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });
    setSaveWorkspaces(data ?? []);
    setSaveWsId(data?.[0]?.id ?? '');
    setSaveViewName('');
    setSaveDone(false);
    setSaveOpen(true);
  }

  async function saveView() {
    if (!saveWsId || !saveViewName.trim()) return;
    setSaving(true);
    await supabase.from('workspace_views').insert({
      workspace_id: saveWsId,
      name: saveViewName.trim(),
      config: { symbols: slots.filter(Boolean), period: dateRange.period, interval: dateRange.interval, mode },
    });
    await supabase
      .from('workspaces')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', saveWsId);
    setSaving(false);
    setSaveDone(true);
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Comparisons</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Compare any assets — performance, risk, and holdings</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-1">
            {DATE_PRESETS.map((p) => (
              <button key={p.label} onClick={() => setDateRange(p)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${dateRange.label === p.label ? 'bg-indigo-600 text-white shadow-sm dark:shadow-none' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden text-xs font-medium">
            <button onClick={() => setMode('pct')}   className={`px-3 py-1.5 transition-colors ${mode === 'pct'   ? 'bg-indigo-600 text-white' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>% Return</button>
            <button onClick={() => setMode('price')} className={`px-3 py-1.5 transition-colors ${mode === 'price' ? 'bg-indigo-600 text-white' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>Price</button>
          </div>
          {hasData && (
            <button
              onClick={openSaveModal}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:border-indigo-300 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg transition-colors"
            >
              <Bookmark size={13} />
              Save View
            </button>
          )}
        </div>
      </div>

      {/* Data pack presets */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider shrink-0">Load pack:</span>
        {DATA_PACKS.map((pack) => {
          const active = slots.length === pack.symbols.length && pack.symbols.every((s, i) => slots[i] === s);
          return (
            <button key={pack.label} onClick={() => setSlots(pack.symbols)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                active
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-indigo-300 hover:text-indigo-600 dark:hover:text-indigo-400'
              }`}>
              {pack.label}
            </button>
          );
        })}
      </div>

      {/* Asset pickers */}
      <div className="flex items-center gap-2 flex-wrap">
        {slots.map((sym, i) => (
          <AssetPicker key={i} value={sym} color={COLORS[i % COLORS.length]}
            onSelect={(s) => setSlot(i, s)} onRemove={() => removeSlot(i)}
            api={api} canRemove={slots.length > 1} customIndexes={customIndexes} />
        ))}
        <button onClick={addSlot}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-slate-300 dark:border-slate-600 text-xs font-medium text-slate-400 dark:text-slate-500 hover:border-indigo-300 hover:text-indigo-500 transition-colors">
          <Plus size={12} /> Add
        </button>
      </div>

      {/* Empty state */}
      {!hasData && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center py-20 text-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center">
            <Plus size={22} className="text-slate-300 dark:text-slate-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Pick assets above to start comparing</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Select two or more to see performance, risk metrics, and holdings</p>
          </div>
        </div>
      )}

      {/* Smart insights */}
      {regularSymbols.length >= 2 && (
        <SmartInsights symbols={regularSymbols} api={api} period="1Y" />
      )}

      {/* Chart */}
      {hasData && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none p-5">
          <div className={`transition-opacity duration-300 ${chartLoading ? 'opacity-40' : 'opacity-100'}`}>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false}
                width={mode === 'price' ? 60 : 40}
                tickFormatter={mode === 'price' ? (v) => `$${Number(v).toLocaleString()}` : (v) => `${v}`} />
              <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, fontSize: 12 }}
                formatter={(v, name) => mode === 'price'
                  ? [`$${Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}`, name]
                  : [`${v}`, name]} />
              <Legend formatter={(v) => <span className="text-xs text-slate-600 dark:text-slate-400">{v}</span>} iconType="circle" iconSize={8} />
              {activeSymbols.map((slot) => (
                <Line key={slot} type="monotone" dataKey={slotDisplayKey(slot)}
                  stroke={COLORS[slots.indexOf(slot) % COLORS.length]} strokeWidth={2} dot={false} connectNulls
                  animationDuration={400} animationEasing="ease-out" />
              ))}
            </LineChart>
          </ResponsiveContainer>
          {mode === 'pct' && Object.keys(returns).length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              {activeSymbols.map((slot) => {
                const ret = returns[slot]; if (ret == null) return null;
                const pos = ret >= 0;
                const label = slotDisplayKey(slot);
                return (
                  <span key={slot} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${pos ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700' : 'bg-rose-50 dark:bg-rose-950 text-rose-700'}`}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: COLORS[slots.indexOf(slot) % COLORS.length] }} />
                    {label} {pos ? '+' : ''}{ret}%
                  </span>
                );
              })}
            </div>
          )}
          </div>
        </div>
      )}

      {/* Comparison table — performance + quote stats */}
      {hasData && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none overflow-hidden">
          {hiddenStats.size > 0 && (
            <div className="px-5 pt-3 flex justify-end">
              <button onClick={() => setHiddenStats(new Set())}
                className="text-xs text-indigo-500 hover:text-indigo-700 dark:hover:text-indigo-300">
                Restore {hiddenStats.size} hidden row{hiddenStats.size > 1 ? 's' : ''}
              </button>
            </div>
          )}
          <table className="w-full table-fixed">
            <thead>
              <tr>
                <th className="px-5 py-4 text-left w-40 border-b border-slate-100 dark:border-slate-800" />
                {slots.map((slot, i) => {
                  const isIdx = slot.startsWith('idx:');
                  const label = slot ? slotDisplayKey(slot) : '—';
                  const q = !isIdx && slot ? quotes[slot] : null;
                  const idx = isIdx && slot ? customIndexes.find((ci) => ci.id === slot.slice(4)) : null;
                  return (
                    <th key={i} className="px-0 py-0 text-left border-b border-slate-100 dark:border-slate-800 border-l border-l-slate-100 dark:border-l-slate-800">
                      <div className="h-1 w-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <div className="px-5 py-3 space-y-0.5 min-w-0">
                        <p className={`text-sm font-bold truncate ${slot ? 'text-slate-900 dark:text-slate-100' : 'text-slate-300 dark:text-slate-600'}`}>{label}</p>
                        {idx && (
                          <p className="text-xs text-indigo-500 dark:text-indigo-400 leading-tight truncate">
                            {idx.holdings.length}-asset custom index
                          </p>
                        )}
                        {q && (
                          <>
                            <p className="text-xs text-slate-400 dark:text-slate-500 truncate leading-tight">{q.name}</p>
                            <p className={`text-xs font-semibold ${(q.changePct ?? 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {q.changePct != null ? `${(q.changePct ?? 0) >= 0 ? '+' : ''}${q.changePct}% today` : ''}
                            </p>
                          </>
                        )}
                      </div>
                    </th>
                  );
                })}
                <th className="w-10 border-b border-slate-100 dark:border-slate-800 border-l border-l-slate-100 dark:border-l-slate-800">
                  <button onClick={addSlot} className="w-full flex items-center justify-center p-4 text-slate-300 dark:text-slate-600 hover:text-indigo-400 transition-colors">
                    <Plus size={14} />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {/* ── Performance section ── */}
              <tr>
                <td colSpan={slots.length + 2} className="px-5 pt-5 pb-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Performance</span>
                    <div className="flex gap-1">
                      {(['1Y', '3Y', '5Y'] as const).map((w) => (
                        <button key={w} onClick={() => setStatsWindow(w)}
                          className={`text-[10px] px-2 py-0.5 rounded font-semibold transition-colors ${statsWindow === w ? 'bg-indigo-600 text-white' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'}`}>
                          {w}
                        </button>
                      ))}
                    </div>
                  </div>
                </td>
              </tr>
              {PERF_ROWS.filter(({ key }) => !hiddenStats.has(key as string)).map(({ label, key, fmt, hint, best }) => {
                const bestVal = bestFor(key, best);
                return (
                  <tr key={key as string} className="group/row hover:bg-slate-50/60 dark:hover:bg-slate-800/60 transition-colors">
                    <td className="px-5 py-2.5 text-xs text-slate-500 dark:text-slate-400">
                      <div className="flex items-center gap-2">
                        <span title={hint} className="cursor-help">{label}</span>
                        <button onClick={() => setHiddenStats((p) => new Set([...p, key as string]))}
                          className="opacity-0 group-hover/row:opacity-100 text-slate-300 dark:text-slate-600 hover:text-rose-400 transition-all">
                          <X size={10} />
                        </button>
                      </div>
                    </td>
                    {slots.map((slot, i) => {
                      const isIdx = slot.startsWith('idx:');
                      const isDD     = key === 'maxDrawdown';
                      const isSharpe = key === 'sharpeRatio';

                      if (isIdx) {
                        const im = indexMetrics[slot];
                        // Keys that map from indexMetrics to PERF_ROWS key
                        const idxKeyMap: Record<string, keyof typeof im> = {
                          annualisedReturn: 'annualisedReturn',
                          annualisedVolatility: 'annualisedVolatility',
                          sharpeRatio: 'sharpeRatio',
                          maxDrawdown: 'maxDrawdown',
                        };
                        const imKey = idxKeyMap[key as string];
                        const raw = im && imKey ? im[imKey] : null;
                        return (
                          <td key={i} className="px-5 py-2.5 border-l border-slate-50 dark:border-slate-800 tabular-nums text-sm">
                            {raw == null ? (
                              <span className="text-slate-300 dark:text-slate-600 text-xs">—</span>
                            ) : (
                              <span className={`px-1.5 py-0.5 rounded ${
                                isSharpe ? sharpeColor(raw) :
                                isDD ? 'text-rose-600 font-medium' :
                                key === 'annualisedReturn' ? (raw >= 0 ? 'text-emerald-600 font-semibold' : 'text-rose-600 font-semibold') :
                                'text-slate-800 dark:text-slate-200 font-medium'
                              }`}>
                                {fmt(raw)}
                              </span>
                            )}
                          </td>
                        );
                      }

                      const s = slot ? stats[slot] : null;
                      const avail = s?.periodsCovered?.includes(statsWindow);
                      const raw   = avail ? (s![key] as Record<string, number | null>)[statsWindow] : null;
                      const isBest = bestVal != null && raw === bestVal;
                      return (
                        <td key={i} className="px-5 py-2.5 border-l border-slate-50 dark:border-slate-800 tabular-nums text-sm">
                          {statsLoading && !s ? (
                            <span className="inline-block w-12 h-3 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
                          ) : !slot ? (
                            <span className="text-slate-200 dark:text-slate-700">—</span>
                          ) : !avail ? (
                            <span className="text-slate-300 dark:text-slate-600 text-xs">N/A</span>
                          ) : (
                            <span className={`px-1.5 py-0.5 rounded ${isBest ? 'bg-emerald-50 dark:bg-emerald-950' : ''} ${
                              isSharpe ? sharpeColor(raw) :
                              isDD ? 'text-rose-600 font-medium' :
                              key === 'annualisedReturn' && raw != null ? (raw >= 0 ? 'text-emerald-600 font-semibold' : 'text-rose-600 font-semibold') :
                              'text-slate-800 dark:text-slate-200 font-medium'
                            }`}>
                              {fmt(raw)}
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td className="border-l border-slate-50 dark:border-slate-800" />
                  </tr>
                );
              })}

              {/* ── Quote stat groups ── */}
              {STAT_GROUPS.map(({ group, rows }) => {
                const visible = rows.filter(({ key }) =>
                  !hiddenStats.has(key) &&
                  regularSymbols.some((sym) => quotes[sym] != null && quotes[sym][key] != null)
                );
                if (!visible.length) return null;
                return [
                  <tr key={`g-${group}`}>
                    <td colSpan={slots.length + 2} className="px-5 pt-5 pb-1">
                      <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{group}</span>
                    </td>
                  </tr>,
                  ...visible.map(({ label, key, fmt }) => (
                    <tr key={key as string} className="group/row hover:bg-slate-50/60 dark:hover:bg-slate-800/60 transition-colors">
                      <td className="px-5 py-2.5 text-xs text-slate-500 dark:text-slate-400">
                        <div className="flex items-center gap-2">
                          {label}
                          <button onClick={() => setHiddenStats((p) => new Set([...p, key as string]))}
                            className="opacity-0 group-hover/row:opacity-100 text-slate-300 dark:text-slate-600 hover:text-rose-400 transition-all">
                            <X size={10} />
                          </button>
                        </div>
                      </td>
                      {slots.map((slot, i) => {
                        const isIdx = slot.startsWith('idx:');
                        // Custom indexes don't have quote data
                        if (isIdx) {
                          return (
                            <td key={i} className="px-5 py-2.5 border-l border-slate-50 dark:border-slate-800 tabular-nums text-sm font-medium">
                              <span className="text-slate-200 dark:text-slate-700 font-normal">—</span>
                            </td>
                          );
                        }
                        const q = slot ? quotes[slot] : null;
                        const val = q ? q[key] : null;
                        const isChange = key === 'changePct';
                        const num = typeof val === 'number' ? val : null;
                        return (
                          <td key={i} className={`px-5 py-2.5 border-l border-slate-50 dark:border-slate-800 tabular-nums text-sm font-medium ${
                            isChange && num != null ? (num >= 0 ? 'text-emerald-600' : 'text-rose-600') : 'text-slate-800 dark:text-slate-200'
                          }`}>
                            {q ? fmt(val) : <span className="text-slate-200 dark:text-slate-700 font-normal">—</span>}
                          </td>
                        );
                      })}
                      <td className="border-l border-slate-50 dark:border-slate-800" />
                    </tr>
                  )),
                ];
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Holdings comparison */}
      {etfsWithHoldings.length > 0 && holdingRows.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none overflow-hidden">
          <div className="px-5 pt-5 pb-3 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Top Holdings</h2>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                {holdingRows.length} holdings · {etfsWithHoldings.length} fund{etfsWithHoldings.length > 1 ? 's' : ''}
                {etfsWithHoldings.length > 1 && (
                  <span className="ml-2 text-indigo-500 font-medium">· {holdingRows.filter((r) => r.inCount > 1).length} in common</span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {etfsWithHoldings.map((etf) => (
                <div key={etf} className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[slots.indexOf(etf) % COLORS.length] }} />
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">{etf}</span>
                </div>
              ))}
            </div>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-y border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60">
                <th className="px-5 py-2.5 text-left text-xs font-medium text-slate-400 dark:text-slate-500 w-20">Ticker</th>
                <th className="px-5 py-2.5 text-left text-xs font-medium text-slate-400 dark:text-slate-500">Company</th>
                {etfsWithHoldings.map((etf) => (
                  <th key={etf} className="px-5 py-2.5 text-right text-xs font-bold" style={{ color: COLORS[slots.indexOf(etf) % COLORS.length] }}>
                    {etf}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {holdingRows.map((row) => {
                const overlap = row.inCount > 1 && etfsWithHoldings.length > 1;
                return (
                  <tr key={row.sym} className={`border-b border-slate-50 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors ${overlap ? 'bg-indigo-50/20 dark:bg-indigo-950/20' : ''}`}>
                    <td className="px-5 py-2.5">
                      <div className="flex items-center gap-1.5">
                        {overlap && <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />}
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100">{row.sym}</span>
                      </div>
                    </td>
                    <td className="px-5 py-2.5 text-xs text-slate-500 dark:text-slate-400 max-w-[200px] truncate">{row.name}</td>
                    {etfsWithHoldings.map((etf) => {
                      const pct = row.weights[etf];
                      const maxPct = Math.max(...holdingRows.map((r) => r.weights[etf] ?? 0));
                      return (
                        <td key={etf} className="px-5 py-2.5 text-right">
                          {pct != null ? (
                            <div className="flex flex-col items-end gap-1">
                              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 tabular-nums">{pct.toFixed(2)}%</span>
                              <div className="w-24 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                <div className="h-full rounded-full"
                                  style={{ width: `${Math.round((pct / maxPct) * 100)}%`, backgroundColor: COLORS[slots.indexOf(etf) % COLORS.length], opacity: 0.6 }} />
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-200 dark:text-slate-700">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Save View Modal */}
      {saveOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-md p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Save View to Workspace</h2>
              <button onClick={() => setSaveOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <X size={16} />
              </button>
            </div>

            {saveDone ? (
              <div className="text-center py-6 space-y-3">
                <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center mx-auto">
                  <Check size={20} className="text-emerald-600 dark:text-emerald-400" />
                </div>
                <p className="text-sm font-medium text-slate-800 dark:text-slate-100">View saved!</p>
                <button
                  onClick={() => setSaveOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
                >
                  Close
                </button>
              </div>
            ) : (
              <>
                {/* Config summary */}
                <div className="bg-slate-50 dark:bg-slate-800 rounded-xl px-4 py-3 space-y-2">
                  <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">Config to save</p>
                  <div className="flex flex-wrap gap-1.5">
                    {slots.filter(Boolean).map((s) => (
                      <span key={s} className="px-2 py-0.5 bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-xs font-medium rounded-md">
                        {s.startsWith('idx:') ? (customIndexes.find((i) => i.id === s.slice(4))?.name ?? 'Custom Index') : s}
                      </span>
                    ))}
                    <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 text-xs rounded-md">
                      {dateRange.label}
                    </span>
                    <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 text-xs rounded-md capitalize">
                      {mode === 'pct' ? '% Return' : 'Price'}
                    </span>
                  </div>
                </div>

                {/* View name */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-400">View name</label>
                  <input
                    autoFocus
                    type="text"
                    placeholder="e.g. Tech vs Macro – 1Y"
                    value={saveViewName}
                    onChange={(e) => setSaveViewName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveView(); }}
                    className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-transparent text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {/* Workspace picker */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Workspace</label>
                  {saveWorkspaces.length === 0 ? (
                    <p className="text-sm text-slate-400 dark:text-slate-500">No workspaces found. Create one first.</p>
                  ) : (
                    <select
                      value={saveWsId}
                      onChange={(e) => setSaveWsId(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      {saveWorkspaces.map((w) => (
                        <option key={w.id} value={w.id}>{w.name}</option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={saveView}
                    disabled={!saveViewName.trim() || !saveWsId || saving}
                    className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    {saving ? 'Saving…' : 'Save View'}
                  </button>
                  <button
                    onClick={() => setSaveOpen(false)}
                    className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                  >
                    Cancel
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
