'use client';

import { useState, useEffect, useRef } from 'react';
import { TrendingUp, TrendingDown, ChevronDown, BarChart2, Plus, X, Search } from 'lucide-react';
import { createClient } from '@/lib/supabase/browser';
import { useApp } from '@/lib/context';

interface Holding        { symbol: string; weight: number; }
interface SearchResult   { symbol: string; name: string; }
interface SavedPortfolio { id: string; name: string; holdings: Holding[]; }
interface HistoryPoint   { date: string; asset: string; value: number; }
interface SymbolResult {
  symbol: string; weight: number; allocated: number;
  returnPct: number | null; endValue: number | null; gain: number | null;
  noData: boolean;
}

const PERIODS = [
  { label: '1W', period: '5d',  interval: '1d',  desc: '1 week ago'   },
  { label: '1M', period: '1m',  interval: '1d',  desc: '1 month ago'  },
  { label: '3M', period: '3m',  interval: '1d',  desc: '3 months ago' },
  { label: '6M', period: '6m',  interval: '1wk', desc: '6 months ago' },
  { label: '1Y', period: '1y',  interval: '1wk', desc: '1 year ago'   },
  { label: '2Y', period: '2y',  interval: '1mo', desc: '2 years ago'  },
  { label: '5Y', period: '5y',  interval: '1mo', desc: '5 years ago'  },
];

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#f97316', '#84cc16'];

