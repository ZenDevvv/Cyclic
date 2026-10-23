import { useCallback, useEffect, useState } from 'react';
import { api } from './api.ts';

export interface ApiState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

/** GET a JSON resource; refetches when `path` changes. Pass null to skip. */
export function useApi<T>(path: string | null): ApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!path);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!path) return;
    let alive = true;
    setLoading(true);
    setError(null);
    api<T>(path)
      .then((d) => alive && setData(d))
      .catch((e: Error) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [path, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload };
}
