import type { AppErrorCode } from "@agrorende/contracts/errors";
import { MessageCircle } from "lucide-react-native";
import { useState, useSyncExternalStore } from "react";
import { View } from "react-native";

import { useT } from "../../i18n/useT";
import { errorCodeOf } from "../../lib/errors";
import { Button } from "../Button";
import { recoveryConfig } from "./config";
import { InlineError } from "./InlineError";
import { contactOffice } from "./office";

export type AskOfficeButtonProps = {
  readonly code: AppErrorCode;
  readonly entityType?: string;
  readonly entityId?: string;
  readonly reference?: string;
  readonly compact?: boolean;
};

/** "Ask the office": WhatsApp with context, phone fallback, inline error when no contact is set. */
export function AskOfficeButton({ code, entityType, entityId, reference, compact = false }: AskOfficeButtonProps) {
  const t = useT();
  const config = useSyncExternalStore(recoveryConfig.subscribe, recoveryConfig.getState);
  const [failure, setFailure] = useState<AppErrorCode | undefined>();
  return (
    <View>
      <Button
        testID="ask-office"
        compact={compact}
        variant="secondary"
        icon={MessageCircle}
        labelKey="ui.recovery.office"
        onPress={() => {
          setFailure(undefined);
          const text = t("ui.recovery.officeMessage", { title: t(`errors.${code}.title`), code, reference: reference ?? entityId ?? "-" });
          contactOffice(config.office, { code, ...(entityType === undefined ? {} : { entityType }), ...(entityId === undefined ? {} : { entityId }) }, text).catch((error: unknown) => {
            setFailure(errorCodeOf(error, "OFFICE_CONTACT_MISSING"));
          });
        }}
      />
      {failure === undefined ? null : <InlineError code={failure} />}
    </View>
  );
}
