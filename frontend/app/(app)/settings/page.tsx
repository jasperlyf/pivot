'use client';

import { useState, useRef, useEffect } from 'react';
import { Check, X, Plus, Search, Star, Sun, Moon } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useApp, DEFAULT_SYMBOLS, UserSettings } from '@/lib/context';

function Row({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between py-4 border-b border-slate-100 dark:border-slate-800 last:border-0 gap-4">
      <div className="shrink-0">
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{label}</p>
        {desc && <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{desc}</p>}
      </div>
      {children}
    </div>
  );
}

export default function SettingsPage() {
  const { symbols, setSymbols, settings, saveSettings, api } = useApp();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [saved, setSaved]     = useState(false);

  // Avoid hydration mismatch — theme is only known client-side
  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === 'dark';

  const handleTheme = (t: 'light' | 'dark') => {
    setTheme(t);                  // immediate UI switch
    saveSettings({ theme: t });   // persist to DB
  };

  const handleSave = (patch: Partial<UserSettings>) => {
    saveSettings(patch);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const [query, setQuery]         = useState('');
  const [results, setResults]     = useState<{ symbol: string; name: string; type: string }[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSearch(false); setQuery(''); setResults([]);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const t = setTimeout(() => {
      fetch(`${api}/market-data/search?q=${encodeURIComponent(query)}`)
        .then((r) => r.json()).then(setResults).catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [query, api]);

  const addSymbol = (symbol: string) => {
    if (!symbols.includes(symbol)) setSymbols([...symbols, symbol]);
    setShowSearch(false); setQuery(''); setResults([]);
  };

  const removeSymbol = (symbol: string) => {
    if (symbols.length > 1) setSymbols(symbols.filter((s) => s !== symbol));
  };

  const save = () => { setSaved(true); setTimeout(() => setSaved(false), 2000); };

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Settings</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Configure your dashboard preferences</p>
      </div>

      {/* Favourites */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none px-5">
        <Row
          label="Favourites"
          desc="Assets tracked on your dashboard price history chart"
        >
          <div className="flex flex-col items-end gap-2">
            <div className="flex flex-wrap justify-end gap-1.5">
              {symbols.map((s) => (
                <span key={s} className="flex items-center gap-1 bg-amber-50 dark:bg-amber-950 border border-amber-200 text-amber-700 text-xs font-semibold px-2.5 py-1 rounded-full">
                  <Star size={9} className="fill-amber-400 text-amber-400" />
                  {s}
                  <button onClick={() => removeSymbol(s)} className="text-amber-400 hover:text-amber-700 transition-colors ml-0.5">
                    <X size={10} strokeWidth={2.5} />
                  </button>
                </span>
              ))}
            </div>

            <div ref={searchRef} className="relative">
              <button
                onClick={() => setShowSearch(true)}
                className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 font-medium hover:bg-indigo-50 dark:hover:bg-indigo-950 px-2.5 py-1 rounded-full transition-colors border border-dashed border-indigo-300"
              >
                <Plus size={11} strokeWidth={2.5} /> Add favourite
              </button>

              {showSearch && (
                <div className="absolute top-8 right-0 z-50 w-72 bg-white dark:bg-slate-900 rounded-xl shadow-lg dark:shadow-none border border-slate-200 dark:border-slate-700 overflow-hidden">
                  <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-950 border-b border-slate-100 dark:border-slate-800 px-3 py-2.5 focus-within:border-indigo-300 transition-colors">
                    <Search size={13} className="text-slate-400 dark:text-slate-500 shrink-0" />
                    <input
                      autoFocus
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search ticker or company…"
                      className="flex-1 text-sm outline-none bg-transparent text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-600"
                    />
                  </div>
                  {results.length > 0 ? (
                    <ul>
                      {results.map((r, i) => (
                        <li key={`${r.symbol}-${i}`}>
                          <button
                            onClick={() => addSymbol(r.symbol)}
                            className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 text-left transition-colors"
                          >
                            <div>
                              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{r.symbol}</span>
                              <span className="text-xs text-slate-400 dark:text-slate-500 ml-2">{r.name}</span>
                            </div>
                            <span className="text-xs text-slate-300 dark:text-slate-600">{r.type}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : query ? (
                    <p className="text-xs text-slate-400 dark:text-slate-500 px-3 py-3">No results</p>
                  ) : (
                    <div className="px-3 py-3">
                      <p className="text-xs text-slate-400 dark:text-slate-500 mb-2">Suggestions</p>
                      <div className="flex flex-wrap gap-1.5">
                        {DEFAULT_SYMBOLS.filter((s) => !symbols.includes(s)).map((s) => (
                          <button key={s} onClick={() => addSymbol(s)}
                            className="text-xs bg-slate-100 dark:bg-slate-800 hover:bg-amber-50 dark:hover:bg-amber-950 hover:text-amber-700 text-slate-600 dark:text-slate-400 px-2 py-1 rounded-md font-medium transition-colors">
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
        </Row>
      </div>

      {/* Appearance */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none px-5">
        <Row label="Appearance" desc="Choose between light and dark theme">
          {mounted ? (
            <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden text-xs font-medium">
              <button
                onClick={() => handleTheme('light')}
                className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors ${
                  !isDark ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <Sun size={12} /> Light
              </button>
              <button
                onClick={() => handleTheme('dark')}
                className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors ${
                  isDark ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <Moon size={12} /> Dark
              </button>
            </div>
          ) : (
            <div className="h-7 w-28 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
          )}
        </Row>
      </div>

      {/* Other preferences */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none px-5">
        <Row label="Currency" desc="Display currency for price values">
          <select value={settings.currency} onChange={(e) => handleSave({ currency: e.target.value })}
            className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option>USD</option>
            <option>EUR</option>
            <option>GBP</option>
            <option>SGD</option>
          </select>
        </Row>
        <Row label="Default metric" desc="Starting aggregation for new charts">
          <select value={settings.metric} onChange={(e) => handleSave({ metric: e.target.value })}
            className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="avg">Average</option>
            <option value="sum">Sum</option>
            <option value="change">% Change</option>
          </select>
        </Row>
        <Row label="Default group by" desc="Starting time granularity">
          <select value={settings.groupBy} onChange={(e) => handleSave({ groupBy: e.target.value })}
            className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
          </select>
        </Row>
      </div>

      {saved && (
        <p className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400 font-medium">
          <Check size={14} /> Settings saved
        </p>
      )}
    </div>
  );
}
