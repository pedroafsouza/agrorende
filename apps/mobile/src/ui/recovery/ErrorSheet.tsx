import type { AppErrorCode } from "@agrorende/contracts/errors";
import { Send } from "lucide-react-native";

import { BottomSheet } from "../BottomSheet";
import { Button } from "../Button";
import { Text } from "../Text";
import { AskOfficeButton } from "./AskOfficeButton";
import { useRecovery, type RecoveryHandlers } from "./useRecovery";

export type ErrorSheetProps = {
  readonly code: AppErrorCode | undefined;
  readonly onClose: () => void;
  readonly handlers?: RecoveryHandlers;
  readonly entityType?: string;
  readonly entityId?: string;
};

/** Blocking-but-recoverable errors: plain words, one primary action, Ask office, diagnostics. */
export function ErrorSheet({ code, onClose, handlers, entityType, entityId }: ErrorSheetProps) {
  const recovery = useRecovery(code ?? "INTERNAL", handlers, { ...(entityType === undefined ? {} : { entityType }), ...(entityId === undefined ? {} : { entityId }) });
  const diag = recovery.actions.find((a) => a.pattern === "DIAG");
  return (
    <BottomSheet testID={`error-sheet-${recovery.code}`} visible={code !== undefined} onClose={onClose} titleKey={recovery.titleKey}>
      <Text i18nKey={recovery.bodyKey} />
      {recovery.actions
        .filter((a) => a.pattern !== "DIAG")
        .map((action, index) => (
          <Button
            key={action.pattern}
            variant={index === 0 ? "primary" : "secondary"}
            labelKey={action.labelKey}
            onPress={() => {
              action.run();
              onClose();
            }}
          />
        ))}
      {recovery.canAskOffice ? <AskOfficeButton code={recovery.code} {...(entityType === undefined ? {} : { entityType })} {...(entityId === undefined ? {} : { entityId })} /> : null}
      {diag === undefined ? null : <Button variant="ghost" icon={Send} labelKey="ui.recovery.diag" onPress={diag.run} />}
      <Button variant="ghost" labelKey="ui.action.close" onPress={onClose} />
    </BottomSheet>
  );
}
