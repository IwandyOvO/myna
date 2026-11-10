import { LOCALES, resolveLocale, translate, type Locale } from '@myna/shared';
import { getLocales } from 'expo-localization';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { prefs } from './storage';
import { dark, light, type Palette } from './theme';

export type Appearance = 'system' | 'light' | 'dark';

interface StoredSettings {
  appLang: Locale | 'system';
  appearance: Appearance;
  contentLangs: Locale[];
}

const DEFAULTS: StoredSettings = { appLang: 'system', appearance: 'system', contentLangs: [...LOCALES] };
const KEY = 'myna.settings.v1';

interface SettingsCtx extends StoredSettings {
  ready: boolean;
  locale: Locale;
  colors: Palette;
  isDark: boolean;
  update: (patch: Partial<StoredSettings>) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const Ctx = createContext<SettingsCtx | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<StoredSettings>(DEFAULTS);
  const [ready, setReady] = useState(false);
  const scheme = useColorScheme();

  useEffect(() => {
    prefs.get<StoredSettings>(KEY).then((v) => {
      if (v) setS({ ...DEFAULTS, ...v });
      setReady(true);
    });
  }, []);

  const update = useCallback((patch: Partial<StoredSettings>) => {
    setS((prev) => {
      const next = { ...prev, ...patch };
      prefs.set(KEY, next);
      return next;
    });
  }, []);

  const value = useMemo<SettingsCtx>(() => {
    // §5.9 default follows the system language.
    const locale = s.appLang === 'system' ? resolveLocale(getLocales()[0]?.languageTag) : s.appLang;
    const isDark = s.appearance === 'system' ? scheme === 'dark' : s.appearance === 'dark';
    return { ...s, ready, locale, isDark, colors: isDark ? dark : light, update, t: (k, v) => translate(locale, k, v) };
  }, [s, ready, scheme, update]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSettings(): SettingsCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSettings outside SettingsProvider');
  return c;
}
