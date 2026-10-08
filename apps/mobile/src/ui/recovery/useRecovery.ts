import { getErrorMeta, isAppErrorCode, type AppErrorCode, type RecoveryPattern } from "@agrorende/contracts/errors";
import { useSyncExternalStore } from "react";
import { Linking } from "react-native";

import { recoveryConfig, type RecoveryContext } from "./config";

export type RecoveryHandlers = Partial<Record<Lowercase<Exclude<RecoveryPattern, "AUTO">>, () => void>>;

export interface RecoveryAction {
  readonly pattern: RecoveryPattern;
  readonly labelKey: string;
  readonly run: () => void;
}

export interface Recovery {
  readonly code: AppErrorCode;
  readonly titleKey: string;
  readonly bodyKey: string;
  readonly actionKey: string;
  readonly patterns: readonly RecoveryPattern[];
  readonly surface: string;
  readonly retryable: boolean;
  /** First runnable action in catalog order; `undefined` for AUTO-only errors. */
  readonly primary: RecoveryAction | undefined;
  readonly actions: readonly RecoveryAction[];
  readonly canAskOffice: boolean;
  readonly canSendDiagnostics: boolean;
}

const DEFAULT_LABEL: Readonly<Record<RecoveryPattern, string>> = {
  AUTO: "ui.recovery.auto",
  RETRY: "ui.action.retry",
  FIX: "ui.recovery.fix",
  ALT: "ui.recovery.alt",
  DRAFT: "ui.recovery.draft",
  UNDO: "ui.action.undo",
  RESTORE: "ui.recovery.restore",
  SETTINGS: "ui.recovery.settings",
  REAUTH: "ui.recovery.reauth",
  UPDATE: "ui.recovery.update",
  OFFICE: "ui.recovery.office",
  DIAG: "ui.recovery.diag",
  HANDOFF: "ui.recovery.handoff",
  FALLBACK: "ui.recovery.fallback",
};

/** Pure resolver behind `useRecovery`, exported for non-React callers and tests. */
export function resolveRecovery(code: string, handlers: RecoveryHandlers = {}, context: Omit<RecoveryContext, "code"> = {}): Recovery {
  const safe: AppErrorCode = isAppErrorCode(code) ? code : "INTERNAL";
  const meta = getErrorMeta(safe);
  const config = recoveryConfig.getState();
  const builtIn: RecoveryHandlers = {
    settings: () => {
      Linking.openSettings().catch(() => undefined);
    },
    ...(config.reauth === undefined ? {} : { reauth: config.reauth }),
    ...(config.update === undefined ? {} : { update: config.update }),
    ...(config.sendDiagnostics === undefined
      ? {}
      : {
          diag: () => {
            config.sendDiagnostics?.({ code: safe, ...context }).catch(() => undefined);
          },
        }),
  };
  const all = { ...builtIn, ...handlers };
  const actions: RecoveryAction[] = [];
  (meta.recovery as readonly RecoveryPattern[]).forEach((pattern, index) => {
    if (pattern === "AUTO" || pattern === "OFFICE") return;
    const run = all[pattern.toLowerCase() as keyof RecoveryHandlers];
    if (run === undefined) return;
    actions.push({ pattern, labelKey: index === 0 ? `errors.${safe}.action` : DEFAULT_LABEL[pattern], run });
  });
  return {
    code: safe,
    titleKey: `errors.${safe}.title`,
    bodyKey: `errors.${safe}.body`,
    actionKey: `errors.${safe}.action`,
    patterns: meta.recovery,
    surface: meta.surface,
    retryable: meta.retryable,
    primary: actions[0],
    actions,
    canAskOffice: (meta.recovery as readonly string[]).includes("OFFICE"),
    canSendDiagnostics: (meta.recovery as readonly string[]).includes("DIAG") && config.sendDiagnostics !== undefined,
  };
}

/** Copy + actions for an error code from the shared catalog (ERRORS.md, R16). */
export function useRecovery(code: string, handlers: RecoveryHandlers = {}, context: Omit<RecoveryContext, "code"> = {}): Recovery {
  useSyncExternalStore(recoveryConfig.subscribe, recoveryConfig.getState);
  return resolveRecovery(code, handlers, context);
}
