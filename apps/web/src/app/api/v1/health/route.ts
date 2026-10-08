import { withApi } from "@/server/withApi";

export const GET = withApi(() => ({ ok: true, app: "agrorende" }), { roles: ["public"] });
