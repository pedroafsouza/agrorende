import { vi } from "vitest";

/*
 * Route tests run without MongoDB, so the organisation read-only gate in `withApi` is writable by
 * default. `src/server/withApi.test.ts` replaces this mock to exercise the ORG_SUSPENDED path.
 */
vi.mock("@agrorende/core/tenancy", () => ({ assertOrganizationWritable: vi.fn(async () => undefined) }));
