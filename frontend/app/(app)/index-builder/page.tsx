'use client';

import { useEffect, useState, useRef } from 'react';
import { useApp, DATE_PRESETS, DateRange } from '@/lib/context';
import { createClient } from '@/lib/supabase/browser';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, PieChart as RechartsPie, Pie, Cell,
} from 'recharts';
import { Plus, X, Search, RotateCcw, ChevronDown, Trash2 } from 'lucide-react';

// ── Constants ──────────────────────────────────────────────────────────────────
const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#f97316', '#84cc16'];
const BENCHMARKS = ['SPY', 'QQQ', 'ACWI', 'TLT', 'GLD', 'IWM', 'DIA'];
const PRESETS = [
  { label: 'Tech Growth',   holdings: [{ symbol: 'QQQ', weight: 40 }, { symbol: 'NVDA', weight: 35 }, { symbol: 'AAPL', weight: 25 }] },
  { label: 'Global Market', holdings: [{ symbol: 'SPY', weight: 50 }, { symbol: 'ACWI', weight: 30 }, { symbol: 'EEM', weight: 20 }] },
  { label: 'Crypto Mix',    holdings: [{ symbol: 'BTC-USD', weight: 60 }, { symbol: 'ETH-USD', weight: 40 }] },
];

// ── Types ──────────────────────────────────────────────────────────────────────
interface Holding { symbol: string; weight: number; }
interface HistoryPoint { date: string; value: number; }
interface SavedIndex { id: string; name: string; holdings: Holding[]; updatedAt: string; }

// ── Computation helpers ────────────────────────────────────────────────────────
function buildIndexSeries(holdings: Holding[], historyMap: Record<string, HistoryPoint[]>): HistoryPoint[] {
  const filled = holdings.filter((h) => historyMap[h.symbol]?.length > 0);
  if (!filled.length) return [];
  const dateSets = filled.map((h) => new Set(historyMap[h.symbol].map((p) => p.date)));
  const commonDates = [...dateSets[0]].filter((d) => dateSets.every((s) => s.has(d))).sort();
  if (commonDates.length < 2) return [];
  const totalW = filled.reduce((s, h) => s + h.weight, 0);
  if (!totalW) return [];
  const bases: Record<string, number> = {};
  for (const h of filled) bases[h.symbol] = historyMap[h.symbol].find((p) => p.date === commonDates[0])!.value;
  return commonDates.map((date) => ({
    date,
    value: parseFloat(filled.reduce((sum, h) => {
      const pt = historyMap[h.symbol].find((p) => p.date === date);
      return sum + (h.weight / totalW) * ((pt?.value ?? bases[h.symbol]) / bases[h.symbol]) * 100;
    }, 0).toFixed(2)),
  }));
}

function buildBenchmarkSeries(benchmark: string, historyMap: Record<string, HistoryPoint[]>, dates: string[]): HistoryPoint[] {
  const pts = historyMap[benchmark];
  if (!pts?.length || !dates.length) return [];
  const base = pts.find((p) => p.date === dates[0])?.value;
  if (!base) return [];
  return dates.map((date) => {
    const pt = pts.find((p) => p.date === date);
    return { date, value: pt ? parseFloat(((pt.value / base) * 100).toFixed(2)) : 100 };
  });
}

function computeMetrics(series: HistoryPoint[]) {
  if (series.length < 2) return null;
  const first = series[0].value, last = series[series.length - 1].value;
  const totalReturn = parseFloat(((last / first - 1) * 100).toFixed(2));
  const days  = (new Date(series[series.length - 1].date).getTime() - new Date(series[0].date).getTime()) / 86400000;
  const years = Math.max(days / 365.25, 0.1);
  const cagr  = parseFloat(((Math.pow(last / first, 1 / years) - 1) * 100).toFixed(2));
  const rets  = series.slice(1).map((p, i) => (p.value - series[i].value) / series[i].value);
  const mean  = rets.reduce((a, b) => a + b, 0) / rets.length;
  const vol   = parseFloat((Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length * (rets.length / years)) * 100).toFixed(2));
  let peak = first, maxDD = 0;
  for (const p of series) { if (p.value > peak) peak = p.value; const dd = (p.value - peak) / peak; if (dd < maxDD) maxDD = dd; }
  return { totalReturn, cagr, vol, maxDD: parseFloat((maxDD * 100).toFixed(2)) };
}

