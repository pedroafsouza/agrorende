import type { LottieJson } from "../lottie/types";
import { ANIMATION_IDS, type AnimationId } from "../meta";
import { buildEmpty } from "./empty";
import { buildFirstMachine } from "./first-machine";
import { buildFirstWorkOrder } from "./first-work-order";
import { buildFlowLoop } from "./flow-loop";
import { buildInviteTeam } from "./invite-team";
import { buildLoading } from "./loading";
import { buildMachineCost } from "./machine-cost";
import { buildOfficeLive } from "./office-live";
import { buildRentalHandover } from "./rental-handover";
import { buildReportOffline } from "./report-offline";
import { buildSavedOnPhone } from "./saved-on-phone";
import { buildSignature } from "./signature";
import { buildSuccess } from "./success";
import { buildWelcome } from "./welcome";

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
