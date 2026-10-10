import { describe, expect, it } from "vitest";

import { notificationDisplay } from "./notificationDisplay";

const t = (key: "staleSyncTitle" | "staleSyncBody", values?: { name: string }) => (key === "staleSyncTitle" ? "Phone with unsent data" : `${values?.name ?? ""} has unsent data.`);

describe("notificationDisplay", () => {
  it("rewords the phone-sync warning in either stored locale", () => {
    expect(notificationDisplay({ type: "DEVICE_STALE_SYNC", title: "Celular sem sincronizar", body: "O celular de Carlos Técnico tem dados esperando envio." }, t)).toEqual({
      title: "Phone with unsent data",
      body: "Carlos Técnico has unsent data.",
      reference: null,
    });
    expect(notificationDisplay({ type: "DEVICE_STALE_SYNC", title: "Phone not syncing", body: "Ana's phone has data waiting to be sent." }, t).body).toBe("Ana has unsent data.");
  });

  it("keeps the stored body when the wording is unknown", () => {
    expect(notificationDisplay({ type: "DEVICE_STALE_SYNC", title: "x", body: "Something else." }, t).body).toBe("Something else.");
  });

  it("moves a leading record code into its own tag", () => {
    expect(notificationDisplay({ type: "SLA_AT_RISK", title: "Prazo em risco", body: "WO-000002 · Ordem de serviço 2 está perto do prazo." }, t)).toEqual({
      title: "Prazo em risco",
      body: "Ordem de serviço 2 está perto do prazo.",
      reference: "WO-000002",
    });
    expect(notificationDisplay({ type: "WO_ASSIGNED", title: "WO-000010 · Trocar óleo", body: "Assigned to you." }, t).reference).toBe("WO-000010");
  });
});
