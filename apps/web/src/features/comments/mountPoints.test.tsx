// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { BillingActions } from "@/features/billing";
import { CommandPalette } from "@/features/command-palette";
import { ExternalCostPanel } from "@/features/work-orders/parts";

import { CommentThread } from "./index";

const id = "00000000-0000-4000-8000-000000000001";

afterEach(cleanup);

describe("wave 6 mount points", () => {
  it("CommentThread renders nothing for every detail page", () => {
    for (const entityType of ["FIELD_REPORT", "WORK_ORDER", "RENTAL"] as const) {
      const { container, unmount } = render(<CommentThread entityId={id} entityType={entityType} />);
      expect(container.innerHTML).toBe("");
      unmount();
    }
  });

  it("BillingActions renders nothing", () => {
    const { container } = render(<BillingActions entityId={id} entityType="WORK_ORDER" />);
    expect(container.innerHTML).toBe("");
  });

  it("CommandPalette renders nothing", () => {
    const { container } = render(<CommandPalette />);
    expect(container.innerHTML).toBe("");
  });

  it("ExternalCostPanel renders nothing", () => {
    const { container } = render(<ExternalCostPanel workOrder={{ id, status: "COMPLETED", syncVersion: "3", externalCostCents: null, externalCostNote: null }} />);
    expect(container.innerHTML).toBe("");
  });
});
