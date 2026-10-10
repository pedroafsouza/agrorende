import { composition, ease, ellipse, group, k, layer, palette, polyline, rect, shape, type Key } from "../lottie/builder.js";
import { motionFrames, motionMeta } from "../meta.js";
import { leaf } from "./parts.js";

/** Empty state: a calm, open crate with a small leaf swaying inside it. */
export function buildEmpty() {
  const { width, height } = motionMeta.empty;
  const frames = motionFrames.empty;
  const half = frames / 2;

  const sway = (from: number, to: number): Key<number>[] => [k(0, from, ease.inOut), k(half, to, ease.inOut), k(frames, from)];
  const outline = { stroke: palette.graphite500, width: 8 } as const;

  const crate = layer(
    "crate",
    [
      shape(ellipse({ pos: [0, 82], size: [250, 20] }), { fill: palette.graphite200 }),
      shape(polyline([[-110, -60], [-82, -98], [82, -98], [110, -60]], true), { fill: palette.graphite500, ...outline }),
      shape(polyline([[-110, -60], [-82, -98], [-122, -124], [-152, -88]], true), { fill: palette.graphite200, ...outline }),
      shape(polyline([[110, -60], [82, -98], [122, -124], [152, -88]], true), { fill: palette.graphite200, ...outline }),
      group([leaf()], { position: [-30, -60], rotation: sway(-12, 8), scale: 130 }),
      group([leaf()], { position: [26, -60], rotation: sway(10, -10), scaleXY: [-170, 170] }),
      shape(rect({ size: [228, 130], radius: 16 }), { fill: palette.graphite200, ...outline }),
      shape(polyline([[-70, -8], [70, -8]]), { stroke: palette.graphite500, width: 8 }),
    ],
    { position: [256, 300] },
  );

  return composition({ name: "empty", width, height, frames, layers: [crate] });
}
