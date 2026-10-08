import type { ReactNode } from "react";

import { notImplemented } from "../lib/notImplemented";

export type WizardStep = { readonly id: string; readonly content: ReactNode; readonly validate?: () => Promise<boolean> | boolean };
export type WizardProps = { readonly draftId?: string; readonly steps: readonly WizardStep[]; readonly onSubmit: () => Promise<void> };
export function Wizard(_props: WizardProps): never { return notImplemented("components.Wizard"); }
