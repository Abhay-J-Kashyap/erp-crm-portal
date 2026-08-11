import { useEffect, useState } from "react";

/**
 * Returns `value` only after it has stopped changing for `delay` ms.
 *
 * THE CLEANUP FUNCTION IS THE MECHANISM.
 * `return () => clearTimeout(timer)` runs BEFORE the effect re-runs. So
 * every keystroke cancels the previous pending timer and starts a new
 * one — only the final keystroke's timer ever fires.
 *
 * Without this, typing "steel" sends 5 requests, 4 of them wasted, and
 * their responses can arrive out of order so the wrong result wins.
 */
export function useDebounce<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
