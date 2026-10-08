import type { MutationEnvelope, MutationResult, PullRequest, PullResponse, PushRequest, PushResponse } from "@agrorende/contracts/sync";

import type { SyncApi } from "../../src/sync/transport";

type Responder = (mutation: MutationEnvelope) => MutationResult;

/** In-process stand-in for the T02 sync endpoints, shaped by `packages/contracts`. */
export class FakeServer implements SyncApi {
  serverTime = "2026-03-01T12:00:00.000Z";
  readonly pushes: PushRequest[] = [];
  readonly pulls: PullRequest[] = [];
  readonly pages: PullResponse[] = [];
  readonly locations: unknown[] = [];
  readonly diagnostics: unknown[] = [];
  respond: Responder = (mutation) => ({ id: mutation.id, status: "APPLIED" });
  healthError: Error | undefined;
  pushError: Error | undefined;

  async health() {
    if (this.healthError !== undefined) throw this.healthError;
    return { ok: true as const, app: "agrorende" as const };
  }

  async push(request: PushRequest): Promise<PushResponse> {
    if (this.pushError !== undefined) throw this.pushError;
    this.pushes.push(request);
    return { results: request.mutations.map((m) => this.respond(m)), serverTime: this.serverTime };
  }

  async pull(request: PullRequest): Promise<PullResponse> {
    this.pulls.push(request);
    const page = this.pages.shift();
    return page ?? emptyPage(request.cursor ?? "c0", request.scopeEpoch, this.serverTime);
  }

  async uploadUrl(): Promise<never> {
    throw new Error("not used");
  }
  async multipartParts(): Promise<never> {
    throw new Error("not used");
  }
  async completeUpload() {
    return {};
  }
  async postLocations(body: { deviceId: string; fixes: readonly unknown[] }) {
    this.locations.push(...body.fixes);
    return { accepted: body.fixes.length };
  }
  async postDiagnostics(body: { items: readonly unknown[] }) {
    this.diagnostics.push(...body.items);
    return {};
  }
  async updateMe() {
    return {};
  }
}

export function emptyPage(cursor: string, scopeEpoch: number, serverTime: string): PullResponse {
  return { cursor, hasMore: false, resetRequired: false, scopeEpoch, changes: {}, deleted: {}, resolvedMutations: [], serverTime };
}
