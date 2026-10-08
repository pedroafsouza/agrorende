import type { PullRequest, PullResponse } from "@agrorende/contracts/sync";

import { notImplemented } from "../lib/notImplemented";

export type PullTransport = { readonly pull: (request: PullRequest) => Promise<PullResponse> };
export async function pullChanges(_transport: PullTransport, _request: PullRequest): Promise<never> { return notImplemented("sync.pullChanges"); }
