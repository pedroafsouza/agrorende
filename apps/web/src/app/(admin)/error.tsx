"use client";

import { ErrorAlert } from "@/components/recovery/ErrorAlert";

/** Route-level boundary: the shell stays, the page shows the recovery copy and a retry (REC-01). */
export default function AdminError({ error, reset }: { readonly error: Error & { digest?: string }; readonly reset: () => void }) {
  return <ErrorAlert error={error} onRetry={reset} />;
}
