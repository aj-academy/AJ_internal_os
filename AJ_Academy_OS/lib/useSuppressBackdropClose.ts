"use client";

import { useCallback, useEffect, useRef } from "react";

export const FILE_PICKER_ARM_EVENT = "aj-file-picker-arm";

/** Call before opening an OS file picker so modal backdrops ignore the return tap. */
export function armFilePickerBackdropGuard(ms = 1500) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(FILE_PICKER_ARM_EVENT, { detail: { ms } }));
}

/**
 * Prevents modal/drawer backdrop from closing when the OS file picker closes.
 * On mobile, the touch that dismisses the picker often lands on the backdrop.
 */
export function useSuppressBackdropClose(ms = 1200) {
  const untilRef = useRef(0);

  const arm = useCallback(
    (customMs?: number) => {
      untilRef.current = Date.now() + (customMs ?? ms);
    },
    [ms],
  );

  const shouldIgnoreClose = useCallback(() => Date.now() < untilRef.current, []);

  const onBackdropClick = useCallback(
    (close: () => void) => {
      if (shouldIgnoreClose()) return;
      close();
    },
    [shouldIgnoreClose],
  );

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") arm();
    };
    const onFocus = () => arm();
    const onArmEvent = (e: Event) => {
      const detail = (e as CustomEvent<{ ms?: number }>).detail;
      arm(detail?.ms);
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onFocus);
    window.addEventListener(FILE_PICKER_ARM_EVENT, onArmEvent);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(FILE_PICKER_ARM_EVENT, onArmEvent);
    };
  }, [arm]);

  return { arm, shouldIgnoreClose, onBackdropClick };
}
