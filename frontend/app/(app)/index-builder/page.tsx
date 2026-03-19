'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useApp } from '@/lib/context';
import { createClient } from '@/lib/supabase/browser';
import { PieChart as RechartsPie, Pie, Cell, Tooltip } from 'recharts';
import { Plus, X, Search, RotateCcw } from 'lucide-react';

// ── Constants ──────────────────────────────────────────────────────────────────
const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#f97316', '#84cc16'];
const PRESETS = [
  { label: 'Tech Growth',   holdings: [{ symbol: 'QQQ', weight: 40 }, { symbol: 'NVDA', weight: 35 }, { symbol: 'AAPL', weight: 25 }] },
  { label: 'Global Market', holdings: [{ symbol: 'SPY', weight: 50 }, { symbol: 'ACWI', weight: 30 }, { symbol: 'EEM', weight: 20 }] },
  { label: 'Crypto Mix',    holdings: [{ symbol: 'BTC-USD', weight: 60 }, { symbol: 'ETH-USD', weight: 40 }] },
];

// ── Types ──────────────────────────────────────────────────────────────────────
interface Holding { symbol: string; weight: number; }
interface QuoteData {
  symbol: string; name: string; price: number | null; change: number | null;
  changePct: number | null; marketCap: number | null; volume: number | null; currency: string;
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
                    disabled={existing.includes(r.symbol)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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

// ── Main page ──────────────────────────────────────────────────────────────────
function IndexBuilderInner() {
  const { api, user } = useApp();
  const supabase = createClient();
  const searchParams = useSearchParams();
  const requestedId = searchParams.get('id');

  const [currentId, setCurrentId] = useState<string | null>(null);
  const [indexName, setIndexName] = useState('');
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [saveError, setSaveError] = useState('');

  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [quotes, setQuotes]     = useState<Record<string, QuoteData>>({});

  // Load a specific index if navigated from library with ?id=
  useEffect(() => {
    if (!user || !requestedId) return;
    supabase
      .from('custom_indexes')
      .select('id, name, index_holdings(asset_symbol, weight)')
      .eq('id', requestedId)
      .single()
      .then(({ data }) => {
        if (data) {
          setCurrentId(data.id);
          setIndexName(data.name);
          setHoldings((data.index_holdings as any[]).map((h: any) => ({ symbol: h.asset_symbol, weight: h.weight })));
        }
      });
  }, [user, requestedId]); // eslint-disable-line

  // Fetch quotes for all holdings
  const symKey = holdings.map((h) => h.symbol).sort().join(',');
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

  // Smart weight helpers
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
        const drift = remainder - adjusted.reduce((s, h) => s + h.weight, 0);
        if (adjusted.length > 0) adjusted[0] = { ...adjusted[0], weight: adjusted[0].weight + drift };
      }
      return prev.map((h) => h.symbol === symbol ? { ...h, weight: clamped } : adjusted.find((a) => a.symbol === h.symbol)!);
    });
  };

  const applyPreset = (preset: typeof PRESETS[0]) => setHoldings(preset.holdings);
  const newIndex    = () => { setCurrentId(null); setIndexName(''); setHoldings([]); };

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
    await supabase.from('index_holdings').delete().eq('index_id', indexId);
    if (holdings.length) {
      await supabase.from('index_holdings').insert(
        holdings.map((h) => ({ index_id: indexId!, asset_symbol: h.symbol, weight: h.weight }))
      );
    }
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  // Derived
  const totalWeight = holdings.reduce((a, h) => a + h.weight, 0);
  const weightOk    = totalWeight === 100;

  const weightedDayChange = (() => {
    if (!weightOk || !holdings.length) return null;
    let sum = 0, covered = 0;
    for (const h of holdings) {
      const q = quotes[h.symbol];
      if (q?.changePct != null) { sum += (h.weight / 100) * q.changePct; covered += h.weight; }
    }
    return covered > 0 ? sum : null;
  })();

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
      <div>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Index Builder</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Build and save custom weighted indexes</p>
      </div>

      {/* Presets */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Quick start:</span>
        {PRESETS.map((p) => (
          <button key={p.label} onClick={() => applyPreset(p)}
            className="px-3 py-1.5 rounded-full text-xs font-medium bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-indigo-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

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
                <div key={h.symbol} className="space-y-1.5">
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
                      onChange={(e) => setWeight(h.symbol, Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))}
                      className="w-14 text-right text-sm font-medium bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-slate-800 dark:text-slate-200 outline-none focus:border-indigo-400 tabular-nums"
                    />
                    <span className="text-xs text-slate-400">%</span>
                    <button onClick={() => removeHolding(h.symbol)} className="text-slate-300 dark:text-slate-600 hover:text-rose-400 transition-colors">
                      <X size={13} />
                    </button>
                  </div>
                  <input
                    type="range" min={0} max={100} value={h.weight}
                    onChange={(e) => setWeight(h.symbol, parseInt(e.target.value))}
                    className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                    style={{ accentColor: COLORS[i % COLORS.length] }}
                  />
                </div>
              );
            })}
          </div>

          {holdings.length < 10 && <AssetSearch onAdd={addHolding} api={api} existing={holdings.map((h) => h.symbol)} />}

          <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800">
            <button onClick={() => setHoldings([])} className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500 hover:text-rose-500 transition-colors">
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

      </div>

      {/* Holdings summary table */}
      {holdings.length > 0 && Object.keys(quotes).length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Holdings Summary</h2>
            {weightedDayChange != null && (
              <span className={`text-sm font-bold tabular-nums ${weightedDayChange >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                Index today: {weightedDayChange >= 0 ? '+' : ''}{weightedDayChange.toFixed(2)}%
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
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Build your index above</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Add assets and set weights to 100% to see your index composition</p>
          </div>
        </div>
      )}

    </div>
  );
}

export default function IndexBuilderPage() {
  return <Suspense><IndexBuilderInner /></Suspense>;
}
