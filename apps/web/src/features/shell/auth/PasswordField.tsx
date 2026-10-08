"use client";

import { Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Field, Input } from "@/components/ui/Field";

export const MIN_PASSWORD = 8;

export function PasswordField({ label, value, onChange, error, autoComplete, name, hint }: { readonly label: string; readonly value: string; readonly onChange: (v: string) => void; readonly error?: string; readonly autoComplete: string; readonly name: string; readonly hint?: string }) {
  const t = useTranslations("auth");
  const [visible, setVisible] = useState(false);
  return (
    <Field error={error} hint={hint} label={label} required>
      {(p) => (
        <div className="flex gap-2">
          <Input {...p} autoComplete={autoComplete} className="flex-1" name={name} onChange={(e) => onChange(e.target.value)} type={visible ? "text" : "password"} value={value} />
          <button aria-label={visible ? t("password.hide") : t("password.show")} aria-pressed={visible} className="flex min-h-12 min-w-12 items-center justify-center rounded-controls border border-[var(--ar-border)]" onClick={() => setVisible(!visible)} type="button">
            {visible ? <EyeOff aria-hidden="true" className="size-5" /> : <Eye aria-hidden="true" className="size-5" />}
          </button>
        </div>
      )}
    </Field>
  );
}
