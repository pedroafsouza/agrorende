"use client";

import { campoClaroPalette } from "@agrorende/design-tokens";
import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { ConditionBadge, PriorityBadge, StatusBadge, SyncHealthBadge } from "@/components/data/badges";
import { Card } from "@/components/data/Detail";
import { EmptyState, LoadingState, OfflineState } from "@/components/data/States";
import { MoneyInput } from "@/components/forms/MoneyInput";
import { ErrorAlert } from "@/components/recovery/ErrorAlert";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { Checkbox, Field, Input, Select } from "@/components/ui/Field";
import { ApiError } from "@/lib/api";

import { ThemeToggle } from "../ThemeToggle";

const VARS = ["--ar-bg", "--ar-surface", "--ar-surface-muted", "--ar-text", "--ar-text-muted", "--ar-border", "--ar-primary", "--ar-link", "--ar-success-bg", "--ar-warning-bg", "--ar-danger-bg", "--ar-info-bg"] as const;

function Swatch({ name, color }: { readonly name: string; readonly color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span aria-hidden="true" className="size-10 shrink-0 rounded-controls border border-[var(--ar-border)]" style={{ background: color }} />
      <span className="font-mono text-sm">{name}</span>
    </div>
  );
}

function Nav() {
  const t = useTranslations("admin");
  return (
    <nav aria-label={t("styleGuide.title")} className="flex flex-wrap gap-2">
      <Link className="inline-flex min-h-12 items-center px-2 font-semibold text-[var(--ar-link)]" href="/style-guide">{t("styleGuide.components")}</Link>
      <Link className="inline-flex min-h-12 items-center px-2 font-semibold text-[var(--ar-link)]" href="/style-guide/tokens">{t("styleGuide.tokens")}</Link>
      <Link className="inline-flex min-h-12 items-center px-2 font-semibold text-[var(--ar-link)]" href="/style-guide/states">{t("styleGuide.states")}</Link>
      <ThemeToggle />
    </nav>
  );
}

export function StyleGuideTokens() {
  const t = useTranslations("admin");
  const flat: [string, string][] = Object.entries(campoClaroPalette).flatMap(([k, v]): [string, string][] => (typeof v === "string" ? [[k, v]] : Object.entries(v).map(([sub, c]): [string, string] => [`${k}.${sub}`, c])));
  return (
    <div className="flex flex-col gap-6">
      <PageHeader subtitle={t("styleGuide.subtitle")} title={t("styleGuide.tokens")} />
      <Nav />
      <Card title={t("styleGuide.palette")}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{flat.map(([k, v]) => <Swatch color={v} key={k} name={k} />)}</div>
      </Card>
      <Card title={t("styleGuide.themeVars")}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{VARS.map((v) => <Swatch color={`var(${v})`} key={v} name={v} />)}</div>
      </Card>
    </div>
  );
}

export function StyleGuideComponents() {
  const t = useTranslations("admin");
  const [cents, setCents] = useState<number | null>(125_000);
  const [checked, setChecked] = useState(true);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader subtitle={t("styleGuide.subtitle")} title={t("styleGuide.title")} />
      <Nav />
      <Card title={t("styleGuide.buttons")}>
        <div className="flex flex-wrap gap-2">
          <Button icon={<Plus aria-hidden="true" className="size-5" />} size="primary" variant="primary">{t("styleGuide.primary")}</Button>
          <Button variant="secondary">{t("styleGuide.secondary")}</Button>
          <Button variant="ghost">{t("styleGuide.ghost")}</Button>
          <Button icon={<Trash2 aria-hidden="true" className="size-4" />} variant="danger">{t("styleGuide.danger")}</Button>
          <Button busy variant="primary">{t("styleGuide.busy")}</Button>
          <Button disabled>{t("styleGuide.disabled")}</Button>
        </div>
      </Card>
      <Card title={t("styleGuide.badges")}>
        <div className="flex flex-wrap gap-2">
          <ConditionBadge condition="OPERATIONAL" />
          <ConditionBadge condition="NEEDS_REPAIR" />
          <ConditionBadge condition="IN_REPAIR" />
          <ConditionBadge condition="OUT_OF_SERVICE" />
          <ConditionBadge condition="RETIRED" />
          <PriorityBadge priority="CRITICAL" />
          <PriorityBadge priority="LOW" />
          <StatusBadge kind="workOrder" status="IN_PROGRESS" />
          <StatusBadge kind="rental" status="ACTIVE" />
          <SyncHealthBadge health="OK" />
          <SyncHealthBadge health="STUCK" />
        </div>
      </Card>
      <Card title={t("styleGuide.forms")}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field hint={t("styleGuide.hint")} label={t("styleGuide.text")} required>
            {(p) => <Input {...p} defaultValue={t("styleGuide.sample")} />}
          </Field>
          <Field error={t("styleGuide.errorText")} label={t("styleGuide.invalid")}>
            {(p) => <Input {...p} defaultValue="" />}
          </Field>
          <Field label={t("styleGuide.money")}>
            {(p) => <MoneyInput {...p} cents={cents} onChange={setCents} />}
          </Field>
          <Field label={t("styleGuide.select")}>
            {(p) => (
              <Select {...p}>
                <option>{t("styleGuide.sample")}</option>
              </Select>
            )}
          </Field>
          <Checkbox checked={checked} label={t("styleGuide.checkbox")} onChange={(e) => setChecked(e.target.checked)} />
        </div>
      </Card>
    </div>
  );
}

export function StyleGuideStates() {
  const t = useTranslations("admin");
  return (
    <div className="flex flex-col gap-6">
      <PageHeader subtitle={t("styleGuide.subtitle")} title={t("styleGuide.states")} />
      <Nav />
      <Card title={t("styleGuide.loading")}>
        <LoadingState rows={3} />
      </Card>
      <Card title={t("styleGuide.empty")}>
        <EmptyState action={<Button variant="primary">{t("styleGuide.primary")}</Button>} body={t("styleGuide.emptyBody")} title={t("styleGuide.emptyTitle")} />
      </Card>
      <Card title={t("styleGuide.error")}>
        <div className="flex flex-col gap-3">
          <ErrorAlert error={new ApiError({ code: "INTERNAL", status: 500, retryable: true, ref: "req_demo" })} onRetry={() => undefined} />
          <ErrorAlert error={new ApiError({ code: "RECORD_IN_USE", status: 409 })} />
          <ErrorAlert compact error={new ApiError({ code: "VALIDATION_FAILED", status: 400 })} />
        </div>
      </Card>
      <Card title={t("styleGuide.offline")}>
        <OfflineState onRetry={() => undefined} />
      </Card>
    </div>
  );
}
