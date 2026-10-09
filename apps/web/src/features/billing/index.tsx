"use client";

import type { EntityType } from "@agrorende/contracts/enums";
import { NextIntlClientProvider, useLocale, useMessages, useTimeZone } from "next-intl";
import type { ReactElement } from "react";

import enBilling from "../../../messages/en/billing.json";
import ptBilling from "../../../messages/pt-BR/billing.json";

import { BillingActionsPanel } from "./BillingActionsPanel";

export interface BillingActionsProps {
  readonly entityType: Extract<EntityType, "WORK_ORDER" | "RENTAL">;
  readonly entityId: string;
}

/**
 * Billing mount point on the WO and rental detail pages. The host page loads its own namespaces,
 * so the `billing` messages are layered on top of the parent provider here.
 */
export function BillingActions({ entityType, entityId }: BillingActionsProps): ReactElement {
  const locale = useLocale();
  const messages = useMessages();
  const timeZone = useTimeZone();
  return (
    <NextIntlClientProvider locale={locale} messages={{ ...messages, billing: locale === "en" ? enBilling : ptBilling }} timeZone={timeZone}>
      <BillingActionsPanel entityId={entityId} entityType={entityType} />
    </NextIntlClientProvider>
  );
}
