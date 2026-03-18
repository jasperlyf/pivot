'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, BarChart2, GitCompare, Settings,
  TrendingUp, PanelLeftClose, PanelLeftOpen, LogOut, Layers, Upload,
  PieChart, Hammer, ChevronDown, FolderOpen, Star,
} from 'lucide-react';
import { useApp } from '@/lib/context';
import { createClient } from '@/lib/supabase/browser';

interface WorkspaceItem { id: string; name: string; pinned: boolean; }

const topNav = [
  { href: '/',            label: 'Home',    icon: LayoutDashboard },
  { href: '/explore',     label: 'Explore', icon: BarChart2 },
  { href: '/comparisons', label: 'Compare', icon: GitCompare },
];

const builderNav = [
  { href: '/index-builder', label: 'Custom Index',        icon: Layers },
  { href: '/portfolio',     label: 'Portfolio Simulator', icon: PieChart },
];

const bottomNav = [
  { href: '/data-sources', label: 'Uploads',  icon: Upload },
  { href: '/settings',     label: 'Settings', icon: Settings },
];

export default function Sidebar() {
  const path     = usePathname();
  const router   = useRouter();
  const { user, signOut } = useApp();
  const supabase = createClient();

  const [collapsed, setCollapsed]     = useState(false);
  const builderActive                 = builderNav.some((item) => path.startsWith(item.href));
  const [builderOpen, setBuilderOpen] = useState(builderActive);
  const [wsOpen, setWsOpen]           = useState(false);
  const [workspaces, setWorkspaces]   = useState<WorkspaceItem[]>([]);

  function fetchWorkspaces() {
    if (!user) { setWorkspaces([]); return; }
    supabase
      .from('workspaces')
      .select('id, name, pinned')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .then(({ data }) => setWorkspaces((data ?? []).sort((a, b) => Number(b.pinned) - Number(a.pinned))));
  }

  // Fetch on user change
  useEffect(() => { fetchWorkspaces(); }, [user]); // eslint-disable-line

  // Refetch on navigation so newly created workspaces appear immediately
  useEffect(() => { fetchWorkspaces(); }, [path]); // eslint-disable-line

  // Auto-open workspace dropdown if currently on a workspace page
  useEffect(() => {
    if (path.startsWith('/workspace')) setWsOpen(true);
  }, [path]);

  const wsActive = path.startsWith('/workspace');

  async function togglePin(ws: WorkspaceItem, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const next = !ws.pinned;
    setWorkspaces((prev) =>
      prev.map((w) => w.id === ws.id ? { ...w, pinned: next } : w)
          .sort((a, b) => Number(b.pinned) - Number(a.pinned))
    );
    await supabase.from('workspaces').update({ pinned: next }).eq('id', ws.id);
  }

  const handleSignOut = async () => {
    await signOut();
    router.push('/login');
  };

  function NavLink({ href, label, icon: Icon, indent = false }: {
    href: string; label: string; icon: React.ElementType; indent?: boolean;
  }) {
    const active = href === '/' ? path === href : path.startsWith(href);
    return (
      <Link
        href={href}
        title={collapsed ? label : undefined}
        className={`flex items-center gap-3 py-2 rounded-lg text-sm font-medium transition-colors ${
          indent && !collapsed ? 'pl-8 pr-2.5' : 'px-2.5'
        } ${collapsed ? 'justify-center' : ''} ${
          active
            ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300'
            : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-100'
        }`}
      >
        <Icon size={15} strokeWidth={active ? 2.5 : 2} className="shrink-0" />
        {!collapsed && label}
      </Link>
    );
  }

  return (
    <aside className={`${collapsed ? 'w-14' : 'w-56'} bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col shrink-0 transition-all duration-200`}>
      {/* Header */}
      <div className="h-14 flex items-center justify-between px-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
        {!collapsed && (
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-md bg-indigo-600 flex items-center justify-center shrink-0">
              <TrendingUp size={12} className="text-white" strokeWidth={2.5} />
            </div>
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 tracking-tight">Pivot</span>
          </div>
        )}
        <button
          onClick={() => setCollapsed((v) => !v)}
          className={`text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md p-1.5 transition-colors ${collapsed ? 'mx-auto' : ''}`}
        >
          {collapsed ? <PanelLeftOpen size={15} strokeWidth={1.75} /> : <PanelLeftClose size={15} strokeWidth={1.75} />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {/* Top nav items */}
        {topNav.map(({ href, label, icon }) => (
          <NavLink key={href} href={href} label={label} icon={icon} />
        ))}

        {/* Builder group */}
        <div className="pt-0.5">
          <button
            onClick={() => !collapsed && setBuilderOpen((v) => !v)}
            title={collapsed ? 'Builder' : undefined}
            className={`flex items-center gap-3 w-full px-2.5 py-2 rounded-lg text-sm font-medium transition-colors ${
              collapsed ? 'justify-center' : ''
            } ${
              builderActive
                ? 'text-indigo-700 dark:text-indigo-300'
                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-100'
            }`}
          >
            <Hammer size={15} strokeWidth={builderActive ? 2.5 : 2} className="shrink-0" />
            {!collapsed && (
              <>
                <span className="flex-1 text-left">Builder</span>
                <ChevronDown size={13} className={`transition-transform duration-200 ${builderOpen ? 'rotate-180' : ''}`} />
              </>
            )}
          </button>
          {(builderOpen || collapsed) && (
            <div className={`space-y-0.5 ${!collapsed ? 'mt-0.5' : ''}`}>
              {builderNav.map(({ href, label, icon }) => (
                <NavLink key={href} href={href} label={label} icon={icon} indent={!collapsed} />
              ))}
            </div>
          )}
        </div>

        {/* Workspaces dropdown */}
        <div className="pt-0.5">
          <button
            onClick={() => {
              if (collapsed) { router.push('/workspace'); return; }
              setWsOpen((v) => !v);
            }}
            title={collapsed ? 'Workspaces' : undefined}
            className={`flex items-center gap-3 w-full px-2.5 py-2 rounded-lg text-sm font-medium transition-colors ${
              collapsed ? 'justify-center' : ''
            } ${
              wsActive
                ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300'
                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-100'
            }`}
          >
            <FolderOpen size={15} strokeWidth={wsActive ? 2.5 : 2} className="shrink-0" />
            {!collapsed && (
              <>
                <span className="flex-1 text-left">Workspaces</span>
                {workspaces.length > 0 && (
                  <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-600 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded-full">
                    {workspaces.length}
                  </span>
                )}
                <ChevronDown size={13} className={`ml-1 transition-transform duration-200 ${wsOpen ? 'rotate-180' : ''}`} />
              </>
            )}
          </button>

          {wsOpen && !collapsed && (
            <div className="mt-0.5 space-y-0.5">
              {workspaces.length === 0 ? (
                <p className="pl-8 pr-2.5 py-1.5 text-xs text-slate-400 dark:text-slate-600 italic">No workspaces yet</p>
              ) : (
                workspaces.map((ws) => {
                  const active = path === `/workspace/${ws.id}`;
                  return (
                    <div key={ws.id} className="flex items-center group">
                      <Link
                        href={`/workspace/${ws.id}`}
                        className={`flex-1 flex items-center gap-2 pl-8 pr-2 py-1.5 rounded-lg text-xs font-medium transition-colors min-w-0 ${
                          active
                            ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300'
                            : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-100'
                        }`}
                      >
                        <FolderOpen size={11} className="shrink-0 opacity-50" />
                        <span className="truncate">{ws.name}</span>
                      </Link>
                      <button
                        onClick={(e) => togglePin(ws, e)}
                        title={ws.pinned ? 'Unpin' : 'Pin to favourites'}
                        className={`p-1 mr-0.5 rounded transition-all ${
                          ws.pinned
                            ? 'text-amber-400 opacity-100'
                            : 'text-slate-200 dark:text-slate-700 hover:text-amber-400 opacity-0 group-hover:opacity-100'
                        }`}
                      >
                        <Star size={11} className={ws.pinned ? 'fill-amber-400' : ''} />
                      </button>
                    </div>
                  );
                })
              )}

              {/* View all — bottom of list */}
              <Link
                href="/workspace"
                className="flex items-center gap-2.5 pl-8 pr-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                View all workspaces →
              </Link>
            </div>
          )}
        </div>

        {/* Bottom items */}
        <div className="pt-0.5 space-y-0.5">
          {bottomNav.map(({ href, label, icon }) => (
            <NavLink key={href} href={href} label={label} icon={icon} />
          ))}
        </div>
      </nav>

      {/* User + sign out */}
      <div className={`p-2 border-t border-slate-100 dark:border-slate-800 space-y-0.5 ${collapsed ? '' : 'px-3'}`}>
        {!collapsed && user && (
          <p className="text-[11px] text-slate-400 dark:text-slate-600 truncate px-2.5 pt-1">{user.email}</p>
        )}
        <button
          onClick={handleSignOut}
          title={collapsed ? 'Sign out' : undefined}
          className={`flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-sm font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-rose-600 dark:hover:text-rose-400 transition-colors ${collapsed ? 'justify-center' : ''}`}
        >
          <LogOut size={15} strokeWidth={2} className="shrink-0" />
          {!collapsed && 'Sign out'}
        </button>
      </div>
    </aside>
  );
}
