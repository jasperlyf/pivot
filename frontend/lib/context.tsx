'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface Dataset {
  id: string;
  name: string;
  records: { count: number }[];
}

export interface DateRange {
  label: string;
  start: string;
  end: string;
}

export const DATE_PRESETS: DateRange[] = [
  { label: 'All time',      start: '2021-01-01', end: '2024-12-31' },
  { label: '2021',          start: '2021-01-01', end: '2021-12-31' },
  { label: '2022',          start: '2022-01-01', end: '2022-12-31' },
  { label: '2023',          start: '2023-01-01', end: '2023-12-31' },
  { label: '2024',          start: '2024-01-01', end: '2024-12-31' },
  { label: 'Last 2 years',  start: '2023-01-01', end: '2024-12-31' },
];

interface AppContextType {
  datasets: Dataset[];
  selectedId: string;
  setSelectedId: (id: string) => void;
  dateRange: DateRange;
  setDateRange: (r: DateRange) => void;
  api: string;
}

const AppContext = createContext<AppContextType>({
  datasets: [],
  selectedId: '',
  setSelectedId: () => {},
  dateRange: DATE_PRESETS[0],
  setDateRange: () => {},
  api: API,
});

export function AppProvider({ children }: { children: ReactNode }) {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [dateRange, setDateRange] = useState<DateRange>(DATE_PRESETS[0]);

  useEffect(() => {
    fetch(`${API}/datasets`)
      .then((r) => r.json())
      .then((data: Dataset[]) => {
        setDatasets(data);
        if (data.length > 0) setSelectedId(data[0].id);
      })
      .catch(() => {});
  }, []);

  return (
    <AppContext.Provider value={{ datasets, selectedId, setSelectedId, dateRange, setDateRange, api: API }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
