import { useEffect, useState } from 'react';

const storageKey = 'shareshed-theme';

function readPreference() {
  try {
    const value = window.localStorage.getItem(storageKey);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

export default function useTheme() {
  const [preference, setPreference] = useState(readPreference);

  useEffect(() => {
    const system = window.matchMedia?.('(prefers-color-scheme: dark)');
    const applyTheme = () => {
      document.documentElement.dataset.theme = preference === 'system'
        ? (system?.matches ? 'dark' : 'light')
        : preference;
    };
    applyTheme();
    system?.addEventListener?.('change', applyTheme);
    return () => system?.removeEventListener?.('change', applyTheme);
  }, [preference]);

  useEffect(() => {
    const syncTheme = (event) => {
      if (event.key === storageKey || event.key === null) setPreference(readPreference());
    };
    window.addEventListener('storage', syncTheme);
    return () => window.removeEventListener('storage', syncTheme);
  }, []);

  const chooseTheme = (value) => {
    setPreference(value);
    try {
      window.localStorage.setItem(storageKey, value);
    } catch {
      // The selected theme still applies when storage is unavailable.
    }
  };

  return { preference, chooseTheme };
}
