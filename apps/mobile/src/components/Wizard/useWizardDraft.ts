import { useCallback, useEffect, useRef, useState } from "react";

import type { DraftKind } from "../../db/schema";
import type { SqlDb } from "../../db/sql";
import { deleteDraft, loadDraft, saveDraft } from "../../lib/drafts";

export const WIZARD_AUTOSAVE_MS = 500;

export interface WizardDraftState<P> {
  readonly payload: P;
  readonly stepId: string | undefined;
  readonly hydrated: boolean;
  readonly draftId: string;
  readonly update: (patch: Partial<P> | ((current: P) => P)) => void;
  readonly setStepId: (stepId: string) => void;
  readonly flush: () => Promise<void>;
  readonly discard: () => Promise<void>;
}

export interface WizardDraftOptions<P> {
  readonly db: SqlDb | undefined;
  readonly draftId: string;
  readonly kind: DraftKind;
  readonly refId?: string;
  readonly initialPayload: P;
  readonly autosaveMs?: number;
  readonly now?: () => number;
}

/** Draft state with debounced autosave to `drafts` and resume from `draftId` (§13.3). */
export function useWizardDraft<P extends object>({ db, draftId, kind, refId, initialPayload, autosaveMs = WIZARD_AUTOSAVE_MS, now = Date.now }: WizardDraftOptions<P>): WizardDraftState<P> {
  const [payload, setPayload] = useState<P>(initialPayload);
  const [stepId, setStepIdState] = useState<string | undefined>();
  const [hydrated, setHydrated] = useState(db === undefined);
  const dirty = useRef(false);
  const latest = useRef({ payload, stepId });
  latest.current = { payload, stepId };

  useEffect(() => {
    if (db === undefined) return;
    let active = true;
    loadDraft<P>(db, draftId)
      .then((draft) => {
        if (!active) return;
        if (draft !== undefined) {
          setPayload({ ...initialPayload, ...draft.payload });
          setStepIdState(draft.step);
        }
        setHydrated(true);
      })
      .catch(() => {
        if (active) setHydrated(true);
      });
    return () => {
      active = false;
    };
    // initialPayload is only the seed; reloading on every render would discard edits.
  }, [db, draftId]);

  const persist = useCallback(async () => {
    if (db === undefined || !dirty.current) return;
    dirty.current = false;
    const { payload: p, stepId: s } = latest.current;
    await saveDraft(db, { id: draftId, kind, refId: refId ?? null, step: s ?? "", payload: p, updatedAt: new Date(now()).toISOString() });
  }, [db, draftId, kind, refId, now]);

  useEffect(() => {
    if (!hydrated || !dirty.current) return;
    const timer = setTimeout(() => {
      persist().catch(() => undefined);
    }, autosaveMs);
    return () => clearTimeout(timer);
  }, [payload, stepId, hydrated, autosaveMs, persist]);

  const update = useCallback((patch: Partial<P> | ((current: P) => P)) => {
    dirty.current = true;
    setPayload((current) => (typeof patch === "function" ? patch(current) : { ...current, ...patch }));
  }, []);

  const setStepId = useCallback((next: string) => {
    dirty.current = true;
    setStepIdState(next);
  }, []);

  const discard = useCallback(async () => {
    dirty.current = false;
    if (db !== undefined) await deleteDraft(db, draftId);
  }, [db, draftId]);

  return { payload, stepId, hydrated, draftId, update, setStepId, flush: persist, discard };
}
