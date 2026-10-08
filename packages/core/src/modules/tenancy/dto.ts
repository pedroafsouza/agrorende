import type { OrgStatus } from "@agrorende/contracts/enums";

/** Organisation status as served to tenant and staff screens. ISO dates or null. */
export interface OrgStatusDTO {
  readonly status: OrgStatus;
  readonly plan: string;
  readonly trialEndsAt: string | null;
  readonly pastDueAt: string | null;
  readonly suspendedAt: string | null;
  readonly cancelledAt: string | null;
  readonly purgeAfter: string | null;
}

/** One `OrgUsage` row (ARCHITECTURE §5.3). `month` is the first day of the month, `YYYY-MM-DD`. */
export interface OrgUsageDTO {
  readonly month: string;
  readonly activeFieldUsers: number;
  readonly officeUsers: number;
  readonly storageBytes: number;
  readonly assetCount: number;
  readonly updatedAt: string;
}

export type GettingStartedStepId = "assets" | "team" | "qr" | "app";

export interface GettingStartedDTO {
  readonly steps: readonly { readonly id: GettingStartedStepId; readonly completed: boolean }[];
  readonly completed: boolean;
  readonly dismissedAt: string | null;
}

/** `GET /api/v1/org/subscription` (ADMIN). */
export interface SubscriptionDTO extends OrgStatusDTO {
  readonly organizationId: string;
  readonly name: string;
  readonly terms: {
    readonly currentVersion: string;
    readonly acceptedVersion: string | null;
    readonly acceptedAt: string | null;
    readonly needsAcceptance: boolean;
  };
  readonly readOnly: boolean;
  readonly exportDeadline: string | null;
  readonly supportWhatsApp: string | null;
  readonly usage: readonly OrgUsageDTO[];
  readonly gettingStarted: GettingStartedDTO;
}

/** Staff list row: organisation metadata only, never tenant business data (TEN-06). */
export interface PlatformOrgRowDTO extends OrgStatusDTO {
  readonly id: string;
  readonly name: string;
  readonly signupSource: string | null;
  readonly expectedFieldUsers: string | null;
  readonly createdAt: string;
  readonly latestUsage: OrgUsageDTO | null;
}

export interface PlatformAdminDTO {
  readonly id: string;
  readonly name: string;
  readonly email: string | null;
  readonly isActive: boolean;
}

export interface PlatformAuditDTO {
  readonly id: string;
  readonly actorEmail: string;
  readonly action: string;
  readonly reason: string | null;
  readonly details: unknown;
  readonly createdAt: string;
}

export interface PlatformOrgDetailDTO extends PlatformOrgRowDTO {
  readonly timezone: string;
  readonly locale: string;
  readonly officePhone: string | null;
  readonly termsVersion: string | null;
  readonly termsAcceptedAt: string | null;
  readonly usage: readonly OrgUsageDTO[];
  readonly admins: readonly PlatformAdminDTO[];
  readonly audit: readonly PlatformAuditDTO[];
}

/** Realtime `org:status` payload (ARCHITECTURE §9). */
export interface OrgStatusEventData {
  readonly status: OrgStatus;
  readonly trialEndsAt?: string;
  readonly pastDueAt?: string;
  readonly suspendedAt?: string;
  readonly cancelledAt?: string;
  readonly purgeAfter?: string;
}

/** Kept for the T01 placeholder signature; the tenancy list is the platform organisation list. */
export type TenancyDTO = PlatformOrgRowDTO;
