'use client';

import { useState, useEffect, useRef } from 'react';
import { ChevronDown, Search, X, Layers, TrendingUp, TrendingDown, Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/browser';
import { useApp } from '@/lib/context';

interface Holding      { symbol: string; weight: number; }
interface SavedIndex   { id: string; name: string; holdings: Holding[]; }
interface HistoryPoint { date: string; asset?: string; value: number; }
interface SearchResult { symbol: string; name: string; }

interface Metrics {
  totalReturn: number; cagr: number; volatility: number; maxDrawdown: number; sharpe: number;
}
interface ComparisonResult {
  indexName: string; benchmarkLabel: string; index: Metrics; benchmark: Metrics;
}

const PERIODS = [
  { label: '1M', period: '1m', interval: '1d',  years: 1 / 12 },
  { label: '3M', period: '3m', interval: '1d',  years: 0.25 },
  { label: '6M', period: '6m', interval: '1d',  years: 0.5 },
  { label: '1Y', period: '1y', interval: '1d',  years: 1 },
  { label: '2Y', period: '2y', interval: '1wk', years: 2 },
  { label: '5Y', period: '5y', interval: '1wk', years: 5 },
];

const PERIODS_PER_YEAR: Record<string, number> = { '1d': 252, '1wk': 52, '1mo': 12 };
const COLORS = ['#6366f1','#10b981','#f59e0b','#8b5cf6','#ef4444','#06b6d4','#f97316','#84cc16'];

function computeMetrics(values: number[], years: number, periodsPerYear: number): Metrics | null {
  if (values.length < 3) return null;
  const first = values[0], last = values[values.length - 1];
  if (first === 0) return null;
  const totalReturn = (last / first - 1) * 100;
  const cagr = (Math.pow(last / first, 1 / Math.max(years, 0.01)) - 1) * 100;
  const rets: number[] = [];
  for (let i = 1; i < values.length; i++) {
    if (values[i - 1] > 0) rets.push(values[i] / values[i - 1] - 1);
  }
  const mean = rets.reduce((s, r) => s + r, 0) / rets.length;
  const variance = rets.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / Math.max(rets.length - 1, 1);
  const volatility = Math.sqrt(variance) * Math.sqrt(periodsPerYear) * 100;
  let peak = values[0], maxDrawdown = 0;
  for (const v of values) {
    if (v > peak) peak = v;
    const dd = (peak - v) / peak;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }
  const sharpe = volatility > 0 ? (cagr - 4) / volatility : 0;
  return { totalReturn, cagr, volatility, maxDrawdown: maxDrawdown * 100, sharpe };
}

function buildPortfolioSeries(holdings: Holding[], totalWeight: number, histMap: Record<string, HistoryPoint[]>): number[] {
  const allDates = new Set<string>();
  for (const h of holdings) (histMap[h.symbol] ?? []).forEach((p) => allDates.add(p.date));
  const sortedDates = [...allDates].sort();
  if (sortedDates.length === 0) return [];
  const priceMaps: Record<string, Record<string, number>> = {};
  for (const h of holdings) {
    const hist = [...(histMap[h.symbol] ?? [])].sort((a, b) => a.date.localeCompare(b.date));
    const map: Record<string, number> = {};
    let last = 0, j = 0;
    for (const date of sortedDates) {
      while (j < hist.length && hist[j].date <= date) { last = hist[j].value; j++; }
      if (last > 0) map[date] = last;
    }
    priceMaps[h.symbol] = map;
  }
  let startIdx = -1;
  const startPrices: Record<string, number> = {};
  for (let i = 0; i < sortedDates.length; i++) {
    const d = sortedDates[i];
    if (holdings.every((h) => priceMaps[h.symbol][d])) {
      startIdx = i;
      holdings.forEach((h) => { startPrices[h.symbol] = priceMaps[h.symbol][d]; });
      break;
    }
  }
  if (startIdx < 0) return [];
  const series: number[] = [];
  for (let i = startIdx; i < sortedDates.length; i++) {
    const d = sortedDates[i];
    let val = 0, coveredWeight = 0;
    for (const h of holdings) {
      const sp = startPrices[h.symbol], cp = priceMaps[h.symbol][d];
      if (sp && cp) { val += (h.weight / totalWeight) * (cp / sp); coveredWeight += h.weight / totalWeight; }
    }
    if (coveredWeight > 0) series.push(val / coveredWeight);
  }
  return series;
}

function buildBenchmarkSeries(history: HistoryPoint[]): number[] {
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 2) return [];
  const sp = sorted[0].value;
  return sorted.map((p) => p.value / sp);
}

