'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/lib/context';
import { createClient } from '@/lib/supabase/browser';
import {
  Trash2, RefreshCcw, Search, ChevronDown, ChevronRight,
  CheckCircle2, AlertCircle, ArrowUpRight, ArrowDownRight, ExternalLink, Globe, FileText,
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
  tierLabel?: string;
}
interface ReviewDate { quarter: string; announcementDate: string; effectiveDate: string; }
interface TierResult extends ParsedResult { tierLabel: string; }
interface MultiResult {
  periodCode: string;
  tiers: Record<string, TierResult>;
  analysis: {
    movements: { security_name: string; country: string; type: 'promotion' | 'demotion'; from: string; to: string; }[];
    trueExits: { security_name: string; country: string; }[];
    newToUniverse: { security_name: string; country: string; }[];
  };
}
const TIER_LABELS: Record<string, string> = {
  standard: 'Standard', smallcap: 'Small Cap', microcap: 'Micro Cap', chinaa: 'China A',
};

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

  const [savedList, setSavedList]         = useState<RebalanceSummary[]>([]);
  const [currentId, setCurrentId]         = useState<string | null>(null);
  const [detail, setDetail]               = useState<RebalanceDetail | null>(null);
  const [parsed, setParsed]               = useState<ParsedResult | null>(null);
  const [saveName, setSaveName]           = useState('');
  const [saving, setSaving]               = useState(false);
  const [status, setStatus]               = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const [deletingId, setDeletingId]       = useState<string | null>(null);
  const [activeTab, setActiveTab]         = useState<'summary' | 'byindex' | 'compare' | 'crosstier'>('summary');
  const [searchQ, setSearchQ]             = useState('');
  const [expanded, setExpanded]           = useState<Record<string, boolean>>({});
  const [compareId, setCompareId]         = useState<string | null>(null);
  const [compareDetail, setCompareDetail] = useState<RebalanceDetail | null>(null);

  // Document browser
  interface MsciDoc { label: string; url: string; parseable: boolean; indexType: string | null; periodCode: string | null; }
  interface MsciGroup { title: string; docs: MsciDoc[]; periodCode: string | null; availableTiers: string[]; }
  const [browseOpen, setBrowseOpen]           = useState(false);
  const [docGroups, setDocGroups]             = useState<MsciGroup[]>([]);
  const [docLoading, setDocLoading]           = useState(false);
  const [docExpanded, setDocExpanded]         = useState<Record<number, boolean>>({});
  const [fetchingUrl, setFetchingUrl]         = useState<string | null>(null);

  // Upcoming review dates
  const [reviewDates, setReviewDates]         = useState<ReviewDate[]>([]);
  const [datesExpanded, setDatesExpanded]     = useState(false);

  // Multi-tier
  const [multiResult, setMultiResult]         = useState<MultiResult | null>(null);
  const [activeTier, setActiveTier]           = useState<string>('standard');
  const [loadingMulti, setLoadingMulti]       = useState<string | null>(null); // periodCode being loaded

  // Security tracker
  interface TrackerAppearance { rebalance_id: string; title: string; announcement_date: string | null; effective_date: string | null; action: 'added' | 'deleted'; }
  interface TrackerResult { security_name: string; country: string; appearances: TrackerAppearance[]; }
  const [trackerOpen, setTrackerOpen]         = useState(false);
  const [trackerQuery, setTrackerQuery]       = useState('');
  const [trackerResults, setTrackerResults]   = useState<TrackerResult[]>([]);
  const [trackerLoading, setTrackerLoading]   = useState(false);
  const [trackerSearched, setTrackerSearched] = useState(false);

  async function loadList() {
    const token = await getToken(supabase);
    if (!token) return;
    const r = await fetch(`${api}/msci/rebalances`, { headers: { Authorization: `Bearer ${token}` } });
    if (r.ok) setSavedList(await r.json());
  }
  useEffect(() => {
    loadList();
    fetch(`${api}/msci/dates`).then((r) => r.ok ? r.json() : []).then(setReviewDates).catch(() => {});
  }, []); // eslint-disable-line

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

  async function openBrowser() {
    setBrowseOpen(true);
    if (docGroups.length > 0) return;
    setDocLoading(true);
    try {
      const r = await fetch(`${api}/msci/documents`);
      if (r.ok) {
        const groups = await r.json();
        setDocGroups(groups);
        // Expand first group by default
        if (groups.length > 0) setDocExpanded({ 0: true });
      }
    } finally { setDocLoading(false); }
  }

  async function fetchMulti(periodCode: string) {
    setLoadingMulti(periodCode);
    setStatus(null);
    setParsed(null);
    setMultiResult(null);
    setBrowseOpen(false);
    setCurrentId(null);
    setDetail(null);
    try {
      const r = await fetch(`${api}/msci/fetch-multi`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periodCode }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setMultiResult(data);
      setActiveTier(Object.keys(data.tiers)[0] ?? 'standard');
      setActiveTab('summary');
      setSearchQ('');
      setExpanded({});
    } catch (e: any) {
      setStatus({ type: 'err', msg: e.message });
    } finally { setLoadingMulti(null); }
  }

  async function fetchAndParse(url: string) {
    setFetchingUrl(url);
    setStatus(null);
    setParsed(null);
    setBrowseOpen(false);
    try {
      const r = await fetch(`${api}/msci/fetch-parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setParsed(data);
      setSaveName(data.title || 'MSCI Rebalance');
      setCurrentId(null); setDetail(null);
    } catch (e: any) {
      setStatus({ type: 'err', msg: e.message });
    } finally { setFetchingUrl(null); }
  }

  async function searchTracker(q: string) {
    if (q.trim().length < 2) return;
    setTrackerLoading(true); setTrackerSearched(false);
    const token = await getToken(supabase);
    try {
      const r = await fetch(`${api}/msci/security-tracker?q=${encodeURIComponent(q.trim())}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setTrackerResults(data);
      setTrackerSearched(true);
    } catch (e: any) {
      setStatus({ type: 'err', msg: e.message });
    } finally { setTrackerLoading(false); }
  }

  // ── Derived — works for saved (detail), unsaved (parsed), and multi-tier ──
  // For multi-tier, use the currently selected tier's data
  const multiTierData  = multiResult ? multiResult.tiers[activeTier] ?? Object.values(multiResult.tiers)[0] : null;
  const activeEntries  = detail?.entries ?? multiTierData?.entries ?? parsed?.entries ?? [];
  const activeTitle    = detail?.title ?? multiTierData?.title ?? parsed?.title ?? '';
  const activeAnnDate  = detail?.announcement_date ?? multiTierData?.announcementDate ?? parsed?.announcementDate ?? null;
  const activeEffDate  = detail?.effective_date    ?? multiTierData?.effectiveDate    ?? parsed?.effectiveDate    ?? null;
  const hasActive      = !!(detail || parsed || multiResult);

  const countries  = [...new Set(activeEntries.map((e) => e.country))].sort();
  const totalAdded   = activeEntries.filter((e) => e.action === 'added').length;
  const totalDeleted = activeEntries.filter((e) => e.action === 'deleted').length;

  const countryStats = countries.map((c) => {
    const added   = activeEntries.filter((e) => e.country === c && e.action === 'added').length;
    const deleted = activeEntries.filter((e) => e.country === c && e.action === 'deleted').length;
    return { country: c, added, deleted, net: added - deleted };
  }).sort((a, b) => (b.added + b.deleted) - (a.added + a.deleted));

  const maxTotal = Math.max(...countryStats.map((c) => c.added + c.deleted), 1);

  const filteredEntries = searchQ.trim()
    ? activeEntries.filter((e) =>
        e.security_name.toLowerCase().includes(searchQ.toLowerCase()) ||
        e.country.toLowerCase().includes(searchQ.toLowerCase()))
    : activeEntries;

  const compareEntries = compareDetail?.entries ?? [];
  const bothAdded  = activeEntries.filter((e) => e.action === 'added'   && compareEntries.some((c) => c.action === 'added'   && c.security_name === e.security_name));
  const bothDel    = activeEntries.filter((e) => e.action === 'deleted' && compareEntries.some((c) => c.action === 'deleted' && c.security_name === e.security_name));
  const reversed   = activeEntries.filter((e) => e.action === 'added'   && compareEntries.some((c) => c.action === 'deleted' && c.security_name === e.security_name));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100">MSCI Rebalance Analyzer</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Browse MSCI rebalance PDFs — extract additions &amp; deletions, compare across periods
        </p>
      </div>

      {/* ── Review dates timeline ── */}
      {reviewDates.length > 0 && (() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const next = reviewDates.find((d) => new Date(d.announcementDate) >= today);
        const daysToAnn  = next ? Math.ceil((new Date(next.announcementDate).getTime() - today.getTime()) / 86400000) : null;
        const daysToEff  = next ? Math.ceil((new Date(next.effectiveDate).getTime()    - today.getTime()) / 86400000) : null;
        const fmt = (s: string) => new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        return (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden">
            <button
              onClick={() => setDatesExpanded((v) => !v)}
              className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left"
            >
              <div className="flex items-center gap-6 flex-wrap">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    Next Review — {next?.quarter}
                  </span>
                </div>
                {next && (
                  <>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Announced <strong className="text-slate-700 dark:text-slate-200">{fmt(next.announcementDate)}</strong>
                      {daysToAnn !== null && daysToAnn > 0 && (
                        <span className="ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 bg-sky-50 dark:bg-sky-950 text-sky-600 dark:text-sky-400 rounded">
                          {daysToAnn}d
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Effective <strong className="text-slate-700 dark:text-slate-200">{fmt(next.effectiveDate)}</strong>
                      {daysToEff !== null && daysToEff > 0 && (
                        <span className="ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400 rounded">
                          {daysToEff}d
                        </span>
                      )}
                    </span>
                  </>
                )}
              </div>
              <ChevronDown size={13} className={`text-slate-400 transition-transform shrink-0 ${datesExpanded ? 'rotate-180' : ''}`} />
            </button>

            {datesExpanded && (
              <div className="border-t border-slate-100 dark:border-slate-800 px-5 py-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {reviewDates.map((d, i) => {
                    const isPast = new Date(d.effectiveDate) < today;
                    const isNext = d === next;
                    return (
                      <div key={i} className={`rounded-lg px-3 py-2.5 border ${
                        isNext  ? 'border-sky-200 dark:border-sky-700 bg-sky-50 dark:bg-sky-950' :
                        isPast  ? 'border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 opacity-50' :
                                  'border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30'
                      }`}>
                        <p className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${isNext ? 'text-sky-600 dark:text-sky-400' : 'text-slate-400'}`}>{d.quarter}</p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">Ann. <span className="text-slate-700 dark:text-slate-300 font-medium">{fmt(d.announcementDate)}</span></p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Eff. <span className="text-slate-700 dark:text-slate-300 font-medium">{fmt(d.effectiveDate)}</span></p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })()}

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

          <div className="px-3 py-2.5 border-t border-slate-100 dark:border-slate-800 space-y-1">
            <button onClick={openBrowser}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950 transition-colors">
              <Globe size={12} />
              Browse MSCI
            </button>
            <button onClick={() => { setTrackerOpen(true); setBrowseOpen(false); }}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
              <Search size={12} />
              Track Security
            </button>
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
          {!parsed && !detail && !browseOpen && !fetchingUrl && !loadingMulti && !trackerOpen && (
            <button onClick={openBrowser}
              className="w-full bg-white dark:bg-slate-900 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 hover:border-sky-400 dark:hover:border-sky-600 p-16 flex flex-col items-center gap-3 text-center cursor-pointer transition-colors group">
              <div className="w-14 h-14 rounded-xl bg-sky-50 dark:bg-sky-950 flex items-center justify-center group-hover:bg-sky-100 dark:group-hover:bg-sky-900 transition-colors">
                <Globe size={26} className="text-sky-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Browse MSCI</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Pick directly from MSCI — no download needed</p>
              </div>
            </button>
          )}

          {/* Fetching / multi-load spinner */}
          {(fetchingUrl || loadingMulti) && (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-16 flex flex-col items-center gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-sky-500 border-t-transparent animate-spin" />
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {loadingMulti ? `Fetching all tiers for ${loadingMulti}…` : 'Fetching and parsing PDF…'}
              </p>
            </div>
          )}

          {/* MSCI document browser */}
          {browseOpen && !fetchingUrl && (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Globe size={14} className="text-sky-500" />
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">MSCI Index Review Documents</span>
                </div>
                <button onClick={() => setBrowseOpen(false)}
                  className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                  Close
                </button>
              </div>

              {docLoading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="w-6 h-6 rounded-full border-2 border-sky-500 border-t-transparent animate-spin" />
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[560px] overflow-y-auto">
                  {docGroups.map((group, gi) => (
                    <div key={gi}>
                      <div
                        onClick={() => setDocExpanded((p) => ({ ...p, [gi]: !p[gi] }))}
                        className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer select-none"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">{group.title}</span>
                          {group.availableTiers.length > 1 && (
                            <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 bg-indigo-50 dark:bg-indigo-950 text-indigo-500 dark:text-indigo-400 rounded uppercase tracking-wide">
                              {group.availableTiers.length} tiers
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {group.periodCode && group.availableTiers.length > 1 && (
                            <button
                              onClick={(e) => { e.stopPropagation(); fetchMulti(group.periodCode!); }}
                              className="text-[10px] font-semibold px-2 py-0.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded transition-colors"
                            >
                              Load All Tiers
                            </button>
                          )}
                          <ChevronDown size={13} className={`text-slate-400 transition-transform ${docExpanded[gi] ? 'rotate-180' : ''}`} />
                        </div>
                      </div>
                      {docExpanded[gi] && (
                        <div className="pb-2">
                          {group.docs.map((doc, di) => (
                            <div key={di} className="flex items-center gap-3 px-5 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                              <FileText size={12} className={doc.parseable ? 'text-sky-400' : 'text-slate-300 dark:text-slate-600'} />
                              <span className="flex-1 text-xs text-slate-600 dark:text-slate-300 truncate">{doc.label}</span>
                              {doc.indexType && doc.parseable && (
                                <span className="shrink-0 text-[9px] font-semibold px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 rounded">
                                  {TIER_LABELS[doc.indexType] ?? doc.indexType}
                                </span>
                              )}
                              {doc.parseable ? (
                                <button
                                  onClick={() => fetchAndParse(doc.url)}
                                  className="shrink-0 text-[10px] font-semibold px-2 py-0.5 bg-sky-50 dark:bg-sky-950 text-sky-600 dark:text-sky-400 hover:bg-sky-100 dark:hover:bg-sky-900 rounded transition-colors"
                                >
                                  Analyze
                                </button>
                              ) : (
                                <a href={doc.url} target="_blank" rel="noopener noreferrer"
                                  className="shrink-0 text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center gap-0.5 transition-colors">
                                  View <ExternalLink size={9} />
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Security Tracker ── */}
          {trackerOpen && !browseOpen && !fetchingUrl && !loadingMulti && (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Search size={14} className="text-indigo-500" />
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Security Tracker</span>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">— search across your saved rebalances</span>
                </div>
                <button onClick={() => { setTrackerOpen(false); setTrackerResults([]); setTrackerQuery(''); setTrackerSearched(false); }}
                  className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                  Close
                </button>
              </div>

              <div className="px-5 py-4">
                <form onSubmit={(e) => { e.preventDefault(); searchTracker(trackerQuery); }} className="flex gap-2">
                  <input
                    value={trackerQuery}
                    onChange={(e) => setTrackerQuery(e.target.value)}
                    placeholder="e.g. NVIDIA, Samsung, Alibaba…"
                    className="flex-1 text-sm px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                  <button type="submit" disabled={trackerLoading || trackerQuery.trim().length < 2}
                    className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-semibold transition-colors flex items-center gap-1.5">
                    {trackerLoading
                      ? <div className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
                      : <Search size={12} />}
                    Search
                  </button>
                </form>
              </div>

              {savedList.length === 0 && (
                <div className="px-5 pb-5 text-center">
                  <p className="text-xs text-slate-400 dark:text-slate-500">Save some rebalances first to track securities across periods.</p>
                </div>
              )}

              {trackerSearched && !trackerLoading && (
                <div className="border-t border-slate-100 dark:border-slate-800">
                  {trackerResults.length === 0 ? (
                    <div className="px-5 py-8 text-center">
                      <p className="text-sm text-slate-400 dark:text-slate-500">No results for "<strong>{trackerQuery}</strong>"</p>
                      <p className="text-xs text-slate-400 dark:text-slate-600 mt-1">Try a shorter name or check spelling</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-50 dark:divide-slate-800 max-h-[480px] overflow-y-auto">
                      {trackerResults.map((result, ri) => {
                        const addedCount   = result.appearances.filter((a) => a.action === 'added').length;
                        const deletedCount = result.appearances.filter((a) => a.action === 'deleted').length;
                        return (
                          <div key={ri} className="px-5 py-4">
                            <div className="flex items-start justify-between gap-3 mb-3">
                              <div>
                                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{result.security_name}</p>
                                <p className="text-xs text-slate-400 mt-0.5">{result.country}</p>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {addedCount > 0 && (
                                  <span className="text-[10px] font-semibold px-2 py-0.5 bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 rounded">
                                    +{addedCount} added
                                  </span>
                                )}
                                {deletedCount > 0 && (
                                  <span className="text-[10px] font-semibold px-2 py-0.5 bg-rose-50 dark:bg-rose-950 text-rose-600 dark:text-rose-400 rounded">
                                    -{deletedCount} removed
                                  </span>
                                )}
                              </div>
                            </div>
                            {/* Timeline */}
                            <div className="flex flex-wrap gap-2">
                              {result.appearances.map((ap, ai) => (
                                <button key={ai}
                                  onClick={() => { if (ap.rebalance_id) loadDetail(ap.rebalance_id); setTrackerOpen(false); }}
                                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition-colors ${
                                    ap.action === 'added'
                                      ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/60'
                                      : 'border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/60'
                                  }`}>
                                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${ap.action === 'added' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                                  <span className="truncate max-w-[160px]">{ap.title}</span>
                                  {ap.effective_date && (
                                    <span className="opacity-60 shrink-0">{fmtDate(ap.effective_date)}</span>
                                  )}
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Active view (parsed, saved, or multi-tier) ── */}
          {hasActive && !browseOpen && !fetchingUrl && !loadingMulti && (
            <div className="space-y-5">

              {/* Multi-tier selector */}
              {multiResult && (
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Tier:</span>
                    {Object.entries(multiResult.tiers).map(([tier, data]) => (
                      <button key={tier} onClick={() => setActiveTier(tier)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                          activeTier === tier
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                        }`}>
                        {data.tierLabel}
                        <span className={`ml-1.5 tabular-nums ${activeTier === tier ? 'text-indigo-200' : 'text-slate-400'}`}>
                          {data.entries.filter((e) => e.action === 'added').length}↑ {data.entries.filter((e) => e.action === 'deleted').length}↓
                        </span>
                      </button>
                    ))}
                    <button onClick={() => setActiveTab('crosstier')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ml-auto ${
                        activeTab === 'crosstier'
                          ? 'bg-amber-500 text-white'
                          : 'bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900'
                      }`}>
                      ⚡ Cross-Tier Analysis
                    </button>
                  </div>
                </div>
              )}

              {/* Unsaved banner */}
              {parsed && !detail && (
                <div className="flex items-center justify-between gap-4 px-4 py-3 bg-sky-50 dark:bg-sky-950 border border-sky-200 dark:border-sky-800 rounded-xl">
                  <div>
                    <p className="text-xs font-semibold text-sky-700 dark:text-sky-300">Not yet saved</p>
                    <p className="text-xs text-sky-600/70 dark:text-sky-400/70 mt-0.5">Save to keep this rebalance in your library and enable cross-period comparison</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <input value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="Name…"
                      className="text-sm px-3 py-1.5 bg-white dark:bg-slate-900 border border-sky-200 dark:border-sky-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-400 w-44" />
                    <button onClick={saveRebalance} disabled={saving}
                      className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50">
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </div>
              )}

              {/* Header */}
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{activeTitle}</h2>
                    <div className="flex gap-4 mt-1 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
                      {activeAnnDate && <span>Announced: <strong className="text-slate-700 dark:text-slate-200">{fmtDate(activeAnnDate)}</strong></span>}
                      {activeEffDate && <span>Effective: <strong className="text-slate-700 dark:text-slate-200">{fmtDate(activeEffDate)}</strong></span>}
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
                {multiResult && (
                  <button onClick={() => setActiveTab('crosstier')}
                    className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                      activeTab === 'crosstier'
                        ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                        : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                    }`}>
                    ⚡ Cross-Tier
                  </button>
                )}
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
                    const adds = activeEntries.filter((e) => e.country === country && e.action === 'added');
                    const dels = activeEntries.filter((e) => e.country === country && e.action === 'deleted');
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

              {/* Cross-Tier tab */}
              {activeTab === 'crosstier' && multiResult && (() => {
                const { movements, trueExits, newToUniverse } = multiResult.analysis;
                const promotions = movements.filter((m) => m.type === 'promotion');
                const demotions  = movements.filter((m) => m.type === 'demotion');
                const tierName   = (t: string) => TIER_LABELS[t] ?? t;
                return (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      {/* New to universe */}
                      <CrossTierCard
                        title="New to MSCI Universe"
                        subtitle="Added to Standard — first time in any MSCI index"
                        items={newToUniverse}
                        color="emerald"
                        badge={`+${newToUniverse.length}`}
                      />
                      {/* True exits */}
                      <CrossTierCard
                        title="Left MSCI Universe"
                        subtitle="Removed from Standard — not found in any other tier"
                        items={trueExits}
                        color="rose"
                        badge={`−${trueExits.length}`}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      {/* Promotions */}
                      <CrossTierCard
                        title="Promoted"
                        subtitle="Moved up — deleted from lower tier, added to Standard"
                        items={promotions.map((m) => ({
                          security_name: m.security_name,
                          country: m.country,
                          note: `${tierName(m.from)} → ${tierName(m.to)}`,
                        }))}
                        color="indigo"
                        badge={`↑${promotions.length}`}
                      />
                      {/* Demotions */}
                      <CrossTierCard
                        title="Demoted"
                        subtitle="Moved down — deleted from Standard, added to smaller tier"
                        items={demotions.map((m) => ({
                          security_name: m.security_name,
                          country: m.country,
                          note: `${tierName(m.from)} → ${tierName(m.to)}`,
                        }))}
                        color="amber"
                        badge={`↓${demotions.length}`}
                      />
                    </div>
                    {movements.length === 0 && trueExits.length === 0 && newToUniverse.length === 0 && (
                      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center">
                        <p className="text-sm text-slate-400">No cross-tier movements detected for this period</p>
                      </div>
                    )}
                  </div>
                );
              })()}

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
                        Comparing <strong className="text-slate-600 dark:text-slate-300">{activeTitle}</strong> vs <strong className="text-slate-600 dark:text-slate-300">{compareDetail.title}</strong>
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


function CrossTierCard({ title, subtitle, items, color, badge }: {
  title: string; subtitle: string;
  items: { security_name: string; country: string; note?: string; }[];
  color: 'emerald' | 'rose' | 'indigo' | 'amber';
  badge: string;
}) {
  const c = {
    emerald: { hdr: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300', badge: 'bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300' },
    rose:    { hdr: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300',             badge: 'bg-rose-100 dark:bg-rose-900 text-rose-700 dark:text-rose-300' },
    indigo:  { hdr: 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300',    badge: 'bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300' },
    amber:   { hdr: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300',        badge: 'bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300' },
  }[color];
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
      <div className={`px-4 py-3 border-b border-slate-100 dark:border-slate-800 ${c.hdr}`}>
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold">{title}</p>
          <span className={`text-xs font-bold px-1.5 py-0.5 rounded tabular-nums ${c.badge}`}>{badge}</span>
        </div>
        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{subtitle}</p>
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-6 text-xs text-slate-400 text-center italic">None</p>
      ) : (
        <ul className="max-h-64 overflow-y-auto">
          {items.map((e, i) => (
            <li key={i} className="px-4 py-2 border-b border-slate-50 dark:border-slate-800 last:border-0 flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">{e.security_name}</p>
                <p className="text-[10px] text-slate-400">{e.country}</p>
              </div>
              {e.note && <span className="shrink-0 text-[9px] font-semibold px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 rounded">{e.note}</span>}
            </li>
          ))}
        </ul>
      )}
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
