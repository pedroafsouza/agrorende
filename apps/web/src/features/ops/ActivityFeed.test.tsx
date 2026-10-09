// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ActivityFeed } from "./ActivityFeed";
import { intlErrors, renderWithProviders } from "./testing";
import type { OpsActivityItemDTO } from "./types";

vi.mock("./api", () => ({ opsApi: { activity: () => Promise.resolve({ items: [], nextCursor: null }) } }));

function item(id: string, action: string, fromStatus: string | null, toStatus: string | null): OpsActivityItemDTO {
  return { id, entityType: "WORK_ORDER", entityId: "wo-1", action, fromStatus, toStatus, actorId: "u1", actorName: "Ana", occurredAt: "2026-03-02T12:00:00.000Z", meta: {} };
}

const live = [item("a1", "workOrder.complete", "IN_PROGRESS", "COMPLETED"), item("a2", "fieldReport.reviewStarted", null, null), item("a3", "something.unheardOf", "WEIRD", null)];

afterEach(() => {
  cleanup();
  intlErrors.length = 0;
});

describe("ActivityFeed (R9: no raw action keys)", () => {
  it("translates actions and statuses in pt-BR", async () => {
    renderWithProviders(<ActivityFeed live={live} />, { locale: "pt-BR" });
    expect(await screen.findByText("Concluída · ordem de serviço")).toBeTruthy();
    expect(screen.getByText(/Em andamento/)).toBeTruthy();
    expect(screen.getByText("Análise iniciada · ordem de serviço")).toBeTruthy();
    expect(screen.getByText("Alteração registrada · ordem de serviço")).toBeTruthy();
    expect(screen.getByText(/Outra situação/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/workOrder\.|fieldReport\.|unheardOf|IN_PROGRESS|WEIRD/);
    expect(intlErrors).toEqual([]);
  });

  it("translates actions and statuses in English", async () => {
    renderWithProviders(<ActivityFeed live={live} />, { locale: "en" });
    expect(await screen.findByText("Completed · work order")).toBeTruthy();
    expect(screen.getByText(/In progress/)).toBeTruthy();
    expect(screen.getByText("Change recorded · work order")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/workOrder\.|IN_PROGRESS/);
    expect(intlErrors).toEqual([]);
  });
});
