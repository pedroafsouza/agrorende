import type { PushRequest, PushResponse } from "@agrorende/contracts/sync";

import { notImplemented } from "../lib/notImplemented";

export type PushTransport = { readonly push: (request: PushRequest) => Promise<PushResponse> };
export async function pushPendingMutations(_transport: PushTransport): Promise<never> { return notImplemented("sync.pushPendingMutations"); }
