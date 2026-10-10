/**
 * The lazy entry of @agrorende/motion (`@agrorende/motion/lazy`). It never imports the animation JSON
 * statically, so web bundles that only need `loadAnimation` and the metadata do not ship all the
 * animations in their shared chunk; each file becomes its own chunk loaded on demand.
 */
import type { LottieJson } from "./lottie/types.js";
import type { AnimationId } from "./meta.js";

export { ANIMATION_IDS, motionMeta, type AnimationId, type MotionMeta } from "./meta.js";
export type { LottieJson } from "./lottie/types.js";

/** Loads one animation lazily. The static switch lets Next.js (Turbopack/webpack) and Metro split each file. */
export async function loadAnimation(id: AnimationId): Promise<LottieJson> {
  switch (id) {
    case "welcome":
      return (await import("../lottie/welcome.json")).default;
    case "report-offline":
      return (await import("../lottie/report-offline.json")).default;
    case "flow-loop":
      return (await import("../lottie/flow-loop.json")).default;
    case "machine-cost":
      return (await import("../lottie/machine-cost.json")).default;
    case "office-live":
      return (await import("../lottie/office-live.json")).default;
    case "invite-team":
      return (await import("../lottie/invite-team.json")).default;
    case "first-machine":
      return (await import("../lottie/first-machine.json")).default;
    case "first-work-order":
      return (await import("../lottie/first-work-order.json")).default;
    case "signature":
      return (await import("../lottie/signature.json")).default;
    case "success":
      return (await import("../lottie/success.json")).default;
    case "empty":
      return (await import("../lottie/empty.json")).default;
    case "saved-on-phone":
      return (await import("../lottie/saved-on-phone.json")).default;
    case "rental-handover":
      return (await import("../lottie/rental-handover.json")).default;
    case "loading":
      return (await import("../lottie/loading.json")).default;
  }
}
