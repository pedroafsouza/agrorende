import { useCallback, useEffect, useState } from "react";

import { watchForegroundFix, type ForegroundFix } from "../../location/watch";

import { EMPTY_ARRIVAL_MEMORY, rememberDeclined, rememberShown, shouldPromptArrival, type ArrivalFix, type ArrivalMemory, type ArrivalTarget } from "./arrivalPrompt";

// Lives for the app session, so leaving and reopening the job does not ask again.
let memory: ArrivalMemory = EMPTY_ARRIVAL_MEMORY;

export function resetArrivalMemory(): void {
  memory = EMPTY_ARRIVAL_MEMORY;
}

/**
 * Watches foreground location only while the job is EN_ROUTE and only when permission was already
 * granted (it never asks). Returns the fix that opened the prompt, or undefined.
 */
export function useArrivalPrompt(target: ArrivalTarget | undefined, now: () => number = Date.now, watch: typeof watchForegroundFix = watchForegroundFix) {
  const [fix, setFix] = useState<ArrivalFix | undefined>();
  const active = target !== undefined && target.status === "EN_ROUTE";
  const key = active ? `${target.workOrderId}:${target.lat}:${target.lng}:${target.radiusM ?? ""}` : undefined;

  useEffect(() => {
    if (!active || target === undefined) return undefined;
    let stop: (() => void) | undefined;
    let cancelled = false;
    const onFix = (next: ForegroundFix) => {
      const at = now();
      if (!shouldPromptArrival(next, target, memory, at)) return;
      memory = rememberShown(memory, target.workOrderId, at);
      setFix(next);
    };
    watch(onFix)
      .then((stopWatching) => {
        if (cancelled) stopWatching();
        else stop = stopWatching;
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      stop?.();
    };
    // `key` captures every field of `target` the effect reads.
  }, [key]);

  const decline = useCallback(() => {
    if (target !== undefined) memory = rememberDeclined(memory, target.workOrderId, now());
    setFix(undefined);
  }, [target, now]);
  const close = useCallback(() => setFix(undefined), []);

  return { fix: active ? fix : undefined, decline, close };
}
