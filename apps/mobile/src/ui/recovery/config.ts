import type { AppErrorCode } from "@agrorende/contracts/errors";
import { createStore } from "zustand/vanilla";

export interface OfficeContact {
  readonly phone?: string;
  readonly whatsapp?: string;
  readonly name?: string;
}

export interface RecoveryContext {
  readonly code: AppErrorCode;
  readonly entityType?: string;
  readonly entityId?: string;
  readonly screen?: string;
}

/** App-wide recovery wiring set by the root layout (office contact from org settings, diagnostics sender). */
export interface RecoveryConfig {
  readonly office?: OfficeContact;
  readonly sendDiagnostics?: (context: RecoveryContext) => Promise<void>;
  readonly reauth?: () => void;
  readonly update?: () => void;
  readonly recordCrash?: (error: Error, screen?: string) => void;
}

export const recoveryConfig = createStore<RecoveryConfig>()(() => ({}));

export function configureRecovery(config: Partial<RecoveryConfig>): void {
  recoveryConfig.setState(config);
}
