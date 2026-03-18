'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
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
export const DEFAULT_FAVOURITES = ['SPY', 'QQQ'];

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
});

export function AppProvider({ children }: { children: ReactNode }) {
  const supabase = createClient();
  const [user, setUser]             = useState<User | null>(null);
  const [loading, setLoading]       = useState(true);
  const [symbols, setSymbolsState]  = useState<string[]>(DEFAULT_FAVOURITES);
  const [settings, setSettingsState] = useState<UserSettings>(DEFAULT_SETTINGS);

  // Resolve session on mount
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line

  // Load favourites + settings from DB when user logs in
  useEffect(() => {
    if (!user) {
      setSymbolsState(DEFAULT_FAVOURITES);
      setSettingsState(DEFAULT_SETTINGS);
      return;
    }

    supabase
      .from('user_favourites')
      .select('symbol')
      .eq('user_id', user.id)
      .order('created_at')
      .then(({ data }) => {
        if (data && data.length > 0) setSymbolsState(data.map((r) => r.symbol));
      });

    supabase
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

  // Persist favourites to DB whenever they change
  const setSymbols = async (newSymbols: string[]) => {
    setSymbolsState(newSymbols);
    if (!user) return;
    await supabase.from('user_favourites').delete().eq('user_id', user.id);
    if (newSymbols.length) {
      await supabase.from('user_favourites').insert(
        newSymbols.map((symbol, i) => ({ user_id: user.id, symbol, order: i }))
      );
    }
  };

  // Persist a partial settings patch to DB
  const saveSettings = async (patch: Partial<UserSettings>) => {
    const next = { ...settings, ...patch };
    setSettingsState(next);
    if (!user) return;
    await supabase.from('user_settings').upsert({
      user_id:  user.id,
      currency: next.currency,
      metric:   next.metric,
      group_by: next.groupBy,
      theme:    next.theme,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSymbolsState(DEFAULT_FAVOURITES);
    setSettingsState(DEFAULT_SETTINGS);
  };

  return (
    <AppContext.Provider value={{ user, loading, signOut, symbols, setSymbols, settings, saveSettings, api: API }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
