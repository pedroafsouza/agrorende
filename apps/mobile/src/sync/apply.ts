import type { MutationResult, PullResponse } from "@agrorende/contracts/sync";

import { notImplemented } from "../lib/notImplemented";

export async function applyMutationResult(_result: MutationResult): Promise<never> { return notImplemented("sync.applyMutationResult"); }
export async function applyPullResponse(_response: PullResponse): Promise<never> { return notImplemented("sync.applyPullResponse"); }
