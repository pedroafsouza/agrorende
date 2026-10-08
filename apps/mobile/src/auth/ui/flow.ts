import type { LoginResponse } from "@agrorende/api-client";

import { ensureUserSession, getAuthSession } from "../../lib/app/session";

export { isNetworkFailure, loginErrorCode } from "./rules";

/** Stores the session and opens the user's own database partition (same user → same DB). */
export async function finishLogin(response: LoginResponse): Promise<void> {
  await getAuthSession().completeLogin(response);
  await ensureUserSession(response.user.id);
}
