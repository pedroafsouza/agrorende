import type { ReactNode } from "react";

import type { MessageKey } from "../i18n/messages";
import { EmptyState, type EmptyStateProps } from "./EmptyState";
import { ErrorState } from "./ErrorState";
import { Skeleton } from "./Skeleton";

export type LoadState = "loading" | "empty" | "error" | "ready";

export type StateViewProps = {
  readonly state: LoadState;
  readonly empty?: EmptyStateProps;
  readonly errorTitleKey?: MessageKey;
  readonly errorBodyKey?: MessageKey;
  readonly onRetry?: () => void;
  readonly children: ReactNode;
};

/** The four screen states (R13); offline is shown by `OfflineBanner` on the screen. */
export function StateView({ state, empty, errorTitleKey, errorBodyKey, onRetry, children }: StateViewProps) {
  if (state === "loading") return <Skeleton />;
  if (state === "error") return <ErrorState titleKey={errorTitleKey} bodyKey={errorBodyKey} onRetry={onRetry} />;
  if (state === "empty") return <EmptyState {...empty} />;
  return <>{children}</>;
}
