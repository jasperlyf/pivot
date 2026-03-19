'use client';

import { useEffect, useState, useRef } from 'react';
import { useApp } from '@/lib/context';
import { createClient } from '@/lib/supabase/browser';
import {
  Upload, Trash2, RefreshCcw, Search, ChevronDown, ChevronRight,
  Plus, CheckCircle2, AlertCircle, ArrowUpRight, ArrowDownRight,
} from 'lucide-react';

interface RebalanceSummary {
  id: string;
  title: string;
  announcement_date: string | null;
  effective_date: string | null;
  created_at: string;
}
interface Entry { country: string; security_name: string; action: 'added' | 'deleted'; }
interface RebalanceDetail extends RebalanceSummary { entries: Entry[]; }
interface ParsedResult {
  title: string;
  announcementDate: string | null;
  effectiveDate: string | null;
  summary: Record<string, { added: number; deleted: number }>;
  entries: Entry[];
}

async function getToken(sb: ReturnType<typeof createClient>) {
  const { data } = await sb.auth.getSession();
  return data.session?.access_token ?? null;
}
function fmtDate(s: string | null) {
  if (!s) return '—';
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function MsciRebalancePage() {
  const { api } = useApp();
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [savedList, setSavedList]         = useState<RebalanceSummary[]>([]);
  const [currentId, setCurrentId]         = useState<string | null>(null);
  const [detail, setDetail]               = useState<RebalanceDetail | null>(null);
  const [parsed, setParsed]               = useState<ParsedResult | null>(null);
  const [saveName, setSaveName]           = useState('');
  const [uploading, setUploading]         = useState(false);
  const [saving, setSaving]               = useState(false);
  const [status, setStatus]               = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const [deletingId, setDeletingId]       = useState<string | null>(null);
  const [activeTab, setActiveTab]         = useState<'summary' | 'byindex' | 'compare'>('summary');
  const [searchQ, setSearchQ]             = useState('');
  const [expanded, setExpanded]           = useState<Record<string, boolean>>({});
  const [compareId, setCompareId]         = useState<string | null>(null);
  const [compareDetail, setCompareDetail] = useState<RebalanceDetail | null>(null);

  async function loadList() {
    const token = await getToken(supabase);
    if (!token) return;
    const r = await fetch(`${api}/msci/rebalances`, { headers: { Authorization: `Bearer ${token}` } });
    if (r.ok) setSavedList(await r.json());
  }
  useEffect(() => { loadList(); }, []); // eslint-disable-line

  async function loadDetail(id: string) {
    const token = await getToken(supabase);
    if (!token) return;
    const r = await fetch(`${api}/msci/rebalances/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    if (r.ok) {
      setDetail(await r.json());
      setCurrentId(id);
      setParsed(null);
      setSearchQ('');
      setExpanded({});
      setActiveTab('summary');
      setCompareId(null);
      setCompareDetail(null);
    }
  }

  useEffect(() => {
    if (!compareId) { setCompareDetail(null); return; }
    (async () => {
      const token = await getToken(supabase);
      if (!token) return;
      const r = await fetch(`${api}/msci/rebalances/${compareId}`, { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) setCompareDetail(await r.json());
    })();
  }, [compareId]); // eslint-disable-line

  async function parsePdf(file: File) {
    setUploading(true); setStatus(null); setParsed(null);
    const form = new FormData();
    form.append('file', file);
    try {
      const r = await fetch(`${api}/msci/parse`, { method: 'POST', body: form });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setParsed(data);
      setSaveName(data.title || 'MSCI Rebalance');
      setCurrentId(null); setDetail(null);
    } catch (e: any) {
      setStatus({ type: 'err', msg: e.message });
    } finally { setUploading(false); }
  }

  async function saveRebalance() {
    if (!parsed) return;
    setSaving(true);
    const token = await getToken(supabase);
    try {
      const r = await fetch(`${api}/msci/rebalances`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: saveName.trim() || parsed.title,
          announcementDate: parsed.announcementDate,
          effectiveDate: parsed.effectiveDate,
          entries: parsed.entries,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setStatus({ type: 'ok', msg: 'Saved successfully' });
      await loadList();
      await loadDetail(data.id);
    } catch (e: any) {
      setStatus({ type: 'err', msg: e.message });
    } finally { setSaving(false); }
  }

  async function deleteRebalance(id: string) {
    if (!confirm('Delete this rebalance? This cannot be undone.')) return;
    setDeletingId(id);
    const token = await getToken(supabase);
    await fetch(`${api}/msci/rebalances/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    if (currentId === id) { setCurrentId(null); setDetail(null); }
    await loadList();
    setDeletingId(null);
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const entries = detail?.entries ?? [];
  const countries = [...new Set(entries.map((e) => e.country))].sort();
  const totalAdded   = entries.filter((e) => e.action === 'added').length;
  const totalDeleted = entries.filter((e) => e.action === 'deleted').length;

  const countryStats = countries.map((c) => {
    const added   = entries.filter((e) => e.country === c && e.action === 'added').length;
    const deleted = entries.filter((e) => e.country === c && e.action === 'deleted').length;
    return { country: c, added, deleted, net: added - deleted };
  }).sort((a, b) => (b.added + b.deleted) - (a.added + a.deleted));

  const maxTotal = Math.max(...countryStats.map((c) => c.added + c.deleted), 1);

  const filteredEntries = searchQ.trim()
    ? entries.filter((e) =>
        e.security_name.toLowerCase().includes(searchQ.toLowerCase()) ||
        e.country.toLowerCase().includes(searchQ.toLowerCase()))
    : entries;

  const parsedCountries = parsed
    ? Object.entries(parsed.summary)
        .map(([c, v]) => ({ country: c, ...v, net: v.added - v.deleted }))
        .sort((a, b) => (b.added + b.deleted) - (a.added + a.deleted))
    : [];

  const compareEntries = compareDetail?.entries ?? [];
  const bothAdded  = entries.filter((e) => e.action === 'added'   && compareEntries.some((c) => c.action === 'added'   && c.security_name === e.security_name));
  const bothDel    = entries.filter((e) => e.action === 'deleted' && compareEntries.some((c) => c.action === 'deleted' && c.security_name === e.security_name));
  const reversed   = entries.filter((e) => e.action === 'added'   && compareEntries.some((c) => c.action === 'deleted' && c.security_name === e.security_name));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100">MSCI Rebalance Analyzer</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Upload MSCI rebalance PDFs — extract additions &amp; deletions, compare across periods
        </p>
      </div>

      <div className="flex gap-5 items-start">

        {/* ── Saved list ── */}
        <div className="w-56 shrink-0 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <RefreshCcw size={13} className="text-sky-500 shrink-0" />
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">My Rebalances</span>
            </div>
            {savedList.length > 0 && <span className="text-[10px] text-slate-400 tabular-nums">{savedList.length}</span>}
          </div>

          {savedList.length === 0 ? (
            <div className="px-4 py-8 flex flex-col items-center gap-2 text-center">
              <div className="w-8 h-8 rounded-lg bg-slate-50 dark:bg-slate-800 flex items-center justify-center">
                <RefreshCcw size={14} className="text-slate-300 dark:text-slate-600" />
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-600">No rebalances yet</p>
            </div>
          ) : (
            <ul>
              {savedList.map((rb) => (
                <li key={rb.id}
                  onClick={() => loadDetail(rb.id)}
                  className={`group flex items-center gap-2 px-3 py-2.5 cursor-pointer transition-colors border-b border-slate-50 dark:border-slate-800 last:border-0 ${
                    currentId === rb.id ? 'bg-sky-50 dark:bg-sky-950/50' : 'hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${currentId === rb.id ? 'bg-sky-500' : 'bg-slate-200 dark:bg-slate-700'}`} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-semibold truncate ${currentId === rb.id ? 'text-sky-700 dark:text-sky-300' : 'text-slate-700 dark:text-slate-200'}`}>
                      {rb.title}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{fmtDate(rb.effective_date || rb.created_at)}</p>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); deleteRebalance(rb.id); }} disabled={deletingId === rb.id}
                    className="shrink-0 p-1 rounded text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all disabled:opacity-50">
                    <Trash2 size={11} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="px-3 py-2.5 border-t border-slate-100 dark:border-slate-800">
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950 transition-colors disabled:opacity-50">
              {uploading
                ? <div className="w-3 h-3 rounded-full border-2 border-sky-500 border-t-transparent animate-spin" />
                : <Plus size={12} />}
              {uploading ? 'Parsing…' : 'Upload PDF'}
            </button>
            <input ref={fileRef} type="file" accept=".pdf" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) parsePdf(f); e.target.value = ''; }} />
          </div>
        </div>

        {/* ── Main ── */}
        <div className="flex-1 min-w-0 space-y-5">

          {status && (
            <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm ${
              status.type === 'ok'
                ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400'
                : 'bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-400'
            }`}>
              {status.type === 'ok' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
              {status.msg}
            </div>
          )}

          {/* Empty state */}
          {!parsed && !detail && (
            <div onClick={() => fileRef.current?.click()}
              className="bg-white dark:bg-slate-900 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 hover:border-sky-300 dark:hover:border-sky-700 p-16 flex flex-col items-center gap-4 text-center cursor-pointer transition-colors group">
              <div className="w-14 h-14 rounded-xl bg-sky-50 dark:bg-sky-950 flex items-center justify-center group-hover:bg-sky-100 dark:group-hover:bg-sky-900 transition-colors">
                <Upload size={24} className="text-sky-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Upload an MSCI Rebalance PDF</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                  Official MSCI rebalance announcement — additions and deletions extracted automatically
                </p>
              </div>
            </div>
          )}

          {/* ── Parsed preview (before save) ── */}
          {parsed && !detail && (
            <div className="space-y-4">
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-5">
                <p className="text-xs font-semibold text-sky-600 dark:text-sky-400 uppercase tracking-wider mb-2">Preview — not yet saved</p>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{parsed.title}</h2>
                    <div className="flex gap-4 mt-1 flex-wrap text-xs text-slate-500 dark:text-slate-400">
                      {parsed.announcementDate && <span>Announced: <strong className="text-slate-700 dark:text-slate-200">{parsed.announcementDate}</strong></span>}
                      {parsed.effectiveDate    && <span>Effective: <strong className="text-slate-700 dark:text-slate-200">{parsed.effectiveDate}</strong></span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="Name…"
                      className="text-sm px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-400 w-52" />
                    <button onClick={saveRebalance} disabled={saving}
                      className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4 mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 text-center">
                  <div>
                    <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{parsed.entries.filter(e => e.action === 'added').length}</p>
                    <p className="text-xs text-slate-400 mt-0.5">Added</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-rose-600 dark:text-rose-400 tabular-nums">{parsed.entries.filter(e => e.action === 'deleted').length}</p>
                    <p className="text-xs text-slate-400 mt-0.5">Deleted</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-slate-700 dark:text-slate-200 tabular-nums">{Object.keys(parsed.summary).length}</p>
                    <p className="text-xs text-slate-400 mt-0.5">Countries</p>
                  </div>
                </div>
              </div>

              {/* Country preview table */}
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Country Summary</h3>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800">
                      {['Country', 'Added', 'Deleted', 'Net'].map((h) => (
                        <th key={h} className="px-5 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsedCountries.map(({ country, added, deleted, net }) => (
                      <tr key={country} className="border-b border-slate-50 dark:border-slate-800 last:border-0">
                        <td className="px-5 py-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200">{country}</td>
                        <td className="px-5 py-2.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 tabular-nums">+{added}</td>
                        <td className="px-5 py-2.5 text-xs font-medium text-rose-600 dark:text-rose-400 tabular-nums">−{deleted}</td>
                        <td className="px-5 py-2.5">
                          <span className={`text-xs font-bold tabular-nums ${net > 0 ? 'text-emerald-600 dark:text-emerald-400' : net < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400'}`}>
                            {net > 0 ? '+' : ''}{net}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Loaded rebalance ── */}
          {detail && (
            <div className="space-y-5">

              {/* Header */}
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{detail.title}</h2>
                    <div className="flex gap-4 mt-1 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
                      <span>Announced: <strong className="text-slate-700 dark:text-slate-200">{fmtDate(detail.announcement_date)}</strong></span>
                      <span>Effective: <strong className="text-slate-700 dark:text-slate-200">{fmtDate(detail.effective_date)}</strong></span>
                    </div>
                  </div>
                  <div className="flex gap-6 text-center">
                    <div>
                      <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{totalAdded}</p>
                      <p className="text-xs text-slate-400 mt-0.5">Added</p>
                    </div>
                    <div>
                      <p className="text-xl font-bold text-rose-600 dark:text-rose-400 tabular-nums">{totalDeleted}</p>
                      <p className="text-xs text-slate-400 mt-0.5">Deleted</p>
                    </div>
                    <div>
                      <p className={`text-xl font-bold tabular-nums ${totalAdded - totalDeleted >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {totalAdded - totalDeleted > 0 ? '+' : ''}{totalAdded - totalDeleted}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">Net</p>
                    </div>
                    <div>
                      <p className="text-xl font-bold text-slate-700 dark:text-slate-200 tabular-nums">{countries.length}</p>
                      <p className="text-xs text-slate-400 mt-0.5">Countries</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-700">
                {(['summary', 'byindex', 'compare'] as const).map((tab) => (
                  <button key={tab} onClick={() => setActiveTab(tab)}
                    className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                      activeTab === tab
                        ? 'border-sky-500 text-sky-600 dark:text-sky-400'
                        : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                    }`}>
                    {tab === 'summary' ? 'Summary' : tab === 'byindex' ? 'By Index' : 'Compare'}
                  </button>
                ))}
              </div>

              {/* Summary tab */}
              {activeTab === 'summary' && (
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-slate-800">
                        <th className="px-5 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Country</th>
                        <th className="px-5 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Added</th>
                        <th className="px-5 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Deleted</th>
                        <th className="px-5 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Net</th>
                        <th className="px-5 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider w-36">Activity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {countryStats.map(({ country, added, deleted, net }) => {
                        const addPct = Math.round((added / maxTotal) * 100);
                        const delPct = Math.round((deleted / maxTotal) * 100);
                        return (
                          <tr key={country}
                            className="border-b border-slate-50 dark:border-slate-800 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                            onClick={() => { setActiveTab('byindex'); setExpanded({ [country]: true }); }}>
                            <td className="px-5 py-3 text-xs font-semibold text-slate-800 dark:text-slate-200">{country}</td>
                            <td className="px-5 py-3">
                              <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 tabular-nums">
                                <ArrowUpRight size={11} />{added}
                              </span>
                            </td>
                            <td className="px-5 py-3">
                              <span className="flex items-center gap-1 text-xs font-medium text-rose-600 dark:text-rose-400 tabular-nums">
                                <ArrowDownRight size={11} />{deleted}
                              </span>
                            </td>
                            <td className="px-5 py-3">
                              <span className={`text-xs font-bold tabular-nums ${net > 0 ? 'text-emerald-600 dark:text-emerald-400' : net < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400'}`}>
                                {net > 0 ? '+' : ''}{net}
                              </span>
                            </td>
                            <td className="px-5 py-3">
                              <div className="flex gap-0.5 h-2.5 rounded overflow-hidden bg-slate-100 dark:bg-slate-800">
                                <div className="bg-emerald-400 dark:bg-emerald-600 h-full" style={{ width: `${addPct}%` }} />
                                <div className="bg-rose-400 dark:bg-rose-600 h-full" style={{ width: `${delPct}%` }} />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* By Index tab */}
              {activeTab === 'byindex' && (
                <div className="space-y-3">
                  <div className="relative">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input value={searchQ} onChange={(e) => setSearchQ(e.target.value)}
                      placeholder="Search any security or country…"
                      className="w-full pl-8 pr-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500" />
                  </div>

                  {searchQ.trim() ? (
                    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                      {filteredEntries.length === 0 ? (
                        <p className="px-5 py-8 text-sm text-slate-400 text-center">No results for &ldquo;{searchQ}&rdquo;</p>
                      ) : filteredEntries.map((e, i) => (
                        <div key={i} className="flex items-center gap-3 px-5 py-2.5 border-b border-slate-50 dark:border-slate-800 last:border-0">
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${e.action === 'added' ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400' : 'bg-rose-50 dark:bg-rose-950 text-rose-600 dark:text-rose-400'}`}>
                            {e.action === 'added' ? '+ Added' : '− Deleted'}
                          </span>
                          <span className="text-sm font-medium text-slate-800 dark:text-slate-200 flex-1">{e.security_name}</span>
                          <span className="text-xs text-slate-400">{e.country}</span>
                        </div>
                      ))}
                    </div>
                  ) : countries.map((country) => {
                    const adds = entries.filter((e) => e.country === country && e.action === 'added');
                    const dels = entries.filter((e) => e.country === country && e.action === 'deleted');
                    const isOpen = expanded[country] ?? false;
                    return (
                      <div key={country} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                        <button
                          onClick={() => setExpanded((p) => ({ ...p, [country]: !p[country] }))}
                          className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                          <div className="flex items-center gap-2.5">
                            {isOpen ? <ChevronDown size={13} className="text-slate-400" /> : <ChevronRight size={13} className="text-slate-400" />}
                            <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">MSCI {country} INDEX</span>
                          </div>
                          <div className="flex items-center gap-3 text-xs font-medium tabular-nums">
                            <span className="text-emerald-600 dark:text-emerald-400">+{adds.length}</span>
                            <span className="text-rose-600 dark:text-rose-400">−{dels.length}</span>
                            <span className={`font-bold ${adds.length - dels.length > 0 ? 'text-emerald-600 dark:text-emerald-400' : adds.length - dels.length < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400'}`}>
                              Net {adds.length - dels.length > 0 ? '+' : ''}{adds.length - dels.length}
                            </span>
                          </div>
                        </button>
                        {isOpen && (
                          <div className="grid grid-cols-2 border-t border-slate-100 dark:border-slate-800">
                            <div className="border-r border-slate-100 dark:border-slate-800">
                              <p className="px-4 py-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40">
                                Added ({adds.length})
                              </p>
                              {adds.length === 0
                                ? <p className="px-4 py-3 text-xs text-slate-400 italic">None</p>
                                : adds.map((e, i) => (
                                  <p key={i} className="px-4 py-1.5 text-xs text-slate-700 dark:text-slate-300 border-b border-slate-50 dark:border-slate-800 last:border-0">
                                    {e.security_name}
                                  </p>
                                ))}
                            </div>
                            <div>
                              <p className="px-4 py-2 text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40">
                                Deleted ({dels.length})
                              </p>
                              {dels.length === 0
                                ? <p className="px-4 py-3 text-xs text-slate-400 italic">None</p>
                                : dels.map((e, i) => (
                                  <p key={i} className="px-4 py-1.5 text-xs text-slate-700 dark:text-slate-300 border-b border-slate-50 dark:border-slate-800 last:border-0">
                                    {e.security_name}
                                  </p>
                                ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Compare tab */}
              {activeTab === 'compare' && (
                <div className="space-y-5">
                  <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-5">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Compare with another rebalance</p>
                    <select value={compareId ?? ''} onChange={(e) => setCompareId(e.target.value || null)}
                      className="w-full text-sm px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-400">
                      <option value="">Select a rebalance…</option>
                      {savedList.filter((r) => r.id !== currentId).map((r) => (
                        <option key={r.id} value={r.id}>{r.title} — {fmtDate(r.effective_date)}</option>
                      ))}
                    </select>
                    {compareId && compareDetail && (
                      <p className="text-xs text-slate-400 mt-2">
                        Comparing <strong className="text-slate-600 dark:text-slate-300">{detail.title}</strong> vs <strong className="text-slate-600 dark:text-slate-300">{compareDetail.title}</strong>
                      </p>
                    )}
                  </div>

                  {compareId && !compareDetail && (
                    <div className="flex justify-center py-8">
                      <div className="w-5 h-5 rounded-full border-2 border-sky-500 border-t-transparent animate-spin" />
                    </div>
                  )}

                  {compareDetail && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                      <CompareCard title="Added in both" subtitle="Recurring inclusions — strong signal" items={bothAdded} color="emerald" />
                      <CompareCard title="Deleted in both" subtitle="Recurring exclusions — persistent exits" items={bothDel} color="rose" />
                      <CompareCard title="Reversed" subtitle={`Added here, deleted in "${compareDetail.title}"`} items={reversed} color="amber" />
                    </div>
                  )}

                  {!compareId && (
                    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-12 flex flex-col items-center gap-3 text-center">
                      <RefreshCcw size={22} className="text-slate-300 dark:text-slate-600" />
                      <p className="text-sm text-slate-500 dark:text-slate-400">Select a second rebalance above to find cross-period patterns</p>
                    </div>
                  )}
                </div>
              )}

            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CompareCard({ title, subtitle, items, color }: {
  title: string; subtitle: string; items: Entry[]; color: 'emerald' | 'rose' | 'amber';
}) {
  const c = {
    emerald: { hdr: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300', badge: 'bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300' },
    rose:    { hdr: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300',             badge: 'bg-rose-100 dark:bg-rose-900 text-rose-700 dark:text-rose-300' },
    amber:   { hdr: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300',         badge: 'bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300' },
  }[color];
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
      <div className={`px-4 py-3 border-b border-slate-100 dark:border-slate-800 ${c.hdr}`}>
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold">{title}</p>
          <span className={`text-xs font-bold px-1.5 py-0.5 rounded tabular-nums ${c.badge}`}>{items.length}</span>
        </div>
        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 leading-relaxed">{subtitle}</p>
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-6 text-xs text-slate-400 text-center italic">None found</p>
      ) : (
        <ul className="max-h-72 overflow-y-auto">
          {items.map((e, i) => (
            <li key={i} className="px-4 py-2 border-b border-slate-50 dark:border-slate-800 last:border-0">
              <p className="text-xs font-medium text-slate-800 dark:text-slate-200">{e.security_name}</p>
              <p className="text-[10px] text-slate-400">{e.country}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
