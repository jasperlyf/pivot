'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Star, Plus, X, GripVertical, Search, Loader2, FolderOpen, Pencil, Trash2, Check } from 'lucide-react';
import { createClient } from '@/lib/supabase/browser';
import { useApp } from '@/lib/context';

interface Watchlist     { id: string; name: string; is_favourite: boolean; position: number; }
interface WatchlistItem { id: string; symbol: string; position: number; }
interface Quote {
  symbol: string; name: string;
  price: number | null; change: number | null; changePct: number | null;
  volume: number | null; marketCap: number | null;
  week52High: number | null; week52Low: number | null;
}

function fmtPrice(v: number | null) {
  if (v == null) return '—';
  return v >= 1000
    ? `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
    : `$${v.toFixed(2)}`;
}
function fmtChange(v: number | null) {
  if (v == null) return '—';
  const sign = v >= 0 ? '+' : '';
  return `${sign}$${Math.abs(v).toFixed(2)}`;
}


export default function WatchlistPage() {
  const { user, api } = useApp();
  const supabase = createClient();

  const [lists,         setLists]         = useState<Watchlist[]>([]);
  const [selectedId,    setSelectedId]    = useState<string | null>(null);
  const [items,         setItems]         = useState<WatchlistItem[]>([]);
  const [quotes,        setQuotes]        = useState<Record<string, Quote>>({});
  const [quotesLoading, setQuotesLoading] = useState(false);
  const [loading,       setLoading]       = useState(true);

  // Add symbol search
  const [addingSymbol,  setAddingSymbol]  = useState(false);
  const [searchQ,       setSearchQ]       = useState('');
  const [searchResults, setSearchResults] = useState<{ symbol: string; name: string }[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Rename / create
  const [renamingId,   setRenamingId]   = useState<string | null>(null);
  const [renameDraft,  setRenameDraft]  = useState('');
  const [creatingList, setCreatingList] = useState(false);
  const [newListName,  setNewListName]  = useState('');

  // List context menu
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  // Drag-and-drop
  const dragItem = useRef<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const creatingDefault = useRef(false);

  // ── Load watchlists ──────────────────────────────────────────────────────
  const loadLists = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('watchlists')
      .select('*')
      .eq('user_id', user.id)
      .order('position');

    if (data !== null) {
      if (data.length === 0) {
        if (creatingDefault.current) { setLoading(false); return; }
        creatingDefault.current = true;
        const { data: fav } = await supabase
          .from('watchlists')
          .insert({ user_id: user.id, name: 'Favourites', is_favourite: true, position: 0 })
          .select()
          .single();
        if (fav) {
          const defaultSymbols = ['^IXIC', '^N225', '^GSPC', 'QQQ', 'SPY', 'BTC-USD', 'GLD'];
          await supabase.from('watchlist_items').insert(
            defaultSymbols.map((symbol, position) => ({ watchlist_id: fav.id, symbol, position }))
          );
          setLists([fav]);
          setSelectedId(fav.id);
        }
      } else {
        setLists(data);
        setSelectedId(prev => (data.find(l => l.id === prev) ? prev : data[0].id));
      }
    }
    setLoading(false);
  }, [user]); // eslint-disable-line

  useEffect(() => { loadLists(); }, [loadLists]);

  // ── Load items ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedId) { setItems([]); return; }
    supabase
      .from('watchlist_items')
      .select('id, symbol, position')
      .eq('watchlist_id', selectedId)
      .order('position')
      .then(({ data }) => setItems(data ?? []));
  }, [selectedId]); // eslint-disable-line

  // ── Live quotes ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (items.length === 0) { setQuotes({}); return; }
    setQuotesLoading(true);
    fetch(`${api}/market-data/quotes?symbols=${items.map(i => i.symbol).join(',')}`)
      .then(r => r.json())
      .then((data: Quote[]) => {
        const map: Record<string, Quote> = {};
        (data ?? []).forEach(q => { map[q.symbol] = q; });
        setQuotes(map);
        setQuotesLoading(false);
      })
      .catch(() => setQuotesLoading(false));
  }, [items, api]);


  // ── Symbol search ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!searchQ.trim()) { setSearchResults([]); return; }
    const t = setTimeout(() => {
      setSearchLoading(true);
      fetch(`${api}/market-data/search?q=${encodeURIComponent(searchQ)}`)
        .then(r => r.json())
        .then(d => { setSearchResults((d ?? []).slice(0, 6)); setSearchLoading(false); })
        .catch(() => setSearchLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [searchQ, api]);

  // ── Close search on outside click ────────────────────────────────────────
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setAddingSymbol(false); setSearchQ(''); setSearchResults([]);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── CRUD ─────────────────────────────────────────────────────────────────
  async function addSymbol(symbol: string) {
    if (!selectedId || items.some(i => i.symbol === symbol)) return;
    const { data } = await supabase
      .from('watchlist_items')
      .insert({ watchlist_id: selectedId, symbol, position: items.length })
      .select().single();
    if (data) {
      setItems(prev => [...prev, data]);
      // Fetch quote for the new symbol immediately
      fetch(`${api}/market-data/quotes?symbols=${symbol}`)
        .then(r => r.json())
        .then((d: Quote[]) => {
          if (d[0]) setQuotes(prev => ({ ...prev, [symbol]: d[0] }));
        })
        .catch(() => {});
    }
  }

  async function removeItem(itemId: string) {
    await supabase.from('watchlist_items').delete().eq('id', itemId);
    setItems(prev => prev.filter(i => i.id !== itemId));
  }

  async function createList() {
    const name = newListName.trim();
    if (!name || !user) return;
    if (lists.some(l => l.name.toLowerCase() === name.toLowerCase())) {
      alert(`A watchlist named "${name}" already exists.`);
      return;
    }
    const { data } = await supabase
      .from('watchlists')
      .insert({ user_id: user.id, name, is_favourite: false, position: lists.length })
      .select().single();
    if (data) { setLists(prev => [...prev, data]); setSelectedId(data.id); }
    setNewListName(''); setCreatingList(false);
  }

  async function deleteList(id: string) {
    const list = lists.find(l => l.id === id);
    if (!list || list.is_favourite) return;
    await supabase.from('watchlists').delete().eq('id', id);
    setLists(prev => {
      const next = prev.filter(l => l.id !== id);
      if (selectedId === id) setSelectedId(next[0]?.id ?? null);
      return next;
    });
    setMenuOpenId(null);
  }

  async function renameList(id: string) {
    const name = renameDraft.trim();
    if (!name) { setRenamingId(null); return; }
    if (lists.some(l => l.id !== id && l.name.toLowerCase() === name.toLowerCase())) {
      alert(`A watchlist named "${name}" already exists.`);
      return;
    }
    await supabase.from('watchlists').update({ name }).eq('id', id);
    setLists(prev => prev.map(l => l.id === id ? { ...l, name } : l));
    setRenamingId(null);
  }

  // ── Drag-and-drop ─────────────────────────────────────────────────────────
  function onDragStart(symbol: string) { dragItem.current = symbol; }
  function onDragOver(e: React.DragEvent, symbol: string) { e.preventDefault(); setDragOver(symbol); }

  async function onDrop(targetSymbol: string) {
    const from = dragItem.current;
    dragItem.current = null; setDragOver(null);
    if (!from || from === targetSymbol) return;
    const fi = items.findIndex(i => i.symbol === from);
    const ti = items.findIndex(i => i.symbol === targetSymbol);
    if (fi === -1 || ti === -1) return;
    const next = [...items];
    const [moved] = next.splice(fi, 1);
    next.splice(ti, 0, moved);
    const updated = next.map((item, idx) => ({ ...item, position: idx }));
    setItems(updated);
    await Promise.all(updated.map(item =>
      supabase.from('watchlist_items').update({ position: item.position }).eq('id', item.id)
    ));
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        <div className="h-7 w-32 bg-slate-200 dark:bg-slate-700 rounded" />
        <div className="h-[540px] bg-slate-100 dark:bg-slate-800 rounded-xl" />
      </div>
    );
  }

  const selectedList = lists.find(l => l.id === selectedId);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Watchlist</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Track and organise the assets you follow</p>
      </div>

      <div
        className="flex flex-col border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900"
        style={{ minHeight: 520 }}
      >
        {/* ── Tab bar ──────────────────────────────────────────────────────── */}
        <div className="flex items-stretch border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950">

          {/* Scrollable tabs */}
          <div className="flex items-stretch overflow-x-auto flex-1 min-w-0" style={{ scrollbarWidth: 'none' }}>
            {lists.map(list => {
              const isActive = list.id === selectedId;
              return (
                <div key={list.id} className="relative flex items-stretch shrink-0">
                  {renamingId === list.id ? (
                    /* ── Inline rename input ── */
                    <div className="flex items-center gap-1.5 px-3 py-2.5">
                      <input
                        autoFocus
                        value={renameDraft}
                        onChange={e => setRenameDraft(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') renameList(list.id);
                          if (e.key === 'Escape') setRenamingId(null);
                        }}
                        onBlur={() => renameList(list.id)}
                        className="w-28 text-sm px-2 py-0.5 bg-white dark:bg-slate-800 border border-indigo-400 dark:border-indigo-500 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500/30 text-slate-800 dark:text-slate-100"
                      />
                      <button
                        onMouseDown={e => { e.preventDefault(); renameList(list.id); }}
                        className="p-1 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950 rounded"
                      >
                        <Check size={13} />
                      </button>
                    </div>
                  ) : (
                    /* ── Tab button ── */
                    <div
                      className={`group/tab relative flex items-center gap-1.5 pl-4 pr-3 py-3 text-sm whitespace-nowrap cursor-pointer select-none transition-colors ${
                        isActive
                          ? 'text-slate-800 dark:text-slate-100 font-medium bg-white dark:bg-slate-900'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-white/60 dark:hover:bg-slate-900/40'
                      }`}
                      onClick={() => setSelectedId(list.id)}
                    >
                      {list.is_favourite
                        ? <Star size={12} className="shrink-0 fill-amber-400 text-amber-400" />
                        : <FolderOpen size={12} className="shrink-0 opacity-40" />
                      }
                      <span>{list.name}</span>
                      {isActive && items.length > 0 && (
                        <span className="text-[10px] text-slate-400 dark:text-slate-600 font-normal tabular-nums">{items.length}</span>
                      )}

                      {/* Inline rename + delete — only for non-favourite active tab, visible on hover */}
                      {!list.is_favourite && isActive && (
                        <span className="flex items-center gap-0.5 opacity-0 group-hover/tab:opacity-100 transition-opacity ml-0.5">
                          <span
                            role="button"
                            onClick={e => { e.stopPropagation(); setRenameDraft(list.name); setRenamingId(list.id); }}
                            className="p-1 rounded text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition-colors"
                            title="Rename"
                          >
                            <Pencil size={11} />
                          </span>
                          <span
                            role="button"
                            onClick={e => { e.stopPropagation(); deleteList(list.id); }}
                            className="p-1 rounded text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                            title="Delete list"
                          >
                            <Trash2 size={11} />
                          </span>
                        </span>
                      )}

                      {/* Active underline */}
                      {isActive && (
                        <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 dark:bg-indigo-500" />
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* New list */}
            {creatingList ? (
              <div className="flex items-center gap-1.5 px-3 shrink-0">
                <input
                  autoFocus
                  value={newListName}
                  onChange={e => setNewListName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') createList();
                    if (e.key === 'Escape') { setCreatingList(false); setNewListName(''); }
                  }}
                  placeholder="List name…"
                  className="w-28 px-2 py-1 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/30 text-slate-800 dark:text-slate-100 placeholder-slate-400"
                />
                <button
                  onClick={createList}
                  disabled={!newListName.trim()}
                  className="px-2.5 py-1 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-md transition-colors"
                >
                  Create
                </button>
                <button
                  onClick={() => { setCreatingList(false); setNewListName(''); }}
                  className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded"
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setCreatingList(true)}
                className="flex items-center gap-1 px-3 text-xs text-slate-400 dark:text-slate-600 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors shrink-0"
              >
                <Plus size={12} /> New
              </button>
            )}
          </div>

          {/* ── Add Symbol — outside scroll so dropdown isn't clipped ── */}
          <div ref={searchRef} className="relative shrink-0 flex items-center px-3">
            {addingSymbol ? (
              <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg px-2.5 py-1.5 w-80 shadow-sm ring-2 ring-indigo-500/20">
                <Search size={13} className="text-slate-400 shrink-0" />
                <input
                  autoFocus
                  value={searchQ}
                  onChange={e => setSearchQ(e.target.value)}
                  placeholder="Symbol or name…"
                  className="flex-1 text-sm bg-transparent focus:outline-none text-slate-800 dark:text-slate-100 placeholder-slate-400 min-w-0"
                />
                {searchLoading
                  ? <Loader2 size={13} className="text-slate-400 animate-spin shrink-0" />
                  : <button onClick={() => { setAddingSymbol(false); setSearchQ(''); setSearchResults([]); }} className="shrink-0">
                      <X size={13} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300" />
                    </button>
                }
              </div>
            ) : (
              <button
                onClick={() => setAddingSymbol(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
              >
                <Plus size={13} strokeWidth={2.5} /> Add Symbol
              </button>
            )}

            {/* Search results dropdown */}
            {searchResults.length > 0 && (
              <div className="absolute right-0 top-full mt-1.5 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-40 overflow-hidden">
                {searchResults.map((r, i) => {
                  const alreadyAdded = items.some(item => item.symbol === r.symbol);
                  return (
                    <button
                      key={`${r.symbol}-${i}`}
                      disabled={alreadyAdded}
                      onClick={() => {
                        if (!alreadyAdded) {
                          addSymbol(r.symbol);
                          setAddingSymbol(false);
                          setSearchQ('');
                          setSearchResults([]);
                        }
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                        alreadyAdded
                          ? 'opacity-40 cursor-not-allowed'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 w-14 shrink-0">{r.symbol}</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400 truncate flex-1">{r.name}</span>
                      {alreadyAdded && <span className="text-[10px] text-slate-400 shrink-0">Added</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Column headers ────────────────────────────────────────────────── */}
        {items.length > 0 && (
          <div className="grid grid-cols-[1.5rem_1fr_1fr_1fr_1fr_1.5rem] items-center px-4 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30 shrink-0">
            <div />
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Symbol</div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 text-right">Price</div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 text-right">Change</div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 text-right">Chg %</div>
            <div />
          </div>
        )}

        {/* ── Rows ─────────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-slate-400 dark:text-slate-600 gap-2">
              <Star size={32} strokeWidth={1.25} className="opacity-20" />
              <p className="text-sm">No symbols yet — click Add Symbol above.</p>
            </div>
          ) : (
            items.map(item => {
              const q = quotes[item.symbol];
              const up = q?.changePct != null && q.changePct >= 0;
              const isDragTarget = dragOver === item.symbol;

              return (
                <div
                  key={item.id}
                  draggable
                  onDragStart={() => onDragStart(item.symbol)}
                  onDragOver={e => onDragOver(e, item.symbol)}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={() => onDrop(item.symbol)}
                  className={`group grid grid-cols-[1.5rem_1fr_1fr_1fr_1fr_1.5rem] items-center px-4 py-3 border-b border-slate-50 dark:border-slate-800/60 last:border-0 transition-colors ${
                    isDragTarget ? 'bg-indigo-50 dark:bg-indigo-950/20' : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/30'
                  }`}
                >
                  <GripVertical
                    size={13}
                    className="text-slate-300 dark:text-slate-700 cursor-grab opacity-0 group-hover:opacity-100 transition-opacity"
                  />

                  {/* Symbol + name */}
                  <div className="min-w-0 pr-3">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate leading-none">{item.symbol}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 truncate mt-0.5 leading-none">
                      {q?.name ?? (quotesLoading ? '' : '—')}
                    </p>
                  </div>

                  {/* Price */}
                  <div className="text-sm font-medium tabular-nums text-right text-slate-800 dark:text-slate-100">
                    {quotesLoading && !q
                      ? <span className="text-slate-300 dark:text-slate-700 text-xs">···</span>
                      : fmtPrice(q?.price ?? null)}
                  </div>

                  {/* Change $ */}
                  <div className={`text-sm font-medium tabular-nums text-right ${
                    q?.change == null ? 'text-slate-300 dark:text-slate-600' : up
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}>
                    {q?.change != null ? fmtChange(q.change) : '—'}
                  </div>

                  {/* Change % */}
                  <div className={`text-sm font-medium tabular-nums text-right ${
                    q?.changePct == null ? 'text-slate-300 dark:text-slate-600' : up
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}>
                    {q?.changePct != null
                      ? `${up ? '+' : ''}${q.changePct.toFixed(2)}%`
                      : '—'}
                  </div>

                  {/* Remove */}
                  <button
                    onClick={() => removeItem(item.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-300 dark:text-slate-600 hover:text-rose-500 dark:hover:text-rose-400 p-0.5 rounded"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
