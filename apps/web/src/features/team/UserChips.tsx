"use client";

import { AlertTriangle, CheckCircle2, KeyRound, MailQuestion, MinusCircle } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/Badge";

import { type TeamUser, userState } from "./types";

const s = "size-4";

export function UserStateChip({ user }: { readonly user: TeamUser }) {
  const t = useTranslations("team");
  const state = userState(user);
  const tone = state === "ACTIVE" ? "success" : state === "INVITED" ? "info" : state === "DISABLED" ? "neutral" : "warning";
  const glyph = state === "ACTIVE" ? <CheckCircle2 className={s} /> : state === "INVITED" ? <MailQuestion className={s} /> : state === "DISABLED" ? <MinusCircle className={s} /> : <KeyRound className={s} />;
  return (
    <span className="flex flex-wrap gap-1">
      <Badge icon={glyph} tone={tone}>
        {t(`state.${state}`)}
      </Badge>
      {user.joinedWithOtherEmail === true ? (
        <Badge icon={<AlertTriangle className={s} />} tone="warning">
          {t("state.otherEmail")}
        </Badge>
      ) : null}
    </span>
  );
}
