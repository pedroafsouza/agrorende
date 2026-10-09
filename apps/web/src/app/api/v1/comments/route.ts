import { commentsCore } from "@/features/comments/server";
import { query, readJson, route, write } from "@/lib/core.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ANY_ROLE = ["ADMIN", "MANAGER", "FIELD"] as const;

/** `GET /comments?entityType&entityId`: the thread of a record the caller can see (PLT-10). */
export const GET = route(ANY_ROLE, async (request, ctx) => commentsCore.listComments(ctx, query(request)));

/** `POST /comments`: adds a comment and notifies the participants except the author (A§6.5). */
export const POST = route(ANY_ROLE, async (request, ctx) => {
  const body = await readJson(request);
  return write(ctx, (tx) => commentsCore.createCommentFromInput(tx, ctx, body));
});
