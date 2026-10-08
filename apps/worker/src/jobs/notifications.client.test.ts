import type { Expo, ExpoPushMessage } from "expo-server-sdk";
import { describe, expect, it } from "vitest";

import { createExpoPushClient } from "./notifications.push.js";

describe("createExpoPushClient", () => {
  it("chunks through expo-server-sdk and maps tickets and receipts", async () => {
    const sentChunks: ExpoPushMessage[][] = [];
    const fake = {
      chunkPushNotifications: (messages: ExpoPushMessage[]) => [messages.slice(0, 1), messages.slice(1)],
      sendPushNotificationsAsync: async (chunk: ExpoPushMessage[]) => {
        sentChunks.push(chunk);
        return chunk.map((message) =>
          message.to === "bad" ? { status: "error" as const, message: "gone", details: { error: "DeviceNotRegistered" as const } } : { status: "ok" as const, id: `t-${String(message.to)}` },
        );
      },
      chunkPushNotificationReceiptIds: (ids: string[]) => [ids],
      getPushNotificationReceiptsAsync: async () => ({ "t-a": { status: "ok" as const }, "t-x": { status: "error" as const, message: "gone", details: { error: "DeviceNotRegistered" as const } } }),
    } as unknown as Expo;
    const client = createExpoPushClient(undefined, fake);
    const base = { title: "T", body: "B", sound: "default" as const, data: {} };

    const tickets = await client.send([{ ...base, to: "a" }, { ...base, to: "bad" }]);
    expect(sentChunks).toHaveLength(2);
    expect(tickets).toEqual([{ status: "ok", id: "t-a" }, { status: "error", message: "gone", details: { error: "DeviceNotRegistered" } }]);

    const receipts = await client.getReceipts(["t-a", "t-x"]);
    expect(receipts["t-a"]).toEqual({ status: "ok" });
    expect(receipts["t-x"]).toEqual({ status: "error", message: "gone", details: { error: "DeviceNotRegistered" } });
  });
});
