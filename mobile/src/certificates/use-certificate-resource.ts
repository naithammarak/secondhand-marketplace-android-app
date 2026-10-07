import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { AppState } from 'react-native';
import { inspectionError } from '@/inspections/use-inspection-api';

/** Never show an old validity badge during a refresh, after blur or on failure. */
export function useCertificateResource<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);
  const active = useRef(false);
  const clear = useCallback(() => {
    generation.current++;
    setData(undefined); setError(undefined); setLoading(true);
  }, []);
  const reload = useCallback(async () => {
    if (!active.current) return;
    clear();
    const current = generation.current;
    try {
      const next = await load();
      if (active.current && current === generation.current) setData(next);
    } catch (failure) {
      if (active.current && current === generation.current) setError(inspectionError(failure));
    } finally {
      if (active.current && current === generation.current) setLoading(false);
    }
  }, [clear, load]);
  useFocusEffect(useCallback(() => {
    active.current = true;
    void reload();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') { active.current = true; void reload(); }
      else { active.current = false; clear(); }
    });
    return () => { active.current = false; clear(); subscription.remove(); };
  }, [clear, reload]));
  return { data, error, loading, reload };
}
