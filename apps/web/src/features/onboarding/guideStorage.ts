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
    return INITIAL;
  }
}

export function writeGuide(orgId: string, state: GuideState): void {
  try {
    window.localStorage.setItem(guideStorageKey(orgId), JSON.stringify(state));
  } catch {
    // Private mode or a full quota: the guide still works, it just will not resume.
  }
}

/**
 * Guide state for one organisation. `ready` stays false until the browser copy is read, so the
 * server render and the first client render agree and nothing redirects on stale defaults.
 */
export function useGuideState(orgId: string | undefined) {
  const [state, setState] = useState<GuideState>(INITIAL);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (orgId === undefined) return;
    setState(readGuide(orgId));
    setReady(true);
  }, [orgId]);
  const update = useCallback(
    (patch: Partial<GuideState>) => {
      setState((current) => {
        const next = { ...current, ...patch };
        if (orgId !== undefined) writeGuide(orgId, next);
        return next;
      });
    },
    [orgId],
  );
  return { state, ready, update } as const;
}
