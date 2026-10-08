"use client";

import { TenancyOrgBanner } from "@/features/tenancy/TenancyOrgBanner";

/**
 * Mounts the role-aware T20 organisation banner (trial, past due, suspended, cancelled) above page
 * content on every office page (T20.7, EC-OPS-29). The banner renders nothing for an ACTIVE organisation.
 */
export function OrgBanner({ supportWhatsApp = null }: { readonly supportWhatsApp?: string | null }) {
  return (
    <div className="px-4 pt-4 empty:hidden lg:px-6">
      <TenancyOrgBanner supportWhatsApp={supportWhatsApp} />
    </div>
  );
}