function fmt(v: number, dp = 2) { return v.toFixed(dp); }

export default function IndexSimulatorPage() {
  const { user, api } = useApp();
  const supabase = createClient();

  const [indexes,        setIndexes]        = useState<SavedIndex[]>([]);
  const [selectedId,     setSelectedId]     = useState('');
  const [customHoldings, setCustomHoldings] = useState<Holding[]>([]);
  const [addSymbol,      setAddSymbol]      = useState('');
  const [addResults,     setAddResults]     = useState<SearchResult[]>([]);
  const [addLoading,     setAddLoading]     = useState(false);
  const [addDropdown,    setAddDropdown]    = useState(false);
  const [benchQuery,     setBenchQuery]     = useState('');
  const [benchResults,   setBenchResults]   = useState<SearchResult[]>([]);
  const [benchSymbol,    setBenchSymbol]    = useState('');
  const [benchName,      setBenchName]      = useState('');
  const [searchOpen,     setSearchOpen]     = useState(false);
  const [period,         setPeriod]         = useState(PERIODS[3]);
  const [loading,        setLoading]        = useState(false);
  const [searchLoading,  setSearchLoading]  = useState(false);
  const [result,         setResult]         = useState<ComparisonResult | null>(null);
  const [error,          setError]          = useState('');
  const searchRef  = useRef<HTMLDivElement>(null);
  const addRef     = useRef<HTMLDivElement>(null);

  // Load saved indexes
  useEffect(() => {
    if (!user) return;
    supabase
      .from('custom_indexes')
      .select('id, name, index_holdings(asset_symbol, weight)')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .then(({ data }) => {
        if (data) setIndexes(data.map((idx: any) => ({
          id: idx.id, name: idx.name,
          holdings: (idx.index_holdings as any[]).map((h: any) => ({ symbol: h.asset_symbol, weight: h.weight ?? 0 })),
        })));
      });
  }, [user]); // eslint-disable-line

  // Asset search for custom index
  useEffect(() => {
    const q = addSymbol.trim();
    if (!q) { setAddResults([]); setAddDropdown(false); return; }
    setAddLoading(true);
    const timer = setTimeout(() => {
      fetch(`${api}/market-data/search?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((data: SearchResult[]) => { setAddResults(data ?? []); setAddDropdown(true); })
        .catch(() => setAddResults([]))
        .finally(() => setAddLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [addSymbol, api]); // eslint-disable-line

  // Benchmark search
  useEffect(() => {
    const q = benchQuery.trim();
    if (!q) { setBenchResults([]); return; }
    setSearchLoading(true);
    const timer = setTimeout(() => {
      fetch(`${api}/market-data/search?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((data: SearchResult[]) => { setBenchResults(data.slice(0, 6)); setSearchOpen(true); })
        .catch(() => {})
        .finally(() => setSearchLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [benchQuery, api]); // eslint-disable-line

  // Outside click handlers
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false);
      if (addRef.current   && !addRef.current.contains(e.target as Node))    setAddDropdown(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Smart weight balancing
  function equalShare(count: number) { return parseFloat((100 / count).toFixed(1)); }

  function setWeight(symbol: string, raw: number) {
    const w = Math.min(100, Math.max(0, raw));
    setCustomHoldings((prev) => {
      const others = prev.filter((h) => h.symbol !== symbol);
      const remaining = parseFloat((100 - w).toFixed(10));
      const othersTotal = others.reduce((s, h) => s + h.weight, 0);
      const balanced = others.map((h) => ({
        ...h,
        weight: othersTotal > 0
          ? parseFloat(((h.weight / othersTotal) * remaining).toFixed(1))
          : parseFloat((remaining / others.length).toFixed(1)),
      }));
      return prev.map((h) => h.symbol === symbol ? { ...h, weight: w } : balanced.find((b) => b.symbol === h.symbol)!);
    });
    setResult(null);
  }

  function removeCustomHolding(symbol: string) {
    setCustomHoldings((prev) => {
      const next = prev.filter((h) => h.symbol !== symbol);
      if (next.length === 0) return next;
      const share = equalShare(next.length);
      return next.map((h) => ({ ...h, weight: share }));
    });
    setResult(null);
  }

  function addCustomHolding(sym?: string) {
    const s = (sym ?? addSymbol).trim().toUpperCase();
    if (!s || customHoldings.some((h) => h.symbol === s)) return;
    setCustomHoldings((prev) => {
      const next = [...prev, { symbol: s, weight: 0 }];
      const share = equalShare(next.length);
      return next.map((h) => ({ ...h, weight: share }));
    });
    setAddSymbol(''); setAddResults([]); setAddDropdown(false); setResult(null);
  }

  function selectBenchmark(r: SearchResult) {
    setBenchSymbol(r.symbol); setBenchName(r.name);
    setBenchQuery(''); setBenchResults([]); setSearchOpen(false); setResult(null);
  }

  async function runComparison() {
    const isCustom  = selectedId === '';
    const activeHoldings = isCustom ? customHoldings : (indexes.find((i) => i.id === selectedId)?.holdings ?? []);
    if (!activeHoldings.length || !benchSymbol) return;

    setLoading(true); setError(''); setResult(null);
    try {
      const allSymbols = [...new Set([...activeHoldings.map((h) => h.symbol), benchSymbol])].join(',');
      const res = await fetch(`${api}/market-data/history?symbols=${allSymbols}&period=${period.period}&interval=${period.interval}`);
      if (!res.ok) throw new Error('Failed to fetch market data');
      const raw: HistoryPoint[] = await res.json();

      // Group flat array by asset
      const histMap: Record<string, HistoryPoint[]> = {};
      for (const pt of raw) {
        const key = pt.asset ?? '';
        if (!histMap[key]) histMap[key] = [];
        histMap[key].push(pt);
      }

      const totalWeight = activeHoldings.reduce((s, h) => s + h.weight, 0);
      if (totalWeight === 0) throw new Error('Index has no weighted holdings.');

      const indexSeries     = buildPortfolioSeries(activeHoldings, totalWeight, histMap);
      const benchmarkSeries = buildBenchmarkSeries(histMap[benchSymbol] ?? []);

      const ppy  = PERIODS_PER_YEAR[period.interval] ?? 252;
      const idxM = computeMetrics(indexSeries,     period.years, ppy);
      const bchM = computeMetrics(benchmarkSeries, period.years, ppy);

      if (!idxM) throw new Error('Not enough index data for this period.');
      if (!bchM) throw new Error(`Not enough data for ${benchSymbol} in this period.`);

      const indexName = isCustom ? 'Custom Index' : (indexes.find((i) => i.id === selectedId)?.name ?? 'Index');
      setResult({
        indexName,
        benchmarkLabel: benchName ? `${benchSymbol} — ${benchName}` : benchSymbol,
        index: idxM, benchmark: bchM,
      });
    } catch (e: any) {
      setError(e.message ?? 'Failed to load data.');
    }
    setLoading(false);
  }

  const isCustom       = selectedId === '';
  const activeHoldings = isCustom ? customHoldings : (indexes.find((i) => i.id === selectedId)?.holdings ?? []);
  const totalWeight    = customHoldings.reduce((s, h) => s + h.weight, 0);
  const canRun         = activeHoldings.length > 0 && !!benchSymbol;

  const metrics: { key: keyof Metrics; label: string; suffix: string; lowerIsBetter?: boolean }[] = [
    { key: 'totalReturn', label: 'Total Return',       suffix: '%' },
    { key: 'cagr',        label: 'Ann. Return (CAGR)', suffix: '%' },
    { key: 'volatility',  label: 'Volatility (Ann.)',  suffix: '%', lowerIsBetter: true },
    { key: 'maxDrawdown', label: 'Max Drawdown',       suffix: '%', lowerIsBetter: true },
    { key: 'sharpe',      label: 'Sharpe Ratio',       suffix: '' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Index Simulator</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Compare a custom index against any benchmark over a chosen period
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-end gap-4">

        {/* Index selector */}
        <div className="space-y-1.5 flex-1 min-w-[180px]">
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Custom Index</label>
          <div className="relative">
            <select
              value={selectedId}
              onChange={(e) => {
                if (e.target.value === '__create__') { window.location.href = '/index-builder'; return; }
                setSelectedId(e.target.value); setResult(null);
              }}
              className="w-full appearance-none px-3 py-2.5 pr-9 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="">Custom</option>
              {indexes.map((idx) => <option key={idx.id} value={idx.id}>{idx.name}</option>)}
              <option disabled>──────────</option>
              <option value="__create__">+ Create new custom index</option>
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        </div>

        {/* Benchmark search */}
        <div className="space-y-1.5 flex-1 min-w-[180px]" ref={searchRef}>
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Benchmark</label>
          {benchSymbol ? (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl">
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{benchSymbol}</span>
              {benchName && <span className="text-xs text-slate-400 truncate flex-1">{benchName}</span>}
              <button onClick={() => { setBenchSymbol(''); setBenchName(''); setResult(null); }} className="text-slate-300 hover:text-slate-500 dark:hover:text-slate-300 shrink-0">
                <X size={14} />
              </button>
            </div>
          ) : (
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input value={benchQuery} onChange={(e) => { setBenchQuery(e.target.value); setResult(null); }}
                onFocus={() => benchResults.length > 0 && setSearchOpen(true)}
                placeholder="Search ticker or name…"
                className="w-full pl-8 pr-3 py-2.5 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {searchLoading && <div className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin" />}
              {searchOpen && benchResults.length > 0 && (
                <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg overflow-hidden">
                  {benchResults.map((r, i) => (
                    <button key={`${r.symbol}-${i}`} onClick={() => selectBenchmark(r)}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 w-16 shrink-0">{r.symbol}</span>
                      <span className="text-xs text-slate-400 truncate">{r.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Period */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Period</label>
          <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
            {PERIODS.map((p) => (
              <button key={p.label} onClick={() => { setPeriod(p); setResult(null); }}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  period.label === p.label
                    ? 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}>{p.label}
              </button>
            ))}
          </div>
        </div>

      </div>

      {/* Custom index builder */}
      {isCustom && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 dark:border-slate-800">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Custom Index Holdings</p>
            {customHoldings.length > 0 && (
              <span className="text-xs text-slate-400">{customHoldings.length} asset{customHoldings.length !== 1 ? 's' : ''}</span>
            )}
          </div>

          {/* Empty state */}
          {customHoldings.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-slate-400 dark:text-slate-600">
              <Layers size={32} strokeWidth={1.25} className="opacity-20" />
              <p className="text-xs">Add assets below to build your custom index</p>
            </div>
          )}

          {/* Holdings rows */}
          {customHoldings.length > 0 && (
            <>
              <div className="flex items-center gap-3 px-5 py-2 border-b border-slate-50 dark:border-slate-800">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Asset · Weight · Allocation</span>
              </div>
              <div className="divide-y divide-slate-50 dark:divide-slate-800">
                {customHoldings.map((h, i) => {
                  const pct = totalWeight > 0 ? (h.weight / totalWeight) * 100 : 0;
                  return (
                    <div key={h.symbol} className="flex items-center gap-3 px-5 py-2.5">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 w-20 shrink-0">{h.symbol}</span>
                      <div className="flex items-center gap-1">
                        <input type="number" min="0" max="100" step="0.1" value={h.weight}
                          onChange={(e) => setWeight(h.symbol, parseFloat(e.target.value) || 0)}
                          className="w-16 px-2 py-1 text-xs tabular-nums text-right bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-800 dark:text-slate-100"
                        />
                        <span className="text-xs text-slate-400">%</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                        </div>
                      </div>
                      <button onClick={() => removeCustomHolding(h.symbol)} className="text-slate-300 dark:text-slate-600 hover:text-rose-500 p-1 rounded transition-colors shrink-0">
                        <X size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Add asset with search */}
          <div className="px-5 py-3 border-t border-slate-50 dark:border-slate-800" ref={addRef}>
            <div className="relative flex items-center gap-2">
              <div className="relative flex-1">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input value={addSymbol}
                  onChange={(e) => setAddSymbol(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addCustomHolding(); if (e.key === 'Escape') setAddDropdown(false); }}
                  onFocus={() => { if (addResults.length) setAddDropdown(true); }}
                  placeholder="Search symbol… e.g. AAPL, Nvidia"
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-800 dark:text-slate-100 placeholder-slate-400"
                />
                {addLoading && <div className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin" />}
              </div>
              <button onClick={() => addCustomHolding()} disabled={!addSymbol.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-lg transition-colors shrink-0">
                <Plus size={12} /> Add
              </button>
            </div>
            {addDropdown && addResults.length > 0 && (
              <div className="absolute z-20 mt-1 w-[calc(100%-2.5rem)] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg overflow-hidden">
                {addResults.slice(0, 8).map((r) => {
                  const already = customHoldings.some((h) => h.symbol === r.symbol);
                  return (
                    <button key={r.symbol} disabled={already} onClick={() => addCustomHolding(r.symbol)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-100 w-20 shrink-0">{r.symbol}</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400 truncate flex-1">{r.name}</span>
                      {already && <span className="text-[10px] text-slate-400 shrink-0">Added</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Compare button */}
          <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800">
            <button onClick={runComparison} disabled={!canRun || loading}
              className="w-full py-2.5 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl transition-colors">
              {loading ? 'Running…' : 'Compare'}
            </button>
          </div>
        </div>
      )}

      {/* Saved index composition */}
      {!isCustom && activeHoldings.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 dark:border-slate-800">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              {indexes.find((i) => i.id === selectedId)?.name ?? 'Index'} — Holdings
            </p>
            <span className="text-xs text-slate-400">{activeHoldings.length} assets</span>
          </div>
          <div className="px-5 py-3 flex flex-wrap gap-1.5">
            {activeHoldings.map((h, i) => {
              const color = COLORS[i % COLORS.length];
              const tw = activeHoldings.reduce((s, x) => s + x.weight, 0);
              const pct = tw > 0 ? ((h.weight / tw) * 100).toFixed(1) : h.weight.toFixed(1);
              return (
                <span key={h.symbol} className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md"
                  style={{ backgroundColor: color + '18', color }}>
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  {h.symbol} <span className="opacity-70">{pct}%</span>
                </span>
              );
            })}
          </div>
          <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800">
            <button onClick={runComparison} disabled={!canRun || loading}
              className="w-full py-2.5 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl transition-colors">
              {loading ? 'Running…' : 'Compare'}
            </button>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16 gap-3 text-slate-400">
          <div className="w-5 h-5 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
          <p className="text-sm">Fetching price history…</p>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          {error}
        </div>
      )}

      {/* Empty state */}
      {!loading && !result && !error && !isCustom && (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400 dark:text-slate-600 gap-3">
          <Layers size={48} strokeWidth={1.25} className="opacity-20" />
          <p className="text-sm">Select an index and benchmark, then click Compare</p>
        </div>
      )}

      {/* Results */}
      {!loading && result && (
        <div className="space-y-4">
          <div className="grid grid-cols-[1fr_140px_140px_80px] gap-x-4 px-5">
            <div />
            <div className="text-center">
              <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 truncate">{result.indexName}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Custom Index</p>
            </div>
            <div className="text-center">
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 truncate">{result.benchmarkLabel.split(' — ')[0]}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Benchmark</p>
            </div>
            <div className="text-center"><p className="text-xs font-semibold text-slate-400">Delta</p></div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
            {metrics.map(({ key, label, suffix, lowerIsBetter }) => {
              const idxVal = result.index[key], bchVal = result.benchmark[key];
              const delta  = idxVal - bchVal;
              const idxWins = lowerIsBetter ? idxVal < bchVal : idxVal > bchVal;
              const bchWins = lowerIsBetter ? bchVal < idxVal : bchVal > idxVal;
              const dp = key === 'sharpe' ? 3 : 2;
              return (
                <div key={key} className="grid grid-cols-[1fr_140px_140px_80px] gap-x-4 items-center px-5 py-3.5">
                  <p className="text-sm text-slate-600 dark:text-slate-400 font-medium">{label}</p>
                  <div className={`text-center px-3 py-1.5 rounded-lg ${idxWins ? 'bg-indigo-50 dark:bg-indigo-950/50' : ''}`}>
                    <p className={`text-sm font-semibold tabular-nums ${idxWins ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-700 dark:text-slate-300'}`}>
                      {fmt(idxVal, dp)}{suffix}
                    </p>
                  </div>
                  <div className={`text-center px-3 py-1.5 rounded-lg ${bchWins ? 'bg-slate-50 dark:bg-slate-800/60' : ''}`}>
                    <p className={`text-sm font-semibold tabular-nums ${bchWins ? 'text-slate-800 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'}`}>
                      {fmt(bchVal, dp)}{suffix}
                    </p>
                  </div>
                  <div className="text-center">
                    <span className={`text-xs font-semibold tabular-nums flex items-center justify-center gap-0.5 ${
                      delta === 0 ? 'text-slate-400'
                      : (lowerIsBetter ? delta < 0 : delta > 0) ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                    }`}>
                      {delta > 0 ? <TrendingUp size={11} /> : delta < 0 ? <TrendingDown size={11} /> : null}
                      {delta > 0 ? '+' : ''}{fmt(delta, dp)}{suffix}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-[10px] text-slate-400 dark:text-slate-600">
            Volatility and Sharpe ratio annualised using {period.interval === '1d' ? '252 trading days' : period.interval === '1wk' ? '52 weeks' : '12 months'} per year. Risk-free rate 4%. Past performance is not indicative of future results.
          </p>
        </div>
      )}
    </div>
  );
}
