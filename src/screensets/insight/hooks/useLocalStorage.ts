import { useState } from 'react';

function useLocalStorage<T>(
  key: string | undefined,
  initialValue: T,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (!key) return initialValue;
    try {
      const item = localStorage.getItem(key);
      return item !== null ? (JSON.parse(item) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue: React.Dispatch<React.SetStateAction<T>> = (value) => {
    setStoredValue((prev) => {
      const next = typeof value === 'function' ? (value as (prev: T) => T)(prev) : value;
      if (key) {
        try {
          localStorage.setItem(key, JSON.stringify(next));
        } catch {
          // quota exceeded or private browsing — state still updates in memory
        }
      }
      return next;
    });
  };

  return [storedValue, setValue];
}

export default useLocalStorage;
