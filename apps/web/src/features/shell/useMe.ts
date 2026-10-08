"use client";

import { useQuery } from "@tanstack/react-query";

import type { OrgStatus, Role } from "@agrorende/contracts/enums";

import { api } from "@/lib/api";

/** `GET /auth/me` (T02). Fields are optional because the shell must render while the endpoint evolves. */
export interface MeResponse {
  readonly user: { readonly id: string; readonly name: string; readonly email?: string | null; readonly role: Role; readonly locale?: string | null };
  readonly org?: { readonly id: string; readonly name: string; readonly status?: OrgStatus; readonly timezone?: string; readonly trialEndsAt?: string | null } | null;
  readonly signInMethods?: readonly string[];
  readonly settings?: Readonly<Record<string, unknown>> | null;
}

export function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: () => api<MeResponse>("/auth/me"), staleTime: 5 * 60_000 });
}
