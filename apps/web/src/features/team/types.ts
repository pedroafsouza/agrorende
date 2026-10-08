import type { UserDTO } from "@agrorende/contracts/dto";
import type { IssueCategory, Platform, PushStatus, Role } from "@agrorende/contracts/enums";

export const ROLES: readonly Role[] = ["ADMIN", "MANAGER", "FIELD"];
export const SKILLS: readonly IssueCategory[] = ["ENGINE", "HYDRAULIC", "ELECTRICAL", "TRANSMISSION", "TIRES_TRACKS", "BRAKES", "STRUCTURE", "CAB", "IMPLEMENT", "LEAK", "SAFETY", "OTHER"];

/** Admin view of a user: the sync DTO plus the office-only fields the users routes (T02) return. */
export type TeamUser = UserDTO & {
  readonly email?: string | null;
  readonly hourlyCostCents?: number | null;
  readonly mustChangePassword?: boolean;
  /** Set when a FIELD user accepted the invite with a different e-mail (`JOINED_WITH_OTHER_EMAIL`). */
  readonly joinedWithOtherEmail?: boolean;
  readonly invitedEmail?: string | null;
};

export interface InviteLink {
  readonly code: string;
  readonly url: string;
  readonly whatsappUrl?: string;
  readonly expiresAt?: string;
}

export interface CreateUserResult {
  readonly user: TeamUser;
  readonly invite: InviteLink;
}

export interface TeamDevice {
  readonly id: string;
  readonly userId: string;
  readonly userName?: string;
  readonly platform: Platform;
  readonly model?: string | null;
  readonly osVersion?: string | null;
  readonly appVersion?: string | null;
  readonly runtimeVersion?: string | null;
  readonly pushStatus?: PushStatus;
  readonly lastSeenAt?: string | null;
  readonly lastSyncAt?: string | null;
  readonly pendingMutations?: number;
  readonly pendingUploads?: number;
  readonly pendingBytes?: number;
  readonly oldestPendingAt?: string | null;
  readonly failedMutations?: number;
  readonly batteryLevel?: number | null;
  readonly freeStorageBytes?: number | null;
  readonly clockOffsetMs?: number | null;
}

export interface DeviceDiagnostic {
  readonly id: string;
  readonly createdAt: string;
  readonly appVersion?: string | null;
}

export type UserState = "INVITED" | "ACTIVE" | "DISABLED" | "MUST_CHANGE_PASSWORD";

export function userState(user: TeamUser): UserState {
  if (!user.isActive || (user.disabledAt ?? null) !== null) return "DISABLED";
  if ((user.joinedAt ?? null) === null) return "INVITED";
  if (user.mustChangePassword === true) return "MUST_CHANGE_PASSWORD";
  return "ACTIVE";
}

/** Clock skew beyond two minutes breaks SLA timers and sync ordering, so the office is warned. */
export const CLOCK_WARN_MS = 2 * 60 * 1000;
