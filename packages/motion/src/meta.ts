export const ANIMATION_IDS = [
  "welcome",
  "report-offline",
  "flow-loop",
  "machine-cost",
  "office-live",
  "invite-team",
  "first-machine",
  "first-work-order",
  "signature",
  "success",
  "empty",
  "saved-on-phone",
  "rental-handover",
  "loading",
] as const;

export type AnimationId = (typeof ANIMATION_IDS)[number];

export interface MotionMeta {
  id: AnimationId;
  /** Whether the animation is designed to loop seamlessly. */
  loop: boolean;
  /** Frame to show as a still image when the user prefers reduced motion. */
  posterFrame: number;
  width: number;
  height: number;
  durationMs: number;
}

export const FPS = 30;

interface MetaInput {
  loop: boolean;
  posterFrame: number;
  frames: number;
  width?: number;
  height?: number;
}

const input: Record<AnimationId, MetaInput> = {
  welcome: { loop: false, posterFrame: 119, frames: 120, width: 800, height: 500 },
  "report-offline": { loop: true, posterFrame: 62, frames: 150 },
  "flow-loop": { loop: true, posterFrame: 0, frames: 150 },
  "machine-cost": { loop: true, posterFrame: 80, frames: 120 },
  "office-live": { loop: true, posterFrame: 90, frames: 150 },
  "invite-team": { loop: false, posterFrame: 119, frames: 120 },
  "first-machine": { loop: false, posterFrame: 89, frames: 90 },
  "first-work-order": { loop: false, posterFrame: 104, frames: 105 },
  signature: { loop: false, posterFrame: 104, frames: 105 },
  success: { loop: false, posterFrame: 59, frames: 60 },
  empty: { loop: true, posterFrame: 0, frames: 120 },
  "saved-on-phone": { loop: true, posterFrame: 90, frames: 120 },
  "rental-handover": { loop: false, posterFrame: 119, frames: 120 },
  loading: { loop: true, posterFrame: 40, frames: 80 },
};

/** Total frame count of each animation (the composition's `op`). */
export const motionFrames: Record<AnimationId, number> = Object.fromEntries(
  ANIMATION_IDS.map((id) => [id, input[id].frames]),
) as Record<AnimationId, number>;

export const motionMeta: Record<AnimationId, MotionMeta> = Object.fromEntries(
  ANIMATION_IDS.map((id) => {
    const m = input[id];
    const meta: MotionMeta = {
      id,
      loop: m.loop,
      posterFrame: m.posterFrame,
      width: m.width ?? 512,
      height: m.height ?? 512,
      durationMs: Math.round((m.frames / FPS) * 1000),
    };
    return [id, meta];
  }),
) as Record<AnimationId, MotionMeta>;
