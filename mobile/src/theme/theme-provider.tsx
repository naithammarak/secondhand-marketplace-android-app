import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, type PropsWithChildren, useContext, useEffect, useRef, useState } from 'react';
import { useColorScheme } from 'react-native';
import { Colors } from '@/constants/theme';

export type ThemePreference = 'system' | 'dark' | 'light';
export const THEME_STORAGE_KEY = 'wondee.theme.v1';
export function resolveTheme(preference: ThemePreference, system: string | null | undefined) {
  return preference === 'system' ? (system === 'light' ? 'light' : 'dark') : preference;
}
const ThemeContext = createContext({ preference: 'dark' as ThemePreference, scheme: 'dark' as 'dark' | 'light',
  ready: true, setPreference: (_value: ThemePreference) => {} });

export function WondeeThemeProvider({ children }: PropsWithChildren) {
  const system = useColorScheme();
  const [preference, setValue] = useState<ThemePreference>('dark');
  const [ready, setReady] = useState(false);
  const changed = useRef(false);
  const pendingWrite = useRef(Promise.resolve());
  useEffect(() => {
    let mounted = true;
    void AsyncStorage.getItem(THEME_STORAGE_KEY).then(value => {
      if (mounted && !changed.current && ['system', 'dark', 'light'].includes(value ?? '')) setValue(value as ThemePreference);
    }).catch(() => undefined).finally(() => { if (mounted) setReady(true); });
    return () => { mounted = false; };
  }, []);
  const scheme = resolveTheme(preference, system);
  function setPreference(value: ThemePreference) {
    changed.current = true;
    setValue(value);
    pendingWrite.current = pendingWrite.current.then(() => AsyncStorage.setItem(THEME_STORAGE_KEY, value)).catch(() => undefined);
  }
  return <ThemeContext.Provider value={{ preference, scheme, ready, setPreference }}>{children}</ThemeContext.Provider>;
}
export function useThemePreference() { return useContext(ThemeContext); }
export function useWondeeTheme() { return Colors[useThemePreference().scheme]; }
