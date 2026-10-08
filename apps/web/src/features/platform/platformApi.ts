"use client";

import { api, isApiError, type ApiRequest } from "@/lib/api";

/**
 * Staff calls use the `ar_platform` cookie only: no tenant refresh and no re-auth dialog. An expired
 * staff session sends the browser back to `/platform/login`.
 */
export async function platformApi<T>(path: string, request: ApiRequest = {}): Promise<T> {
  try {
    return await api<T>(`/platform${path}`, { ...request, skipAuthRetry: true });
  } catch (error) {
    if (isApiError(error, "UNAUTHENTICATED") && typeof window !== "undefined") {
      window.location.assign("/platform/login?error=UNAUTHENTICATED");
    }
    throw error;
  }
}
