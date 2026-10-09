import { OpsLiveDTOSchema } from "@agrorende/contracts/dto";
import { describe, expect, it } from "vitest";

import { AgrorendeApiClient, type FetchLike, type OpsLiveOperator } from "./index.js";

const serverPayload = {
  generatedAt: "2026-10-09T12:00:00.000Z",
  operators: [
    {
      userId: "u-1",
      name: "Pedro",
      lat: -15.6,
      lng: -56.1,
      accuracyM: 8,
      heading: 90,
      speedMps: 4.2,
      recordedAt: "2026-10-09T11:59:50.000Z",
      lastSeenAt: "2026-10-09T11:59:55.000Z",
      dutyStatus: "ON_DUTY",
      state: "ON_HOLD",
      stale: false,
      deviceId: "dev-1",
      activeWorkOrderId: "wo-1",
    },
  ],
  workOrders: [],
  reports: [],
  rentals: [],
  assets: [],
};

describe("opsLive", () => {
  it("types the operator exactly as the server sends it", async () => {
    expect(OpsLiveDTOSchema.parse(serverPayload)).toEqual(serverPayload);
    const fetchImpl: FetchLike = async () => new Response(JSON.stringify(serverPayload), { status: 200 });
    const client = new AgrorendeApiClient({ baseUrl: "https://api.example.test", fetch: fetchImpl });

    const live = await client.opsLive();
    const operator: OpsLiveOperator | undefined = live.operators[0];

    expect(operator?.stale).toBe(false);
    expect(operator?.lastSeenAt).toBe("2026-10-09T11:59:55.000Z");
    expect(operator?.activeWorkOrderId).toBe("wo-1");
    expect(operator?.heading).toBe(90);
    expect(operator?.speedMps).toBe(4.2);
    expect(operator?.deviceId).toBe("dev-1");
    expect(operator?.state).toBe("ON_HOLD");
  });
});
