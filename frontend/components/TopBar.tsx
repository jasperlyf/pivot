'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, X, Plus, Search } from 'lucide-react';
import { useApp, DATE_PRESETS, DEFAULT_SYMBOLS } from '@/lib/context';

export default function TopBar() {
  const { symbols, setSymbols, dateRange, setDateRange, api } = useApp();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ symbol: string; name: string; type: string }[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSearch(false);
        setQuery('');
        setResults([]);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const t = setTimeout(() => {
      fetch(`${api}/market-data/search?q=${encodeURIComponent(query)}`)
        .then((r) => r.json())
        .then(setResults)
        .catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [query, api]);

  const addSymbol = (symbol: string) => {
    if (!symbols.includes(symbol)) setSymbols([...symbols, symbol]);
    setShowSearch(false);
    setQuery('');
    setResults([]);
  };

  const removeSymbol = (symbol: string) => {
    if (symbols.length > 1) setSymbols(symbols.filter((s) => s !== symbol));
  };

  return (
    <header className="bg-white border-b border-slate-200 shrink-0">
      {/* Row 1: tickers + search + upload */}
      <div className="flex items-center gap-3 px-6 h-12 border-b border-slate-100">
        <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
          {symbols.map((s) => (
            <span key={s} className="flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold px-2.5 py-1 rounded-full transition-colors">
              {s}
              <button onClick={() => removeSymbol(s)} className="text-slate-400 hover:text-slate-700 transition-colors ml-0.5">
                <X size={10} strokeWidth={2.5} />
              </button>
            </span>
          ))}

          {/* Add ticker */}
          <div ref={searchRef} className="relative">
            <button
              onClick={() => setShowSearch(true)}
              className="flex items-center gap-1 text-xs text-indigo-600 font-medium hover:bg-indigo-50 px-2.5 py-1 rounded-full transition-colors border border-dashed border-indigo-300"
            >
              <Plus size={11} strokeWidth={2.5} /> Add
            </button>

            {showSearch && (
              <div className="absolute top-8 left-0 z-50 w-72 bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-100">
                  <Search size={14} className="text-slate-400 shrink-0" />
                  <input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search ticker or company…"
                    className="flex-1 text-sm outline-none text-slate-900 placeholder:text-slate-400"
                  />
                </div>
                {results.length > 0 ? (
                  <ul>
                    {results.map((r, i) => (
                      <li key={`${r.symbol}-${i}`}>
                        <button
                          onClick={() => addSymbol(r.symbol)}
                          className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-slate-50 text-left transition-colors"
                        >
                          <div>
                            <span className="text-sm font-semibold text-slate-900">{r.symbol}</span>
                            <span className="text-xs text-slate-400 ml-2 truncate">{r.name}</span>
                          </div>
                          <span className="text-xs text-slate-300 ml-2">{r.type}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : query ? (
                  <p className="text-xs text-slate-400 px-3 py-3">No results</p>
                ) : (
                  <div className="px-3 py-2">
                    <p className="text-xs text-slate-400 mb-2">Popular</p>
                    <div className="flex flex-wrap gap-1.5">
                      {DEFAULT_SYMBOLS.filter((s) => !symbols.includes(s)).map((s) => (
                        <button key={s} onClick={() => addSymbol(s)}
                          className="text-xs bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-600 px-2 py-1 rounded-md font-medium transition-colors">
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

        <button
          onClick={() => router.push('/data-sources')}
          className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors shrink-0"
        >
          <Upload size={12} />
          Upload
        </button>
      </div>

      {/* Row 2: date range presets */}
      <div className="flex items-center gap-1 px-6 h-9">
        {DATE_PRESETS.map((preset) => {
          const active = preset.label === dateRange.label;
          return (
            <button
              key={preset.label}
              onClick={() => setDateRange(preset)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                active ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
              }`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
    </header>
  );
}
