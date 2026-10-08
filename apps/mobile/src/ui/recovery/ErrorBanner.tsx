import type { AppErrorCode } from "@agrorende/contracts/errors";

import { Banner, type BannerTone } from "../Banner";
import { useRecovery, type RecoveryHandlers } from "./useRecovery";

export type ErrorBannerProps = {
  readonly code: AppErrorCode;
  readonly handlers?: RecoveryHandlers;
  readonly onDismiss?: () => void;
  readonly tone?: BannerTone;
};

export function ErrorBanner({ code, handlers, onDismiss, tone = "warning" }: ErrorBannerProps) {
  const recovery = useRecovery(code, handlers);
  const [primary, secondary] = recovery.actions;
  return (
    <Banner
      testID={`error-banner-${code}`}
      tone={tone}
      titleKey={recovery.titleKey}
      bodyKey={recovery.bodyKey}
      action={primary === undefined ? undefined : { labelKey: primary.labelKey, onPress: primary.run }}
      secondaryAction={secondary === undefined ? undefined : { labelKey: secondary.labelKey, onPress: secondary.run }}
      onDismiss={onDismiss}
    />
  );
}
