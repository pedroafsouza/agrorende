import { circle, composition, ease, group, k, layer, palette, pivot, polyline, popInOut, rect, shape } from "../lottie/builder.js";
import { motionFrames, motionMeta } from "../meta.js";
import { checkBadge, phone } from "./parts.js";

/** Saved on the phone: a small clock ticks on the phone screen, then turns into a check. */
export function buildSavedOnPhone() {
  const { width, height } = motionMeta["saved-on-phone"];
  const frames = motionFrames["saved-on-phone"];

  const clock = group(
    [
      shape(circle(48), { fill: palette.white, stroke: palette.graphite500, width: 8 }),
      shape(polyline([[0, 0], [20, 0]]), { stroke: palette.graphite900, width: 7 }, pivot([0, 0], {
        rotation: [k(0, 0, ease.linear), k(56, 45, "hold"), k(100, 0)],
      })),
      shape(polyline([[0, 0], [0, -30]]), { stroke: palette.graphite900, width: 7 }, pivot([0, 0], {
        rotation: [k(0, 0, ease.linear), k(56, 540, "hold"), k(100, 0)],
      })),
      shape(circle(6), { fill: palette.terra600 }),
    ],
    {
      position: [0, 24],
      scale: [k(46, 100, ease.in), k(54, 0, "hold"), k(104, 0, ease.back), k(116, 100)],
    },
  );

  const device = layer(
    "phone",
    [
      phone(),
      shape(rect({ pos: [-18, -92], size: [100, 12], radius: 6 }), { fill: palette.graphite200 }),
      shape(rect({ pos: [-34, -70], size: [68, 10], radius: 5 }), { fill: palette.graphite200 }),
      shape(rect({ pos: [0, 100], size: [120, 30], radius: 15 }), { fill: palette.graphite200 }),
      clock,
      checkBadge({ radius: 52, position: [0, 24], scale: popInOut(54, 106, 12), draw: [k(58, 0), k(72, 100)] }),
    ],
    { position: [256, 256] },
  );

  return composition({ name: "saved-on-phone", width, height, frames, layers: [device] });
}
