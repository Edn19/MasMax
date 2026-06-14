import { useEffect, useState } from 'react';

export function useAsync<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    loader()
      .then((value) => {
        if (mounted) {
          setData(value);
          setError(null);
        }
      })
      .catch((err: Error) => mounted && setError(err.message))
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, deps);

  return { data, loading, error, setData };
}
