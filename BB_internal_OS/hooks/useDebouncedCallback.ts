"use client";

import { useCallback, useEffect, useRef } from "react";

/** Runs `fn` at most once per `delayMs` after the last call. */
export function useDebouncedCallback<T extends (...args: never[]) => void>(fn: T, delayMs = 2500) {
  const fnRef = useRef(fn);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  const schedule = useCallback(
    (...args: Parameters<T>) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null;
        fnRef.current(...args);
      }, delayMs);
    },
    [delayMs],
  );

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    [],
  );

  return schedule;
}