function calcResult(h: Holding, totalWeight: number, initialAmount: number, history: HistoryPoint[]): SymbolResult {
  const allocated = totalWeight > 0 ? (h.weight / totalWeight) * initialAmount : 0;
  const sorted = [...(history ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 2) {
    return { symbol: h.symbol, weight: h.weight, allocated, returnPct: null, endValue: null, gain: null, noData: true };
  }
  const startPrice = sorted[0].value;
  const endPrice   = sorted[sorted.length - 1].value;
  const returnPct  = parseFloat(((endPrice / startPrice - 1) * 100).toFixed(2));
  const endValue   = parseFloat((allocated * (endPrice / startPrice)).toFixed(2));
  const gain       = parseFloat((endValue - allocated).toFixed(2));
  return { symbol: h.symbol, weight: h.weight, allocated, returnPct, endValue, gain, noData: false };
}

function fmt$(v: number) {
  const abs = Math.abs(v);
  const str = abs >= 1_000_000 ? `$${(abs / 1_000_000).toFixed(2)}M`
            : abs >= 1_000     ? `$${abs.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
            : `$${abs.toFixed(2)}`;
  return v < 0 ? `-${str}` : str;
}

export default function PortfolioSimulatorPage() {
  const { user, api } = useApp();
  const supabase = createClient();

  const [portfolios,      setPortfolios]      = useState<SavedPortfolio[]>([]);
  const [selectedId,      setSelectedId]      = useState('');
  const [holdings,        setHoldings]        = useState<Holding[]>([]);
  const [investment,      setInvestment]      = useState('10000');
  const [period,          setPeriod]          = useState(PERIODS[4]);
  const [loading,         setLoading]         = useState(false);
  const [results,         setResults]         = useState<SymbolResult[]>([]);
  const [error,           setError]           = useState('');
  const [previewReturns,  setPreviewReturns]  = useState<Record<string, number | null>>({});
  const [previewLoading,  setPreviewLoading]  = useState(false);
  const [addSymbol,       setAddSymbol]       = useState('');
  const [searchResults,   setSearchResults]   = useState<SearchResult[]>([]);
  const [searchLoading,   setSearchLoading]   = useState(false);
  const [showDropdown,    setShowDropdown]     = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Load saved portfolios
  useEffect(() => {
    if (!user) return;
    supabase
      .from('portfolios')
      .select('id, name, portfolio_assets(asset_symbol, weight)')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .then(({ data }) => {
        if (data) setPortfolios(data.map((p: any) => ({
          id: p.id, name: p.name,
          holdings: (p.portfolio_assets as any[]).map((a: any) => ({ symbol: a.asset_symbol, weight: a.weight })),
        })));
      });
  }, [user]); // eslint-disable-line

  // When portfolio selection changes, load its holdings
  useEffect(() => {
    const p = portfolios.find((p) => p.id === selectedId);
    setHoldings(p ? p.holdings : []);
    setResults([]);
  }, [selectedId, portfolios]);

  // Search debounce
  useEffect(() => {
    const q = addSymbol.trim();
    if (!q) { setSearchResults([]); setShowDropdown(false); return; }
    setSearchLoading(true);
    const timer = setTimeout(() => {
      fetch(`${api}/market-data/search?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((data: SearchResult[]) => { setSearchResults(data ?? []); setShowDropdown(true); })
        .catch(() => setSearchResults([]))
        .finally(() => setSearchLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [addSymbol, api]); // eslint-disable-line

  // Close dropdown on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  // Fetch preview returns whenever holdings or period changes
  const holdingSymKey = holdings.map((h) => h.symbol).sort().join(',');
  useEffect(() => {
    if (!holdings.length) { setPreviewReturns({}); return; }
    setPreviewLoading(true);
    const symbols = holdings.map((h) => h.symbol).join(',');
    fetch(`${api}/market-data/history?symbols=${symbols}&period=${period.period}&interval=${period.interval}`)
      .then((r) => r.json())
      .then((raw: HistoryPoint[]) => {
        // Group flat array by asset symbol
        const grouped: Record<string, HistoryPoint[]> = {};
        for (const pt of raw) {
          if (!grouped[pt.asset]) grouped[pt.asset] = [];
          grouped[pt.asset].push(pt);
        }
        const map: Record<string, number | null> = {};
        for (const [sym, pts] of Object.entries(grouped)) {
          const sorted = [...pts].sort((a, b) => a.date.localeCompare(b.date));
          map[sym] = sorted.length >= 2
            ? parseFloat(((sorted[sorted.length - 1].value / sorted[0].value - 1) * 100).toFixed(2))
            : null;
        }
        setPreviewReturns(map);
      })
      .catch(() => setPreviewReturns({}))
      .finally(() => setPreviewLoading(false));
  }, [holdingSymKey, period.period, api]); // eslint-disable-line

  function equalShare(count: number) {
    return parseFloat((100 / count).toFixed(1));
  }

  function setWeight(symbol: string, raw: number) {
    const w = Math.min(100, Math.max(0, raw));
    setHoldings((prev) => {
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
    setResults([]);
  }

  function removeHolding(symbol: string) {
    setHoldings((prev) => {
      const next = prev.filter((h) => h.symbol !== symbol);
      if (next.length === 0) return next;
      const share = equalShare(next.length);
      return next.map((h) => ({ ...h, weight: share }));
    });
    setResults([]);
  }

  function addHolding(sym?: string) {
    const s = (sym ?? addSymbol).trim().toUpperCase();
    if (!s || holdings.some((h) => h.symbol === s)) return;
    setHoldings((prev) => {
      const next = [...prev, { symbol: s, weight: 0 }];
      const share = equalShare(next.length);
      return next.map((h) => ({ ...h, weight: share }));
    });
    setAddSymbol('');
    setSearchResults([]);
    setShowDropdown(false);
    setResults([]);
  }

  const initialAmount = Math.max(parseFloat(investment) || 0, 0);
  const totalWeight   = holdings.reduce((s, h) => s + (h.weight || 0), 0);

  async function runSimulation() {
    if (!holdings.length || !initialAmount) return;
    setLoading(true); setError('');
    try {
      const symbols = holdings.map((h) => h.symbol).join(',');
      const res = await fetch(`${api}/market-data/history?symbols=${symbols}&period=${period.period}&interval=${period.interval}`);
      if (!res.ok) throw new Error('Failed to fetch market data');
      const raw: HistoryPoint[] = await res.json();
      const histMap: Record<string, HistoryPoint[]> = {};
      for (const pt of raw) {
        if (!histMap[pt.asset]) histMap[pt.asset] = [];
        histMap[pt.asset].push(pt);
      }
      const computed = holdings.map((h) => calcResult(h, totalWeight, initialAmount, histMap[h.symbol] ?? []));
      setResults(computed);
      if (!computed.some((r) => !r.noData)) setError('No price data returned for any symbol in this period.');
    } catch (e: any) {
      setError(e.message ?? 'Failed to load data.');
    }
    setLoading(false);
  }

  const totalAllocated  = results.reduce((s, r) => s + r.allocated, 0);
  const totalEnd        = results.reduce((s, r) => s + (r.endValue ?? r.allocated), 0);
  const totalGain       = totalEnd - totalAllocated;
  const totalReturnPct  = totalAllocated > 0 ? parseFloat(((totalGain / totalAllocated) * 100).toFixed(2)) : 0;
  const isUp            = totalGain >= 0;
  const hasResults      = results.some((r) => !r.noData);
  const selectedPortfolio = portfolios.find((p) => p.id === selectedId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Portfolio Simulator</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Select a portfolio, enter an investment amount, pick a period — see what it would be worth today
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-end gap-4">
        {/* Portfolio selector */}
        <div className="space-y-1.5 flex-1 min-w-[200px]">
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Portfolio</label>
          <div className="relative">
            <select
              value={selectedId}
              onChange={(e) => {
                if (e.target.value === '__create__') {
                  window.location.href = '/portfolio';
                } else {
                  setSelectedId(e.target.value);
                }
              }}
              className="w-full appearance-none px-3 py-2.5 pr-9 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="">Custom</option>
              {portfolios.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              <option disabled>──────────</option>
              <option value="__create__">+ Create new portfolio</option>
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        </div>

        {/* Investment amount */}
        <div className="space-y-1.5 w-44">
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Initial Investment</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium">$</span>
            <input
              type="number" min="1" value={investment}
              onChange={(e) => { setInvestment(e.target.value); setResults([]); }}
              className="w-full pl-7 pr-3 py-2.5 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 tabular-nums"
            />
          </div>
        </div>

        {/* Period */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Period</label>
          <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
            {PERIODS.map((p) => (
              <button key={p.label} onClick={() => { setPeriod(p); setResults([]); }}
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

      {/* Holdings allocation */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 dark:border-slate-800">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Holdings & Allocation</p>
            {holdings.length > 0 && (
              <span className="text-xs text-slate-400">
                {holdings.length} asset{holdings.length !== 1 ? 's' : ''} · {fmt$(initialAmount)} total
              </span>
            )}
          </div>

          {/* Empty holdings state */}
          {holdings.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-slate-400 dark:text-slate-600">
              <BarChart2 size={32} strokeWidth={1.25} className="opacity-20" />
              <p className="text-xs">Add assets below or select a portfolio above</p>
            </div>
          )}

          {/* Column labels */}
          {holdings.length > 0 && (
            <div className="flex items-center gap-3 px-5 py-2 border-b border-slate-50 dark:border-slate-800">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Asset · Weight · Allocation</span>
              <span className="ml-auto text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                {previewLoading ? 'Loading…' : `${period.label} Return`}
              </span>
            </div>
          )}

          <div className="divide-y divide-slate-50 dark:divide-slate-800">
            {holdings.map((h, i) => {
              const weightPct = totalWeight > 0 ? (h.weight / totalWeight) * 100 : 0;
              const allocated = totalWeight > 0 ? (h.weight / totalWeight) * initialAmount : 0;
              const ret = previewReturns[h.symbol];
              const retColor = ret == null ? 'text-slate-400' : ret >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400';
              return (
                <div key={h.symbol} className="flex items-center gap-3 px-5 py-2.5">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 w-20 shrink-0">{h.symbol}</span>
                  {/* Weight input */}
                  <div className="flex items-center gap-1">
                    <input
                      type="number" min="0" max="100" step="0.1"
                      value={h.weight}
                      onChange={(e) => setWeight(h.symbol, parseFloat(e.target.value) || 0)}
                      className="w-16 px-2 py-1 text-xs tabular-nums text-right bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-800 dark:text-slate-100"
                    />
                    <span className="text-xs text-slate-400">%</span>
                  </div>
                  {/* Allocation bar */}
                  <div className="flex-1 min-w-0">
                    <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${weightPct}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                    </div>
                  </div>
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-300 tabular-nums w-16 text-right shrink-0">{fmt$(allocated)}</span>
                  <span className={`text-xs font-semibold tabular-nums w-14 text-right shrink-0 ${retColor}`}>
                    {previewLoading ? '…' : ret != null ? `${ret >= 0 ? '+' : ''}${ret}%` : '—'}
                  </span>
                  <button onClick={() => removeHolding(h.symbol)} className="text-slate-300 dark:text-slate-600 hover:text-rose-500 p-1 rounded transition-colors shrink-0">
                    <X size={13} />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Add symbol with search dropdown */}
          <div className="px-5 py-3 border-t border-slate-50 dark:border-slate-800" ref={searchRef}>
            <div className="relative flex items-center gap-2">
              <div className="relative flex-1">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  value={addSymbol}
                  onChange={(e) => setAddSymbol(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addHolding(); if (e.key === 'Escape') setShowDropdown(false); }}
                  onFocus={() => { if (searchResults.length) setShowDropdown(true); }}
                  placeholder="Search symbol… e.g. AAPL, Nvidia"
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-800 dark:text-slate-100 placeholder-slate-400"
                />
                {searchLoading && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin" />
                )}
              </div>
              <button onClick={() => addHolding()} disabled={!addSymbol.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-lg transition-colors shrink-0">
                <Plus size={12} /> Add
              </button>
            </div>

            {/* Search results dropdown */}
            {showDropdown && searchResults.length > 0 && (
              <div className="absolute z-20 mt-1 w-[calc(100%-2.5rem)] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg overflow-hidden">
                {searchResults.slice(0, 8).map((r) => {
                  const alreadyAdded = holdings.some((h) => h.symbol === r.symbol);
                  return (
                    <button
                      key={r.symbol}
                      disabled={alreadyAdded}
                      onClick={() => addHolding(r.symbol)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-100 w-20 shrink-0">{r.symbol}</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400 truncate flex-1">{r.name}</span>
                      {alreadyAdded && <span className="text-[10px] text-slate-400 shrink-0">Added</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Run button */}
          <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800">
            <button
              onClick={runSimulation}
              disabled={loading || !holdings.length || !initialAmount || totalWeight === 0}
              className="w-full py-2.5 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl transition-colors"
            >
              {loading ? 'Running…' : `Simulate ${period.label} Performance`}
            </button>
          </div>
        </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12 gap-3 text-slate-400">
          <div className="w-5 h-5 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
          <p className="text-sm">Fetching prices…</p>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          {error}
        </div>
      )}

      {/* Results */}
      {!loading && hasResults && (
        <>
          {/* Summary sentence */}
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {selectedPortfolio && <>If you invested <span className="font-semibold text-slate-700 dark:text-slate-300">{fmt$(initialAmount)}</span> in <span className="font-semibold text-slate-700 dark:text-slate-300">{selectedPortfolio.name}</span>{' '}</>}
            <span className="font-semibold text-slate-700 dark:text-slate-300">{period.desc}</span>, it would be worth:
          </p>

          {/* Hero */}
          <div className={`rounded-2xl px-6 py-5 border ${
            isUp ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800'
                 : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800'
          }`}>
            <div className="flex items-end gap-6 flex-wrap">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Current Value</p>
                <p className={`text-4xl font-bold tabular-nums ${isUp ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}>
                  {fmt$(totalEnd)}
                </p>
              </div>
              <div className="pb-0.5 flex flex-col gap-0.5">
                <p className={`text-xl font-semibold tabular-nums flex items-center gap-1.5 ${isUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                  {isUp ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                  {isUp ? '+' : ''}{fmt$(totalGain)}
                </p>
                <p className={`text-sm font-medium tabular-nums ${isUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                  {isUp ? '+' : ''}{totalReturnPct}%
                </p>
              </div>
              <div className="ml-auto text-right pb-0.5">
                <p className="text-xs text-slate-400">Invested</p>
                <p className="text-base font-semibold text-slate-600 dark:text-slate-400 tabular-nums">{fmt$(initialAmount)}</p>
              </div>
            </div>
          </div>

          {/* Breakdown table */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Holding Breakdown</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800">
                    {['Asset', 'Allocated', `Return (${period.label})`, 'Final Value', 'Gain / Loss'].map((col) => (
                      <th key={col} className="px-5 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-600 whitespace-nowrap">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                  {results.map((r, i) => {
                    const up = (r.gain ?? 0) >= 0;
                    return (
                      <tr key={r.symbol} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2.5">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                            <div>
                              <p className="font-semibold text-slate-800 dark:text-slate-100">{r.symbol}</p>
                              <p className="text-[10px] text-slate-400 tabular-nums">
                                {totalWeight > 0 ? ((r.weight / totalWeight) * 100).toFixed(1) : r.weight}%
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3 tabular-nums font-medium text-slate-700 dark:text-slate-300">
                          {fmt$(r.allocated)}
                        </td>
                        <td className={`px-5 py-3 tabular-nums font-semibold ${
                          r.noData ? 'text-slate-400' : up ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                        }`}>
                          {r.returnPct != null ? `${r.returnPct >= 0 ? '+' : ''}${r.returnPct}%` : 'No data'}
                        </td>
                        <td className="px-5 py-3 tabular-nums font-semibold text-slate-800 dark:text-slate-100">
                          {r.endValue != null ? fmt$(r.endValue) : fmt$(r.allocated)}
                        </td>
                        <td className={`px-5 py-3 tabular-nums font-medium ${
                          r.noData ? 'text-slate-400' : up ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                        }`}>
                          {r.gain != null ? `${r.gain >= 0 ? '+' : ''}${fmt$(r.gain)}` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40">
                    <td className="px-5 py-3 font-semibold text-slate-700 dark:text-slate-300">Total</td>
                    <td className="px-5 py-3 tabular-nums font-semibold text-slate-700 dark:text-slate-300">{fmt$(totalAllocated)}</td>
                    <td className={`px-5 py-3 tabular-nums font-bold ${isUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                      {isUp ? '+' : ''}{totalReturnPct}%
                    </td>
                    <td className={`px-5 py-3 tabular-nums font-bold ${isUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                      {fmt$(totalEnd)}
                    </td>
                    <td className={`px-5 py-3 tabular-nums font-bold ${isUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                      {isUp ? '+' : ''}{fmt$(totalGain)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <p className="text-[10px] text-slate-400 dark:text-slate-600">
            Past performance is not indicative of future results. Prices sourced from Yahoo Finance.
          </p>
        </>
      )}
    </div>
  );
}
