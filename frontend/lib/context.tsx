'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface Dataset {
  id: string;
  name: string;
  records: { count: number }[];
}

interface AppContextType {
  datasets: Dataset[];
  selectedId: string;
  setSelectedId: (id: string) => void;
  api: string;
}

const AppContext = createContext<AppContextType>({
  datasets: [],
  selectedId: '',
  setSelectedId: () => {},
  api: API,
});

export function AppProvider({ children }: { children: ReactNode }) {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedId, setSelectedId] = useState('');

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
    <AppContext.Provider value={{ datasets, selectedId, setSelectedId, api: API }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
