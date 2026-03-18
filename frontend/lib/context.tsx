'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface DateRange {
  label: string;
  period: string;   // yahoo-finance period string
  interval: string; // yahoo-finance interval string
}

export const DATE_PRESETS: DateRange[] = [
  { label: '1M',   period: '1m',  interval: '1d'  },
  { label: '3M',   period: '3m',  interval: '1d'  },
  { label: '6M',   period: '6m',  interval: '1wk' },
  { label: '1Y',   period: '1y',  interval: '1mo' },
  { label: '2Y',   period: '2y',  interval: '1mo' },
  { label: '5Y',   period: '5y',  interval: '1mo' },
];

export const DEFAULT_SYMBOLS = ['SPY', 'QQQ', 'ACWI', 'BTC-USD', 'ETH-USD', 'GLD'];

interface AppContextType {
  symbols: string[];
  setSymbols: (s: string[]) => void;
  dateRange: DateRange;
  setDateRange: (r: DateRange) => void;
  api: string;
}

const AppContext = createContext<AppContextType>({
  symbols: DEFAULT_SYMBOLS,
  setSymbols: () => {},
  dateRange: DATE_PRESETS[3],
  setDateRange: () => {},
  api: API,
});

export function AppProvider({ children }: { children: ReactNode }) {
  const [symbols, setSymbols] = useState<string[]>(DEFAULT_SYMBOLS);
  const [dateRange, setDateRange] = useState<DateRange>(DATE_PRESETS[3]); // 1Y default

  return (
    <AppContext.Provider value={{ symbols, setSymbols, dateRange, setDateRange, api: API }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
