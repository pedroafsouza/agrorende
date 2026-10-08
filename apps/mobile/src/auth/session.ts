import type { LoginResponse } from "@agrorende/api-client";
import type { OrganizationDTO, UserDTO } from "@agrorende/contracts/dto";
import { createStore } from "zustand/vanilla";

import { isExpiring } from "./jwt";
import type { TokenVault } from "./vault";

export type AuthStatus = "loading" | "signedOut" | "signedIn";

export interface AuthSnapshot {
  readonly status: AuthStatus;
  readonly user?: UserDTO;
  readonly org?: OrganizationDTO;
  readonly accessToken?: string;
  /** Refresh failed with 401: show the non-destructive "sign in again" banner; data stays. */
  readonly needsReauth: boolean;
  /** Same user signing in again must reopen the same DB; a different user gets their own. */
  readonly previousUserId?: string;
}

export function createAuthStore() {
  return createStore<AuthSnapshot>()(() => ({ status: "loading", needsReauth: false }));
}

export type AuthStore = ReturnType<typeof createAuthStore>;
export const authStore = createAuthStore();

/** Cached profile stored in SQLite so the app opens offline (§7.9). */
export interface CachedProfile {
  readonly user: UserDTO;
  readonly org?: OrganizationDTO;
}

export interface AuthApi {
  refresh(body: { refreshToken: string }): Promise<LoginResponse>;
  logout?(): Promise<void>;
}

export interface AuthSessionDeps {
  readonly store: AuthStore;
  readonly vault: TokenVault;
  readonly api: AuthApi;
  readonly now: () => number;
  readonly loadProfile: (userId: string) => Promise<CachedProfile | undefined>;
  readonly saveProfile: (profile: CachedProfile) => Promise<void>;
}

function isUnauthorized(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const status = (error as { status?: unknown }).status;
  const code = (error as { code?: unknown }).code;
  return status === 401 || code === "UNAUTHENTICATED" || code === "TOKEN_EXPIRED" || code === "REFRESH_REUSED" || code === "ACCOUNT_DISABLED";
}

export function createAuthSession(deps: AuthSessionDeps) {
  const { store, vault } = deps;
  let refreshing: Promise<boolean> | undefined;

  async function completeLogin(response: LoginResponse): Promise<void> {
    const previous = await vault.getLastUserId();
    if (response.refreshToken !== undefined) await vault.setRefreshToken(response.user.id, response.refreshToken);
    await vault.setLastUserId(response.user.id);
    await deps.saveProfile({ user: response.user, ...(response.org === undefined ? {} : { org: response.org }) });
    store.setState({
      status: "signedIn",
      user: response.user,
      ...(response.org === undefined ? {} : { org: response.org }),
      ...(response.accessToken === undefined ? {} : { accessToken: response.accessToken }),
      needsReauth: false,
      ...(previous !== undefined && previous !== response.user.id ? { previousUserId: previous } : {}),
    });
  }

  /** Opens the last user's session from the cached profile, even offline with no access token. */
  async function restore(): Promise<AuthStatus> {
    const userId = await vault.getLastUserId();
    const profile = userId === undefined ? undefined : await deps.loadProfile(userId);
    const refreshToken = userId === undefined ? undefined : await vault.getRefreshToken(userId);
    if (profile === undefined) {
      store.setState({ status: "signedOut", needsReauth: false });
      return "signedOut";
    }
    store.setState({ status: "signedIn", user: profile.user, ...(profile.org === undefined ? {} : { org: profile.org }), needsReauth: refreshToken === undefined });
    return "signedIn";
  }

  /** One shared refresh at a time. A 401 marks `needsReauth` but never signs the user out. */
  function refresh(): Promise<boolean> {
    if (refreshing !== undefined) return refreshing;
    refreshing = (async () => {
      const user = store.getState().user;
      if (user === undefined) return false;
      const token = await vault.getRefreshToken(user.id);
      if (token === undefined) {
        store.setState({ needsReauth: true });
        return false;
      }
      try {
        const response = await deps.api.refresh({ refreshToken: token });
        if (response.refreshToken !== undefined) await vault.setRefreshToken(response.user.id, response.refreshToken);
        store.setState({ ...(response.accessToken === undefined ? {} : { accessToken: response.accessToken }), user: response.user, needsReauth: false });
        const org = response.org ?? store.getState().org;
        await deps.saveProfile({ user: response.user, ...(org === undefined ? {} : { org }) });
        return true;
      } catch (error) {
        if (isUnauthorized(error)) {
          store.setState({ needsReauth: true });
          await vault.clearRefreshToken(user.id);
        }
        return false;
      }
    })().finally(() => {
      refreshing = undefined;
    });
    return refreshing;
  }

  /** The sync engine calls this before credentialed calls. Offline failures keep the old state. */
  async function ensureFreshToken(): Promise<boolean> {
    const state = store.getState();
    if (state.status !== "signedIn") return false;
    if (!isExpiring(state.accessToken, deps.now())) return true;
    return refresh();
  }

  /** Signs out locally. The DB file and its outbox stay on the device for the same user. */
  async function signOut(): Promise<void> {
    const user = store.getState().user;
    try {
      await deps.api.logout?.();
    } catch (_error) {
      // Offline sign-out still clears local credentials.
    }
    if (user !== undefined) await vault.clearRefreshToken(user.id);
    await vault.setLastUserId(undefined);
    store.setState({ status: "signedOut", needsReauth: false, previousUserId: user?.id }, true);
  }

  return {
    completeLogin,
    restore,
    refresh,
    ensureFreshToken,
    signOut,
    accessToken: () => store.getState().accessToken,
  };
}

export type AuthSession = ReturnType<typeof createAuthSession>;