// ── Asset search sub-component ────────────────────────────────────────────────
function AssetSearch({ onAdd, api, existing }: { onAdd: (s: string) => void; api: string; existing: string[] }) {
  const [query, setQuery]     = useState('');
  const [results, setResults] = useState<{ symbol: string; name: string }[]>([]);
  const [open, setOpen]       = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setQuery(''); setResults([]); } };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const t = setTimeout(() => {
      fetch(`${api}/market-data/search?q=${encodeURIComponent(query)}`).then((r) => r.json()).then(setResults).catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [query, api]);

  const select = (s: string) => { if (!existing.includes(s)) onAdd(s); setQuery(''); setResults([]); setOpen(false); };

  return (
    <div ref={ref} className="relative">
      <div className={`flex items-center gap-2 border rounded-lg px-3 py-2 transition-all bg-white dark:bg-slate-900 ${open ? 'border-indigo-400 ring-2 ring-indigo-50 dark:ring-indigo-950' : 'border-dashed border-slate-300 dark:border-slate-600'}`}>
        <Search size={13} className="text-slate-400 dark:text-slate-500 shrink-0" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} onFocus={() => setOpen(true)}
          placeholder="Add asset…"
          className="flex-1 text-sm outline-none bg-transparent text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-600 w-28" />
      </div>
      {open && results.length > 0 && (
        <div className="absolute top-11 left-0 z-50 w-72 bg-white dark:bg-slate-900 rounded-xl shadow-xl dark:shadow-none border border-slate-200 dark:border-slate-700 overflow-hidden">
          <ul className="max-h-48 overflow-y-auto">
            {results.slice(0, 6).map((r, i) => (
              <li key={`${r.symbol}-${i}`}>
                <button onClick={() => select(r.symbol)} disabled={existing.includes(r.symbol)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 w-16 shrink-0">{r.symbol}</span>
                  <span className="text-xs text-slate-400 dark:text-slate-500 truncate">{r.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function IndexBuilderPage() {
  const { api, user } = useApp();
  const supabase = createClient();

  // Multi-index state
  const [savedIndexes, setSavedIndexes] = useState<SavedIndex[]>([]);
  const [currentId, setCurrentId]       = useState<string | null>(null);
  const [indexName, setIndexName]       = useState('');

  const [holdings, setHoldings]       = useState<Holding[]>([]);
  const [benchmark, setBenchmark]     = useState('SPY');
  const [dateRange, setDateRange]     = useState<DateRange>(DATE_PRESETS[3]);
  const [historyMap, setHistoryMap]   = useState<Record<string, HistoryPoint[]>>({});
  const [loading, setLoading]         = useState(false);
  const [saving, setSaving]           = useState(false);
  const [saved, setSaved]             = useState(false);
  const [saveError, setSaveError]     = useState('');
  const [benchOpen, setBenchOpen]     = useState(false);
  const benchRef = useRef<HTMLDivElement>(null);

  // Close benchmark dropdown on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => { if (benchRef.current && !benchRef.current.contains(e.target as Node)) setBenchOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // Load all saved indexes on mount, auto-load most recent
  useEffect(() => {
    if (!user) return;
    supabase
      .from('custom_indexes')
      .select('id, name, updated_at, index_holdings(asset_symbol, weight)')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .then(({ data }) => {
        if (data && data.length > 0) {
          const mapped = data.map((idx: any) => ({
            id: idx.id,
            name: idx.name,
            updatedAt: idx.updated_at,
            holdings: (idx.index_holdings as any[]).map((h: any) => ({ symbol: h.asset_symbol, weight: h.weight })),
          }));
          setSavedIndexes(mapped);
          // Auto-load most recent
          setCurrentId(mapped[0].id);
          setIndexName(mapped[0].name);
          setHoldings(mapped[0].holdings);
        }
      });
  }, [user]); // eslint-disable-line

  // Fetch history for all assets + benchmark when symbols or date range change
  const symKey = [...holdings.map((h) => h.symbol), benchmark].sort().join(',');
  useEffect(() => {
    const allSyms = [...new Set([...holdings.map((h) => h.symbol), benchmark])];
    if (!allSyms.length) return;
    setLoading(true);
    fetch(`${api}/market-data/history?symbols=${allSyms.join(',')}&period=${dateRange.period}&interval=${dateRange.interval}`)
      .then((r) => r.json())
      .then((rows: { date: string; asset: string; value: number }[]) => {
        const map: Record<string, HistoryPoint[]> = {};
        for (const r of rows) { if (!map[r.asset]) map[r.asset] = []; map[r.asset].push({ date: r.date, value: r.value }); }
        for (const k of Object.keys(map)) map[k].sort((a, b) => a.date.localeCompare(b.date));
        setHistoryMap(map);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [symKey, dateRange, api]); // eslint-disable-line

  const equalSplit = (list: Holding[]): Holding[] => {
    const n = list.length;
    const base = Math.floor(100 / n);
    const extra = 100 - base * n;
    return list.map((h, i) => ({ ...h, weight: base + (i < extra ? 1 : 0) }));
  };

  const addHolding = (symbol: string) => {
    if (holdings.length >= 10) return;
    setHoldings((prev) => equalSplit([...prev, { symbol, weight: 0 }]));
  };

  const removeHolding = (symbol: string) => {
    setHoldings((prev) => {
      const remaining = prev.filter((h) => h.symbol !== symbol);
      return remaining.length ? equalSplit(remaining) : [];
    });
  };

  const setWeight = (symbol: string, newWeight: number) => {
    const clamped = Math.max(0, Math.min(100, newWeight));
    setHoldings((prev) => {
      const others = prev.filter((h) => h.symbol !== symbol);
      const remainder = 100 - clamped;
      const otherTotal = others.reduce((s, h) => s + h.weight, 0);
      let adjusted: Holding[];
      if (otherTotal === 0 || others.length === 0) {
        const base = Math.floor(remainder / (others.length || 1));
        const extra = remainder - base * others.length;
        adjusted = others.map((h, i) => ({ ...h, weight: base + (i < extra ? 1 : 0) }));
      } else {
        adjusted = others.map((h) => ({ ...h, weight: Math.round((h.weight / otherTotal) * remainder) }));
        // Fix any rounding drift
        const drift = remainder - adjusted.reduce((s, h) => s + h.weight, 0);
        if (adjusted.length > 0) adjusted[0] = { ...adjusted[0], weight: adjusted[0].weight + drift };
      }
      return prev.map((h) => h.symbol === symbol ? { ...h, weight: clamped } : adjusted.find((a) => a.symbol === h.symbol)!);
    });
  };

  const applyPreset   = (preset: typeof PRESETS[0]) => setHoldings(preset.holdings);
  const reset         = () => setHoldings([]);

  // New / Load / Delete
  const newIndex = () => { setCurrentId(null); setIndexName(''); setHoldings([]); };
  const loadIndex = (idx: SavedIndex) => { setCurrentId(idx.id); setIndexName(idx.name); setHoldings(idx.holdings); };
  const deleteIndex = async (id: string) => {
    await supabase.from('custom_indexes').delete().eq('id', id);
    setSavedIndexes((prev) => prev.filter((i) => i.id !== id));
    if (currentId === id) { setCurrentId(null); setIndexName(''); setHoldings([]); }
  };

  const saveIndex = async () => {
    if (!user || !indexName.trim()) return;
    setSaving(true);
    setSaveError('');
    let indexId = currentId;
    if (!indexId) {
      const { data, error } = await supabase
        .from('custom_indexes')
        .insert({ user_id: user.id, name: indexName.trim(), updated_at: new Date().toISOString() })
        .select().single();
      if (error) { setSaveError(error.message); setSaving(false); return; }
      indexId = data?.id ?? null;
      if (indexId) setCurrentId(indexId);
    } else {
      const { error } = await supabase.from('custom_indexes')
        .update({ name: indexName.trim(), updated_at: new Date().toISOString() })
        .eq('id', indexId);
      if (error) { setSaveError(error.message); setSaving(false); return; }
    }
    if (!indexId) { setSaveError('Failed to create index — check DB tables exist.'); setSaving(false); return; }
    // Replace holdings
    await supabase.from('index_holdings').delete().eq('index_id', indexId);
    if (holdings.length) {
      await supabase.from('index_holdings').insert(
        holdings.map((h) => ({ index_id: indexId!, asset_symbol: h.symbol, weight: h.weight }))
      );
    }
    // Update local list
    setSavedIndexes((prev) => {
      const entry = { id: indexId!, name: indexName.trim(), holdings, updatedAt: new Date().toISOString() };
      const exists = prev.find((i) => i.id === indexId);
      return exists ? prev.map((i) => i.id === indexId ? entry : i) : [entry, ...prev];
    });
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  // Derived state
  const totalWeight   = holdings.reduce((a, h) => a + h.weight, 0);
  const weightOk      = Math.abs(totalWeight - 100) < 0.01;
  const indexSeries   = weightOk ? buildIndexSeries(holdings, historyMap) : [];
  const benchSeries   = buildBenchmarkSeries(benchmark, historyMap, indexSeries.map((p) => p.date));
  const metrics       = computeMetrics(indexSeries);
  const benchMetrics  = computeMetrics(benchSeries);

  // Merge for chart
  const chartIndexLabel = currentId
    ? ((savedIndexes.find((i) => i.id === currentId)?.name ?? indexName) || 'My Index')
    : (indexName.trim() || 'My Index');

  const chartData = indexSeries.map((p, i) => ({
    date:             p.date,
    [chartIndexLabel]: p.value,
    [benchmark]:      benchSeries[i]?.value ?? null,
  }));

  const alpha = metrics && benchMetrics
    ? parseFloat((metrics.totalReturn - benchMetrics.totalReturn).toFixed(2))
    : null;

  const hasChart = chartData.length > 1 && weightOk;

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Index Lab</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Build and save custom indexes — compare them against a benchmark</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Benchmark picker */}
          <div ref={benchRef} className="relative">
            <button onClick={() => setBenchOpen((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-indigo-300 transition-colors">
              vs {benchmark} <ChevronDown size={12} />
            </button>
            {benchOpen && (
              <div className="absolute top-9 right-0 z-50 bg-white dark:bg-slate-900 rounded-xl shadow-xl dark:shadow-none border border-slate-200 dark:border-slate-700 overflow-hidden py-1 min-w-[120px]">
                {BENCHMARKS.map((b) => (
                  <button key={b} onClick={() => { setBenchmark(b); setBenchOpen(false); }}
                    className={`w-full text-left px-4 py-2 text-sm font-medium transition-colors ${b === benchmark ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                    {b}
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Date range */}
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

      {/* Presets */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium text-slate-400 dark:text-slate-500">Quick start:</span>
        {PRESETS.map((p) => (
          <button key={p.label} onClick={() => applyPreset(p)}
            className="text-xs px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-indigo-50 dark:hover:bg-indigo-950 hover:text-indigo-600 dark:hover:text-indigo-400 font-medium transition-colors border border-transparent hover:border-indigo-200">
            {p.label}
          </button>
        ))}
      </div>

      {/* Saved indexes panel */}
      {user && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Saved Indexes</p>
            <button onClick={newIndex} className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 font-medium hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors">
              <Plus size={11} /> New
            </button>
          </div>
          {savedIndexes.length === 0 ? (
            <p className="px-5 py-4 text-xs text-slate-400 dark:text-slate-500">No saved indexes yet. Build one below and save it.</p>
          ) : (
            <ul className="divide-y divide-slate-50 dark:divide-slate-800">
              {savedIndexes.map((idx) => (
                <li key={idx.id} className={`flex items-center justify-between px-5 py-3 ${currentId === idx.id ? 'bg-indigo-50/40 dark:bg-indigo-950/20' : ''}`}>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{idx.name}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 truncate">
                      {idx.holdings.map((h) => `${h.symbol} ${h.weight}%`).join(' · ')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 ml-3 shrink-0">
                    <button onClick={() => loadIndex(idx)} disabled={currentId === idx.id}
                      className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${
                        currentId === idx.id
                          ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-300 cursor-default'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-indigo-50 dark:hover:bg-indigo-950 hover:text-indigo-600'
                      }`}>
                      {currentId === idx.id ? 'Editing' : 'Load'}
                    </button>
                    <button onClick={() => deleteIndex(idx.id)} className="text-slate-300 dark:text-slate-600 hover:text-rose-500 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* 3-col grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Holdings panel */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                {currentId ? 'Editing Index' : 'New Index'}
              </p>
              {currentId && indexName && (
                <p className="text-xs text-indigo-600 dark:text-indigo-400 font-medium mt-0.5">{indexName}</p>
              )}
            </div>
            <span className={`text-xs font-semibold tabular-nums ${weightOk ? 'text-emerald-600' : totalWeight > 100 ? 'text-rose-600' : 'text-amber-600'}`}>
              {totalWeight.toFixed(0)}% {weightOk ? '✓' : totalWeight > 100 ? '↑ over' : '↓ under'}
            </span>
          </div>

          {!holdings.length ? (
            <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-6">Use a preset or add assets below.</p>
          ) : (
            <div className="space-y-3">
              {holdings.map((h, i) => (
                <div key={h.symbol} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{h.symbol}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input type="number" min={0} max={100} value={h.weight}
                        onChange={(e) => setWeight(h.symbol, Math.max(0, Math.min(100, Number(e.target.value))))}
                        className="w-14 text-xs text-right font-semibold bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-400 tabular-nums" />
                      <span className="text-xs text-slate-400 dark:text-slate-500">%</span>
                      <button onClick={() => removeHolding(h.symbol)} className="text-slate-300 dark:text-slate-600 hover:text-rose-500 transition-colors"><X size={13} /></button>
                    </div>
                  </div>
                  <input type="range" min={0} max={100} value={h.weight}
                    onChange={(e) => setWeight(h.symbol, Number(e.target.value))}
                    className="w-full h-1 accent-indigo-600 cursor-pointer" />
                </div>
              ))}
            </div>
          )}

          {holdings.length < 10 && <AssetSearch onAdd={addHolding} api={api} existing={holdings.map((h) => h.symbol)} />}

          <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800">
            <button onClick={reset} className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500 hover:text-rose-500 transition-colors">
              <RotateCcw size={12} /> Reset
            </button>
          </div>

          {user && (
            <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <input
                value={indexName}
                onChange={(e) => setIndexName(e.target.value)}
                placeholder="Index name (e.g. My Tech Strategy)"
                className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
              <div className="flex items-center justify-between">
                <button onClick={newIndex}
                  className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                  <Plus size={12} /> New index
                </button>
                <button onClick={saveIndex} disabled={saving || !indexName.trim() || !holdings.length}
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
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none p-5 flex flex-col">
          <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">Allocation</p>
          {holdings.length > 0 && totalWeight > 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center">
              <ResponsiveContainer width="100%" height={200}>
                <RechartsPie>
                  <Pie data={holdings} dataKey="weight" nameKey="symbol" cx="50%" cy="50%"
                    innerRadius={55} outerRadius={80} paddingAngle={2} animationDuration={400} animationEasing="ease-out">
                    {holdings.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => `${v}%`} contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, fontSize: 12 }} />
                </RechartsPie>
              </ResponsiveContainer>
              <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 mt-1">
                {holdings.map((h, i) => (
                  <span key={h.symbol} className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    {h.symbol} {h.weight}%
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-slate-400 dark:text-slate-500">Add holdings to see allocation</div>
          )}
        </div>

        {/* Metrics */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none p-5 space-y-4">
          <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Metrics vs {benchmark}</p>
          {metrics && benchMetrics && weightOk ? (
            <div className="space-y-3">
              {[
                { label: 'Index Return',        value: `${metrics.totalReturn >= 0 ? '+' : ''}${metrics.totalReturn}%`,             color: metrics.totalReturn >= 0 ? 'text-emerald-600' : 'text-rose-600' },
                { label: `${benchmark} Return`, value: `${benchMetrics.totalReturn >= 0 ? '+' : ''}${benchMetrics.totalReturn}%`,   color: benchMetrics.totalReturn >= 0 ? 'text-emerald-600' : 'text-rose-600' },
                { label: 'Alpha',               value: alpha != null ? `${alpha >= 0 ? '+' : ''}${alpha}%` : '—',                   color: alpha != null && alpha >= 0 ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold' },
                { label: 'Volatility',          value: `${metrics.vol}%`,                                                            color: 'text-slate-900 dark:text-slate-100' },
                { label: 'Max Drawdown',        value: `${metrics.maxDD}%`,                                                          color: 'text-rose-600' },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex items-center justify-between py-1.5 border-b border-slate-50 dark:border-slate-800 last:border-0">
                  <span className="text-xs text-slate-400 dark:text-slate-500">{label}</span>
                  <span className={`text-sm font-bold tabular-nums ${color}`}>{value}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-36 text-sm text-slate-400 dark:text-slate-500 text-center">
              {!holdings.length ? 'Add components to see metrics' : !weightOk ? 'Adjust weights to total 100%' : 'Loading…'}
            </div>
          )}
        </div>
      </div>

      {/* Performance chart */}
      {hasChart && (
        <div className={`bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none p-5 transition-opacity duration-300 ${loading ? 'opacity-40' : 'opacity-100'}`}>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{chartIndexLabel} vs {benchmark}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Both normalized to 100 at start of period</p>
            </div>
            {alpha != null && (
              <span className={`text-sm font-bold px-3 py-1 rounded-full ${alpha >= 0 ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-600' : 'bg-rose-50 dark:bg-rose-950 text-rose-600'}`}>
                Alpha {alpha >= 0 ? '+' : ''}{alpha}%
              </span>
            )}
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} width={40} tickFormatter={(v) => `${v}`} />
              <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, fontSize: 12 }}
                formatter={(v: any, name: any) => [`${v}`, name]} />
              <Legend formatter={(v) => <span className="text-xs text-slate-600 dark:text-slate-400">{v}</span>} iconType="circle" iconSize={8} />
              <Line type="monotone" dataKey={chartIndexLabel} stroke="#6366f1" strokeWidth={2.5} dot={false} animationDuration={400} animationEasing="ease-out" />
              <Line type="monotone" dataKey={benchmark} stroke="#94a3b8" strokeWidth={1.5} dot={false} strokeDasharray="4 3" animationDuration={400} animationEasing="ease-out" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

    </div>
  );
}
