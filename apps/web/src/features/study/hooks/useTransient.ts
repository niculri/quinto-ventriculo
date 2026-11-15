// A value that goes back to empty 3 s after it is set (a toast's message).
import { useEffect, useState } from 'react';

export function useTransient<T>(empty: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(empty);
  useEffect(() => {
    if (!value) return;
    const id = setTimeout(() => setValue(empty), 3000);
    return () => clearTimeout(id);
  }, [value, empty]);
  return [value, setValue];
}
