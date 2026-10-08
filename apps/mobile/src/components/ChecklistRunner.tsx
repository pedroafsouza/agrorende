import type { ChecklistItem, ChecklistResponse } from "@agrorende/contracts/checklist";

import { notImplemented } from "../lib/notImplemented";

export type ChecklistRunnerProps = { readonly items: readonly ChecklistItem[]; readonly responses: readonly ChecklistResponse[]; readonly previousResponses?: readonly ChecklistResponse[]; readonly onChange: (responses: readonly ChecklistResponse[]) => void };
export function ChecklistRunner(_props: ChecklistRunnerProps): never { return notImplemented("components.ChecklistRunner"); }
