"use client";

import { RealtimeServerEvents } from "@agrorende/contracts/realtime";
import { useQuery } from "@tanstack/react-query";
import { MessageSquare, Send } from "lucide-react";
import { NextIntlClientProvider, useLocale, useMessages, useTimeZone, useTranslations } from "next-intl";
import { useState, type FormEvent, type ReactElement } from "react";

import { EmptyState, LoadingState } from "@/components/data/States";
import { ErrorAlert } from "@/components/recovery/ErrorAlert";
import { Button } from "@/components/ui/Button";
import { Field, Textarea } from "@/components/ui/Field";
import { useRealtimeEvent } from "@/features/shell/useRealtime";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useSave } from "@/lib/useSave";

import enComments from "../../../messages/en/comments.json";
import ptComments from "../../../messages/pt-BR/comments.json";

import { COMMENT_MAX_LENGTH, type CommentItem, type CommentParentType } from "./types";

export type { CommentItem, CommentParentType } from "./types";

export interface CommentThreadProps {
  readonly entityType: CommentParentType;
  readonly entityId: string;
}

function commentsKey(entityType: CommentParentType, entityId: string) {
  return ["comments", entityType, entityId] as const;
}

/**
 * Comment thread on the report, work-order and rental detail pages (PLT-10). Those pages belong to
 * other features and load their own namespaces, so the thread brings its `comments` messages along.
 */
export function CommentThread(props: CommentThreadProps): ReactElement {
  const locale = useLocale();
  const timeZone = useTimeZone();
  const messages = useMessages();
  const own = locale.startsWith("pt") ? ptComments : enComments;
  return (
    <NextIntlClientProvider locale={locale} messages={{ ...messages, comments: own }} timeZone={timeZone}>
      <Thread {...props} />
    </NextIntlClientProvider>
  );
}

function Thread({ entityType, entityId }: CommentThreadProps): ReactElement {
  const t = useTranslations("comments");
  const locale = useLocale();
  const query = useQuery({
    queryKey: commentsKey(entityType, entityId),
    queryFn: () => api<{ items: CommentItem[] }>("/comments", { query: { entityType, entityId } }),
  });
  const [body, setBody] = useState("");
  const [touched, setTouched] = useState(false);
  const [save, saveState] = useSave("comments", (text: string) => api<CommentItem>("/comments", { method: "POST", body: { entityType, entityId, body: text } }), () => {
    setBody("");
    setTouched(false);
  });

  useRealtimeEvent(RealtimeServerEvents.entityChanged, (payload) => {
    const data = payload as { entityType?: string; parent?: { entityType?: string; entityId?: string } } | null;
    if (data?.entityType === "COMMENT" && data.parent?.entityId === entityId) void query.refetch();
  });

  const trimmed = body.trim();
  const fieldError = touched && trimmed.length === 0 ? t("errors.required") : trimmed.length > COMMENT_MAX_LENGTH ? t("errors.tooLong", { max: COMMENT_MAX_LENGTH }) : undefined;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (trimmed.length === 0 || trimmed.length > COMMENT_MAX_LENGTH) return;
    void save(trimmed);
  };

  const items = query.data?.items ?? [];
  return (
    <section aria-labelledby={`comments-${entityId}`} className="flex flex-col gap-4 rounded-cards border border-[var(--ar-border)] bg-[var(--ar-surface)] p-4">
      <h2 className="flex items-center gap-2 text-lg font-semibold" id={`comments-${entityId}`}>
        <MessageSquare aria-hidden="true" className="size-5" />
        {t("title")}
        {items.length > 0 ? <span className="text-sm font-normal text-[var(--ar-text-muted)]">{t("count", { count: items.length })}</span> : null}
      </h2>
      {query.isLoading ? (
        <LoadingState rows={2} />
      ) : query.error !== null ? (
        <ErrorAlert error={query.error} onRetry={() => void query.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState body={t("empty.body")} icon={<MessageSquare className="size-8" />} title={t("empty.title")} />
      ) : (
        <ol className="flex flex-col gap-3">
          {items.map((item) => (
            <li className="rounded-controls bg-[var(--ar-surface-muted)] p-3" key={item.id}>
              <p className="flex flex-wrap items-baseline gap-2 text-sm">
                <span className="font-semibold">{item.authorName ?? t("unknownAuthor")}</span>
                <time className="text-[var(--ar-text-muted)]" dateTime={item.createdAt}>
                  {formatDateTime(item.createdAt, locale)}
                </time>
              </p>
              <p className="mt-1 whitespace-pre-wrap break-words">{item.body}</p>
            </li>
          ))}
        </ol>
      )}
      <form className="flex flex-col gap-2" noValidate onSubmit={submit}>
        <Field error={fieldError} label={t("form.label")}>
          {(props) => (
            <Textarea
              {...props}
              className="min-h-24 py-2"
              maxLength={COMMENT_MAX_LENGTH + 1}
              onBlur={() => setTouched(body.length > 0)}
              onChange={(event) => setBody(event.target.value)}
              placeholder={t("form.placeholder")}
              value={body}
            />
          )}
        </Field>
        {saveState.error === null ? null : <ErrorAlert error={saveState.error} onRetry={() => void save(trimmed)} />}
        <div>
          <Button busy={saveState.busy} icon={<Send aria-hidden="true" className="size-4" />} type="submit" variant="primary">
            {t("form.submit")}
          </Button>
        </div>
      </form>
    </section>
  );
}
