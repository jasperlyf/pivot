'use client';

import { useEffect } from 'react';
import { useTheme } from 'next-themes';
import { useApp } from '@/lib/context';

// Applies the theme stored in the user's DB settings whenever they log in.
export default function ThemeSync() {
  const { settings } = useApp();
  const { setTheme } = useTheme();

  useEffect(() => {
    if (settings.theme) setTheme(settings.theme);
  }, [settings.theme]); // eslint-disable-line

  return null;
}
