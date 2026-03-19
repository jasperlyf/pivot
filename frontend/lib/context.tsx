'use client';

import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { createClient } from '@/lib/supabase/browser';
import type { User } from '@supabase/supabase-js';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface DateRange {
  label: string;
  period: string;
  interval: string;
}

export const DATE_PRESETS: DateRange[] = [
  { label: '1M',  period: '1m',  interval: '1d'  },
  { label: '3M',  period: '3m',  interval: '1d'  },
  { label: '6M',  period: '6m',  interval: '1wk' },
  { label: '1Y',  period: '1y',  interval: '1mo' },
  { label: '2Y',  period: '2y',  interval: '1mo' },
  { label: '5Y',  period: '5y',  interval: '1mo' },
];

export const DEFAULT_SYMBOLS    = ['SPY', 'QQQ', 'ACWI', 'BTC-USD', 'ETH-USD', 'GLD'];
export const DEFAULT_FAVOURITES = ['SPY'];

export interface UserSettings {
  currency: string;
  metric: string;
  groupBy: string;
  theme: string;
}

const DEFAULT_SETTINGS: UserSettings = {
  currency: 'USD',
  metric: 'avg',
  groupBy: 'month',
  theme: 'light',
};

interface AppContextType {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
  symbols: string[];
  setSymbols: (s: string[]) => void;
  settings: UserSettings;
  saveSettings: (patch: Partial<UserSettings>) => Promise<void>;
  api: string;
  globalDateRange: DateRange;
  setGlobalDateRange: (dr: DateRange) => void;
  templatePinned: string[];
  toggleTemplatePinned: (label: string) => void;
  templateFavourites: string[];
  toggleTemplateFavourite: (label: string) => void;
  // Presentation mode
  presentationMode: boolean;
  presentationWorkspaceId: string | null;
  presentationWorkspaceName: string;
  presentationTemplateHrefs: string[];
  enterPresentation: (workspaceId: string, name: string, hrefs: string[]) => void;
  exitPresentation: () => void;
}

const AppContext = createContext<AppContextType>({
  user: null,
  loading: true,
  signOut: async () => {},
  symbols: DEFAULT_FAVOURITES,
  setSymbols: () => {},
  settings: DEFAULT_SETTINGS,
  saveSettings: async () => {},
  api: API,
  globalDateRange: DATE_PRESETS[3],
  setGlobalDateRange: () => {},
  templatePinned: ['Watchlist', 'Comparison Tool'],
  toggleTemplatePinned: () => {},
  templateFavourites: [],
  toggleTemplateFavourite: () => {},
  presentationMode: false,
  presentationWorkspaceId: null,
  presentationWorkspaceName: '',
  presentationTemplateHrefs: [],
  enterPresentation: () => {},
  exitPresentation: () => {},
});

