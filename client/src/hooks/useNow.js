import { useEffect, useState } from 'react';

/** Current time that re-renders every `intervalMs` — keeps countdowns and "now" markers live. */
export function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export default useNow;
