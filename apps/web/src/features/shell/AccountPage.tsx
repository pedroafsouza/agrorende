"use client";

import { KeyRound, Trash2 } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Card, Detail } from "@/components/data/Detail";
import { LoadingState } from "@/components/data/States";
import { ErrorAlert } from "@/components/recovery/ErrorAlert";
import { PageHeader } from "@/components/shell/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button, buttonVariants } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Input } from "@/components/ui/Field";
import { NotificationPrefsCard } from "@/features/settings/NotificationPrefsCard";
import { useMe } from "@/features/shell/useMe";
import { api } from "@/lib/api";

const METHODS = ["PASSWORD", "GOOGLE", "APPLE"] as const;

/**
 * The web has no outbox or media queue, so the client-side pending-data guard of A§7.9 is always
 * satisfied here; the user still types their e-mail (or name) to confirm the irreversible delete.
 */
export function AccountPage() {
  const t = useTranslations("auth");
  const admin = useTranslations("admin");
  const common = useTranslations("common");
  const me = useMe();
  const [deleting, setDeleting] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  if (me.isLoading) return <LoadingState />;
  if (me.error !== null || me.data === undefined) return <ErrorAlert error={me.error} onRetry={() => void me.refetch()} />;
  const user = me.data.user;
  const methods = (me.data.signInMethods ?? []).map((m) => m.toUpperCase());
  const expected = (user.email ?? user.name).trim().toLowerCase();
  const matches = typed.trim().toLowerCase() === expected;

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await api("/auth/me", { method: "DELETE", body: { confirm: true } });
      window.location.assign("/login");
    } catch (caught) {
      setError(caught);
      setBusy(false);
    }
  };

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader title={t("account.title")} />
      <Card title={t("account.profile")}>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Detail label={t("account.name")} value={user.name} />
          <Detail label={t("fields.email")} value={user.email} />
          <Detail label={t("account.role")} value={admin(`roles.${user.role}`)} />
        </dl>
      </Card>
      <Card title={t("account.methods")}>
        <ul className="flex flex-col gap-2">
          {METHODS.map((m) => (
            <li className="flex min-h-12 items-center justify-between gap-2" key={m}>
              <span>{t(`account.method.${m}`)}</span>
              {methods.includes(m) ? <Badge tone="success">{t("account.linked")}</Badge> : <Badge tone="neutral">{t("account.notLinked")}</Badge>}
            </li>
          ))}
        </ul>
        <Link className={`${buttonVariants({ variant: "secondary" })} mt-3`} href="/change-password?next=/account">
          <KeyRound aria-hidden="true" className="size-4" />
          {t("account.changePassword")}
        </Link>
      </Card>
      <NotificationPrefsCard />
      <Card title={t("account.dangerZone")}>
        <p className="mb-3 text-[var(--ar-text-muted)]">{t("account.deleteBody")}</p>
        <Button icon={<Trash2 aria-hidden="true" className="size-4" />} onClick={() => { setTyped(""); setError(null); setDeleting(true); }} variant="danger">
          {t("account.delete")}
        </Button>
      </Card>
      <Dialog
        closeLabel={common("actions.close")}
        footer={
          <>
            <Button onClick={() => setDeleting(false)} variant="secondary">
              {common("actions.cancel")}
            </Button>
            <Button busy={busy} data-testid="account-delete-confirm" disabled={!matches} onClick={() => void remove()} variant="danger">
              {t("account.deleteConfirm")}
            </Button>
          </>
        }
        onClose={() => setDeleting(false)}
        open={deleting}
        title={t("account.deleteTitle")}
      >
        <p>{t("account.deleteWarning")}</p>
        {error === null ? null : <ErrorAlert error={error} />}
        <Field hint={t("account.typeHint", { value: user.email ?? user.name })} label={t("account.typeLabel")}>
          {(p) => <Input {...p} autoComplete="off" onChange={(e) => setTyped(e.target.value)} value={typed} />}
        </Field>
      </Dialog>
    </div>
  );
}
