import { ARRIVAL_DECLINE_SUPPRESS_MS, distanceM, EMPTY_ARRIVAL_MEMORY, rememberDeclined, rememberShown, shouldPromptArrival, type ArrivalMemory, type ArrivalTarget } from "../../src/features/jobs/arrivalPrompt";

const SITE = { lat: -15.6, lng: -56.1 };
const target: ArrivalTarget = { workOrderId: "wo-1", status: "EN_ROUTE", ...SITE, radiusM: 200 };
const far = { lat: -15.61, lng: -56.1, accuracyM: 10 };
const near = { lat: -15.6009, lng: -56.1, accuracyM: 10 };

/** Feeds fixes through the same loop the screen runs; returns when the prompt opened. */
function drive(fixes: readonly { at: number; fix: typeof near }[], decline: boolean, t = target) {
  let memory: ArrivalMemory = EMPTY_ARRIVAL_MEMORY;
  const opened: number[] = [];
  for (const { at, fix } of fixes) {
    if (!shouldPromptArrival(fix, t, memory, at)) continue;
    opened.push(at);
    memory = decline ? rememberDeclined(memory, t.workOrderId, at) : rememberShown(memory, t.workOrderId, at);
  }
  return opened;
}

describe("WO-06 arrival prompt", () => {
  test("distance is about 1.1 km per 0.01 degree of latitude", () => {
    expect(Math.round(distanceM(SITE, far))).toBeGreaterThan(1100);
    expect(distanceM(SITE, near)).toBeLessThan(200);
  });

  test("fires once per work order inside the radius while en route", () => {
    const fixes = [far, near, near, near].map((fix, i) => ({ at: i * 60_000, fix }));
    expect(drive(fixes, false)).toEqual([60_000]);
  });

  test("a decline suppresses the prompt for 10 minutes, then it may ask again", () => {
    const fixes = [0, 60_000, 5 * 60_000, ARRIVAL_DECLINE_SUPPRESS_MS - 1, ARRIVAL_DECLINE_SUPPRESS_MS].map((at) => ({ at, fix: near }));
    expect(drive(fixes, true)).toEqual([0, ARRIVAL_DECLINE_SUPPRESS_MS]);
  });

  test("never fires when not en route, outside the radius, or with a vague fix", () => {
    expect(drive([{ at: 0, fix: near }], false, { ...target, status: "ON_SITE" })).toEqual([]);
    expect(drive([{ at: 0, fix: far }], false)).toEqual([]);
    expect(drive([{ at: 0, fix: { ...near, accuracyM: 900 } }], false)).toEqual([]);
  });

  test("falls back to 200 m when the site has no radius", () => {
    expect(drive([{ at: 0, fix: near }], false, { ...target, radiusM: null })).toEqual([0]);
    expect(drive([{ at: 0, fix: near }], false, { ...target, radiusM: 50 })).toEqual([]);
  });
});
