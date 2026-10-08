"use client";

import { useTranslations } from "next-intl";

import { ApiError } from "@/lib/api";

export interface ErrorCopy {
  readonly code: string;
  readonly title: string;
  readonly body: string;
  readonly action: string | null;
  readonly ref: string | undefined;
  readonly retryable: boolean;
}

export function errorCode(error: unknown): string {
  if (error instanceof ApiError) return error.code;
  return "INTERNAL";
}

/** Resolves `errors.<CODE>.{title,body,action}` with the INTERNAL entry as the fallback (A§8, REC-01). */
export function useErrorCopy(): (error: unknown) => ErrorCopy {
  const t = useTranslations("errors");
  const common = useTranslations("common");
  return (error) => {
    const code = errorCode(error);
    const details = error instanceof ApiError ? toValues(error.details) : {};
    if (code === "BROWSER_OFFLINE") {
      return { code, title: common("offline.title"), body: common("offline.body"), action: common("actions.retry"), ref: undefined, retryable: true };
    }
    const key = t.has(`${code}.title`) ? code : "INTERNAL";
    return {
      code,
      title: t(`${key}.title`, details),
      body: t(`${key}.body`, details),
      action: t.has(`${key}.action`) ? t(`${key}.action`, details) : null,
      ref: error instanceof ApiError ? error.ref : undefined,
      retryable: error instanceof ApiError ? error.retryable : true,
    };
  };
}

function toValues(details: Readonly<Record<string, unknown>>): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(details)) {
    if (typeof value === "string" || typeof value === "number") out[key] = value;
    else if (Array.isArray(value)) out[key] = value.length;
  }
  return out;
}