export function AppProvider({ children }: { children: ReactNode }) {
  const supabase = useRef(typeof window !== 'undefined' ? createClient() : null);
  const [user, setUser]             = useState<User | null>(null);
  const [loading, setLoading]       = useState(true);
  const [symbols, setSymbolsState]  = useState<string[]>(DEFAULT_FAVOURITES);
  const [settings, setSettingsState] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [globalDateRange, setGlobalDateRange] = useState<DateRange>(DATE_PRESETS[3]);

  const [templatePinned, setTemplatePinned] = useState<string[]>(['Watchlist', 'Comparison Tool']);
  const [templateFavourites, setTemplateFavourites] = useState<string[]>([]);

  // Load localStorage after mount to avoid SSR/client hydration mismatch
  useEffect(() => {
    try {
      const stored = localStorage.getItem('templatePinned');
      if (stored) setTemplatePinned(JSON.parse(stored));
    } catch {}
    try {
      const stored = localStorage.getItem('templateFavourites');
      if (stored) setTemplateFavourites(JSON.parse(stored));
    } catch {}
  }, []);

  // Presentation mode state
  const [presentationMode, setPresentationMode] = useState(false);
  const [presentationWorkspaceId, setPresentationWorkspaceId] = useState<string | null>(null);
  const [presentationWorkspaceName, setPresentationWorkspaceName] = useState('');
  const [presentationTemplateHrefs, setPresentationTemplateHrefs] = useState<string[]>([]);

  const enterPresentation = (workspaceId: string, name: string, hrefs: string[]) => {
    setPresentationWorkspaceId(workspaceId);
    setPresentationWorkspaceName(name);
    setPresentationTemplateHrefs(hrefs);
    setPresentationMode(true);
  };

  const exitPresentation = () => {
    setPresentationMode(false);
    setPresentationWorkspaceId(null);
    setPresentationWorkspaceName('');
    setPresentationTemplateHrefs([]);
  };

  const toggleTemplatePinned = (label: string) => {
    setTemplatePinned((prev) => {
      const next = prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label];
      localStorage.setItem('templatePinned', JSON.stringify(next));
      // If unpinning, also remove from favourites
      if (!next.includes(label)) {
        setTemplateFavourites((fav) => {
          const nf = fav.filter((l) => l !== label);
          localStorage.setItem('templateFavourites', JSON.stringify(nf));
          return nf;
        });
      }
      return next;
    });
  };

  const toggleTemplateFavourite = (label: string) => {
    setTemplateFavourites((prev) => {
      const next = prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label];
      localStorage.setItem('templateFavourites', JSON.stringify(next));
      return next;
    });
  };

  useEffect(() => {
    if (!supabase.current) { setLoading(false); return; }
    supabase.current.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.current.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line

  useEffect(() => {
    if (!user) {
      setSymbolsState(DEFAULT_FAVOURITES);
      setSettingsState(DEFAULT_SETTINGS);
      return;
    }

    if (!supabase.current) return;

    supabase.current
      .from('user_favourites')
      .select('symbol')
      .eq('user_id', user.id)
      .order('created_at')
      .then(({ data }) => {
        if (data && data.length > 0) setSymbolsState(data.map((r) => r.symbol));
      });

    supabase.current
      .from('user_settings')
      .select('currency, metric, group_by, theme')
      .eq('user_id', user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setSettingsState({
            currency: data.currency ?? DEFAULT_SETTINGS.currency,
            metric:   data.metric   ?? DEFAULT_SETTINGS.metric,
            groupBy:  data.group_by ?? DEFAULT_SETTINGS.groupBy,
            theme:    data.theme    ?? DEFAULT_SETTINGS.theme,
          });
        }
      });
  }, [user]); // eslint-disable-line

  const setSymbols = async (newSymbols: string[]) => {
    setSymbolsState(newSymbols);
    if (!user || !supabase.current) return;
    await supabase.current.from('user_favourites').delete().eq('user_id', user.id);
    if (newSymbols.length) {
      await supabase.current.from('user_favourites').insert(
        newSymbols.map((symbol, i) => ({ user_id: user.id, symbol, order: i }))
      );
    }
  };

  const saveSettings = async (patch: Partial<UserSettings>) => {
    const next = { ...settings, ...patch };
    setSettingsState(next);
    if (!user || !supabase.current) return;
    await supabase.current.from('user_settings').upsert({
      user_id:  user.id,
      currency: next.currency,
      metric:   next.metric,
      group_by: next.groupBy,
      theme:    next.theme,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
  };

  const signOut = async () => {
    await supabase.current?.auth.signOut();
    setUser(null);
    setSymbolsState(DEFAULT_FAVOURITES);
    setSettingsState(DEFAULT_SETTINGS);
  };

  return (
    <AppContext.Provider value={{
      user, loading, signOut, symbols, setSymbols, settings, saveSettings, api: API,
      globalDateRange, setGlobalDateRange,
      templatePinned, toggleTemplatePinned, templateFavourites, toggleTemplateFavourite,
      presentationMode, presentationWorkspaceId, presentationWorkspaceName, presentationTemplateHrefs,
      enterPresentation, exitPresentation,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
