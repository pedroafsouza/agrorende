"use client";

import { useCallback, useEffect, useState } from "react";

export const GUIDE_STEPS = ["welcome", "machine", "team", "workOrder", "done"] as const;
export type GuideStep = (typeof GUIDE_STEPS)[number];

/**
 * What the browser remembers about the guided first run. Completion itself comes from real
 * data (`useGuideProgress`); this only keeps the place in the guide and the admin's choices.
 */
export interface GuideState {
  readonly step: GuideStep;
  /** Machine created in step 2, pre-selected for the first work order in step 4. */
  readonly assetId?: string;
  readonly assetName?: string;
  readonly workOrderId?: string;
  /** The admin hid the progress card on the overview. */
  readonly dismissed?: boolean;
  /** The admin reached the last step and left the guide. */
  readonly finished?: boolean;
  /** The guide was already opened automatically once for this organisation. */
  readonly offered?: boolean;
}

const INITIAL: GuideState = { step: "welcome" };

export function guideStorageKey(orgId: string): string {
  return `agrorende.guide.v1.${orgId}`;
}

function isStep(value: unknown): value is GuideStep {
  return typeof value === "string" && (GUIDE_STEPS as readonly string[]).includes(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Last state written in this tab, read back when localStorage throws (private mode, quota). */
const memory = new Map<string, GuideState>();

export function readGuide(orgId: string): GuideState {
  try {
    const raw = window.localStorage.getItem(guideStorageKey(orgId));
    if (raw === null) return INITIAL;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const state: GuideState = {
      step: isStep(parsed.step) ? parsed.step : "welcome",
      ...(optionalString(parsed.assetId) === undefined ? {} : { assetId: optionalString(parsed.assetId) }),
      ...(optionalString(parsed.assetName) === undefined ? {} : { assetName: optionalString(parsed.assetName) }),
      ...(optionalString(parsed.workOrderId) === undefined ? {} : { workOrderId: optionalString(parsed.workOrderId) }),
      ...(parsed.dismissed === true ? { dismissed: true } : {}),
      ...(parsed.finished === true ? { finished: true } : {}),
      ...(parsed.offered === true ? { offered: true } : {}),
    };
    return state;
  } catch {
    return memory.get(orgId) ?? INITIAL;
  }
}

/** Fired on `window` after every write so the modal, the overview card and the page stay in step. */
export const GUIDE_CHANGE_EVENT = "agrorende:guide-change";

export function writeGuide(orgId: string, state: GuideState): void {
  memory.set(orgId, state);
  try {
    window.localStorage.setItem(guideStorageKey(orgId), JSON.stringify(state));
  } catch {
    // Private mode or a full quota: the guide still works, it just will not resume.
  }
  window.dispatchEvent(new CustomEvent<{ orgId: string; state: GuideState }>(GUIDE_CHANGE_EVENT, { detail: { orgId, state } }));
}

/**
 * Guide state for one organisation. `ready` stays false until the browser copy is read, so the
 * server render and the first client render agree and nothing redirects on stale defaults.
 */
export function useGuideState(orgId: string | undefined) {
  const [state, setState] = useState<GuideState>(INITIAL);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (orgId === undefined) return undefined;
    setState(readGuide(orgId));
    setReady(true);
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{ orgId: string; state: GuideState } | undefined>).detail;
      if (detail?.orgId === orgId) setState(detail.state);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === guideStorageKey(orgId)) setState(readGuide(orgId));
    };
    window.addEventListener(GUIDE_CHANGE_EVENT, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(GUIDE_CHANGE_EVENT, onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, [orgId]);
  const update = useCallback(
    (patch: Partial<GuideState>) => {
      if (orgId === undefined) {
        setState((current) => ({ ...current, ...patch }));
        return;
      }
      // Read the stored copy so a patch from one instance never overwrites another's newer write.
      writeGuide(orgId, { ...readGuide(orgId), ...patch });
    },
    [orgId],
  );
  return { state, ready, update } as const;
}
