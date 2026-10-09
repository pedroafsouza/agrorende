import type { RouteHandler } from "../http.js";
import * as auth from "./auth.js";
import { healthHandler } from "./health.js";
import * as oauth from "./oauth.js";
import * as platform from "./platform.js";

export { setHealthProbes, type HealthProbes } from "./health.js";

/**
 * Framework-free handlers for every T02 REST route, keyed by `"<METHOD> <path pattern>"` as in
 * ARCHITECTURE §8. `apps/web` route files are thin adapters over this map.
 */
export const platformApi = {
  "GET /health": healthHandler,

  "POST /auth/login": auth.loginHandler,
  "POST /auth/refresh": auth.refreshHandler,
  "POST /auth/logout": auth.logoutHandler,
  "GET /auth/me": auth.meHandler,
  "DELETE /auth/me": auth.deleteMeHandler,
  "PATCH /me": auth.updateMeHandler,
  "POST /auth/change-password": auth.changePasswordHandler,
  "POST /auth/socket-token": auth.socketTokenHandler,
  "GET /auth/invites/:code": auth.inviteLookupHandler,
  "POST /auth/invites/:code/password": auth.invitePasswordHandler,
  "GET /auth/reset/:code": auth.resetLookupHandler,
  "POST /auth/reset/:code": auth.resetRedeemHandler,
  "GET /auth/oauth/:provider/start": oauth.oauthStartHandler,
  "GET /auth/oauth/google/callback": oauth.googleCallbackHandler,
  "POST /auth/oauth/apple/callback": oauth.appleCallbackHandler,
  "POST /auth/oauth/exchange": oauth.oauthExchangeHandler,
  "POST /auth/apple": oauth.appleNativeHandler,

  "POST /sync/push": platform.syncPushHandler,
  "GET /sync/pull": platform.syncPullHandler,

  "POST /telemetry": platform.telemetryHandler,
  "POST /telemetry/diagnostics": platform.telemetryDiagnosticsHandler,
  "POST /devices/register": platform.deviceRegisterHandler,
  "GET /devices": platform.devicesListHandler,
  "GET /devices/:id/diagnostics": platform.deviceDiagnosticsHandler,

  "POST /media": platform.mediaCreateHandler,
  "POST /media/:id/upload-url": platform.mediaUploadUrlHandler,
  "POST /media/:id/multipart/parts": platform.mediaPartsHandler,
  "POST /media/:id/complete": platform.mediaCompleteHandler,
  "PUT /media/:id/blob": platform.mediaBlobPutHandler,
  "GET /media/:id/blob": platform.mediaBlobGetHandler,
  "PUT /media/:id/blob/parts/:n": platform.mediaPartPutHandler,
  "GET /media/:id/url": platform.mediaUrlHandler,

  "GET /users": platform.usersListHandler,
  "POST /users": platform.userCreateHandler,
  "GET /users/:id": platform.userGetHandler,
  "PATCH /users/:id": platform.userUpdateHandler,
  "POST /users/:id/role": platform.userRoleHandler,
  "POST /users/:id/deactivate": platform.userDeactivateHandler,
  "POST /users/:id/reactivate": platform.userReactivateHandler,
  "POST /users/:id/invite": platform.userInviteHandler,
  "POST /users/:id/reset-link": platform.userResetLinkHandler,
  "POST /users/:id/temporary-password": platform.userTemporaryPasswordHandler,
  "GET /users/:id/devices": platform.userDevicesHandler,

  "GET /notifications": platform.notificationsListHandler,
  "POST /notifications/read": platform.notificationsReadHandler,

  "GET /settings": platform.settingsGetHandler,
  "PATCH /settings": platform.settingsPatchHandler,
} as const satisfies Record<string, RouteHandler>;

export type PlatformRouteKey = keyof typeof platformApi;
