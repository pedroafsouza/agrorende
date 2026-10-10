import type { LottieJson } from "../lottie/types.js";
import { ANIMATION_IDS, type AnimationId } from "../meta.js";
import { buildEmpty } from "./empty.js";
import { buildFirstMachine } from "./first-machine.js";
import { buildFirstWorkOrder } from "./first-work-order.js";
import { buildFlowLoop } from "./flow-loop.js";
import { buildInviteTeam } from "./invite-team.js";
import { buildLoading } from "./loading.js";
import { buildMachineCost } from "./machine-cost.js";
import { buildOfficeLive } from "./office-live.js";
import { buildRentalHandover } from "./rental-handover.js";
import { buildReportOffline } from "./report-offline.js";
import { buildSavedOnPhone } from "./saved-on-phone.js";
import { buildSignature } from "./signature.js";
import { buildSuccess } from "./success.js";
import { buildWelcome } from "./welcome.js";

/** Builder of every animation. Used by the generator and by the tests; never imported at runtime by apps. */
export const builders: Record<AnimationId, () => LottieJson> = {
  welcome: buildWelcome,
  "report-offline": buildReportOffline,
  "flow-loop": buildFlowLoop,
  "machine-cost": buildMachineCost,
  "office-live": buildOfficeLive,
  "invite-team": buildInviteTeam,
  "first-machine": buildFirstMachine,
  "first-work-order": buildFirstWorkOrder,
  signature: buildSignature,
  success: buildSuccess,
  empty: buildEmpty,
  "saved-on-phone": buildSavedOnPhone,
  "rental-handover": buildRentalHandover,
  loading: buildLoading,
};

export function buildAll(): Record<AnimationId, LottieJson> {
  return Object.fromEntries(ANIMATION_IDS.map((id) => [id, builders[id]()])) as Record<AnimationId, LottieJson>;
}

/** Serialised form written to `lottie/<id>.json`. */
export function serialize(json: LottieJson): string {
  return `${JSON.stringify(json)}\n`;
}
