import { describe, expect, it } from "vitest";
import type { RentalStatus } from "../enums";
import { RENTAL_TRANSITIONS, canTransition, type RentalAction } from "./rental";

const states: (RentalStatus | null)[] = [null, "DRAFT", "RESERVED", "ACTIVE", "RETURNED", "CLOSED", "CANCELLED"];
const actions = Object.keys(RENTAL_TRANSITIONS) as RentalAction[];
const media = [
  { id: "11111111-1111-4111-8111-111111111111", tag: "WALKAROUND_FRONT" as const },
  { id: "22222222-2222-4222-8222-222222222222", tag: "WALKAROUND_REAR" as const },
  { id: "33333333-3333-4333-8333-333333333333", tag: "WALKAROUND_LEFT" as const },
  { id: "44444444-4444-4444-8444-444444444444", tag: "WALKAROUND_RIGHT" as const },
  { id: "55555555-5555-4555-8555-555555555555", tag: "WALKAROUND_CAB" as const },
  { id: "66666666-6666-4666-8666-666666666666", tag: "HOUR_METER" as const },
  { id: "77777777-7777-4777-8777-777777777777", tag: "FUEL_GAUGE" as const },
];
const asset = { category: "TRACTOR" as const, tankCapacityL: 100, openDamageIds: [] };
const eligibility = {
  direction: "OUTBOUND" as const,
  assetRentable: true,
  assetCondition: "OPERATIONAL" as const,
  hasCriticalOpenReport: false,
  hasOverlappingReservedOrActiveRental: false,
  customerHasDocument: true,
  customerHasPhone: true,
};
const checkoutInspection = {
  type: "CHECK_OUT" as const,
  templateSnapshot: [],
  responses: [],
  hourMeter: 10,
  fuelPercent: 100,
  safetyBriefingGiven: true,
  operatorName: "Operator",
  termsAccepted: true,
  signatureStatus: "SIGNED" as const,
  customerSignatureMediaId: "11111111-1111-4111-8111-111111111111",
  agentSignatureMediaId: "22222222-2222-4222-8222-222222222222",
};
const checkinInspection = {
  ...checkoutInspection,
  type: "CHECK_IN" as const,
  termsAccepted: false,
  safetyBriefingGiven: false,
};
const guard = {
  actorRole: "MANAGER" as const,
  reason: "changed plans",
  eligibility,
  media,
  asset,
  inspection: checkoutInspection,
  rental: { direction: "OUTBOUND" as const, status: "RESERVED" as const },
};

function guardFor(action: RentalAction) {
  if (action === "checkIn") {
    return {
      ...guard,
      inspection: checkinInspection,
      rental: { direction: "OUTBOUND" as const, status: "ACTIVE" as const },
    };
  }
  return guard;
}

describe("rental state machine", () => {
  it.each(actions.flatMap((action) => RENTAL_TRANSITIONS[action].from.map((from) => ({ action, from }))))(
    "allows $action from $from",
    ({ action, from }) => {
      const result = canTransition(from, action, guardFor(action));
      const expectedTo = RENTAL_TRANSITIONS[action].to ?? from ?? "DRAFT";
      expect(result).toEqual({ ok: true, to: expectedTo });
    },
  );

  it.each(
    actions.flatMap((action) =>
      states
        .filter((from) => !(RENTAL_TRANSITIONS[action].from as readonly (RentalStatus | null)[]).includes(from))
        .map((from) => ({ action, from })),
    ),
  )("forbids $action from $from", ({ action, from }) => {
    const result = canTransition(from, action, guardFor(action));
    expect(result.ok).toBe(false);
  });
});
