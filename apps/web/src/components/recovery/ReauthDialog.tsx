"use client";

import { LogIn } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Input } from "@/components/ui/Field";
import { api, isApiError, registerReauthWaiter } from "@/lib/api";

import { ErrorAlert } from "./ErrorAlert";

/**
 * Session expired mid-edit: asks for the password in a modal and resumes the paused request,
 * so the open form keeps its values (A§14.2, EC-AUTH-02).
 */
export function ReauthDialog() {
  const t = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  useEffect(() => {
    registerReauthWaiter(
      () =>
        new Promise<boolean>((resolve) => {
          resolver.current = resolve;
          setOpen(true);
        }),
    );
    return () => registerReauthWaiter(null);
  }, []);

  const finish = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOpen(false);
    setPassword("");
    setError(null);
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api("/auth/login", { method: "POST", body: { email, password } });
      finish(true);
    } catch (caught) {
      setError(caught);
      if (isApiError(caught, "ACCOUNT_DISABLED")) window.location.assign("/login");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      closeLabel={t("actions.close")}
      description={t("reauth.body")}
      dismissible={false}
      footer={
        <>
          <Button onClick={() => window.location.assign("/login")} variant="ghost">
            {t("reauth.signOut")}
          </Button>
          <Button busy={busy} icon={<LogIn aria-hidden="true" className="size-4" />} onClick={() => void submit()} variant="primary">
            {t("reauth.submit")}
          </Button>
        </>
      }
      onClose={() => finish(false)}
      open={open}
      title={t("reauth.title")}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {error === null ? null : <ErrorAlert compact error={error} />}
        <Field label={t("reauth.email")}>{(p) => <Input {...p} autoComplete="email" onChange={(e) => setEmail(e.target.value)} type="email" value={email} />}</Field>
        <Field label={t("reauth.password")}>
          {(p) => <Input {...p} autoComplete="current-password" onChange={(e) => setPassword(e.target.value)} type="password" value={password} />}
        </Field>
        <button className="hidden" type="submit" />
      </form>
    </Dialog>
  );
}
