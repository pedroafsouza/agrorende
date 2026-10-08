/** Permission matrix (ARCHITECTURE §13.6): every state has copy, a primary action and an alternate path. */
export type PermissionKind = "camera" | "microphone" | "locationForeground" | "locationBackground" | "notifications" | "photos";
export type PermissionState = "granted" | "denied" | "blocked" | "limited" | "undetermined";
export type PermissionAction = "askAgain" | "openSettings" | "checkAgain" | "none";

export interface PermissionLike {
  readonly granted: boolean;
  readonly canAskAgain?: boolean;
  readonly status?: string;
  readonly accessPrivileges?: string;
  readonly ios?: { readonly scope?: string; readonly accuracy?: string };
}

export function permissionStateOf(response: PermissionLike | null | undefined): PermissionState {
  if (response === null || response === undefined) return "undetermined";
  if (response.accessPrivileges === "limited" || response.ios?.accuracy === "reduced") return "limited";
  if (response.granted) return "granted";
  if (response.status === "undetermined") return "undetermined";
  return response.canAskAgain === false ? "blocked" : "denied";
}

export interface PermissionGuidance {
  readonly state: PermissionState;
  readonly titleKey: string;
  readonly bodyKey: string;
  readonly action: PermissionAction;
  readonly actionKey: string | undefined;
  readonly altKey: string | undefined;
}

const HAS_LIMITED: ReadonlySet<PermissionKind> = new Set(["locationForeground", "photos"]);
const HAS_ALT: ReadonlySet<PermissionKind> = new Set(["camera", "microphone", "locationForeground", "locationBackground", "notifications", "photos"]);

export function permissionGuidance(kind: PermissionKind, state: PermissionState): PermissionGuidance {
  const base = `permissions.${kind}`;
  const effective: PermissionState = state === "limited" && !HAS_LIMITED.has(kind) ? "granted" : state;
  const action: PermissionAction =
    effective === "undetermined" || effective === "denied" ? "askAgain" : effective === "blocked" ? "openSettings" : effective === "limited" ? "checkAgain" : "none";
  return {
    state: effective,
    titleKey: `${base}.${effective}.title`,
    bodyKey: `${base}.${effective}.body`,
    action,
    actionKey: action === "none" ? undefined : `permissions.action.${action}`,
    altKey: effective !== "granted" && HAS_ALT.has(kind) ? `${base}.alt` : undefined,
  };
}

export const PERMISSION_KINDS: readonly PermissionKind[] = ["camera", "microphone", "locationForeground", "locationBackground", "notifications", "photos"];
