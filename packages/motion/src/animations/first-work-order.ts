import { composition, ease, group, k, layer, palette, rect, shape } from "../lottie/builder";
import { motionFrames, motionMeta } from "../meta";
import { checkBox } from "./parts";

/** First work order: a clipboard slides in and three check boxes tick one by one. */
export function buildFirstWorkOrder() {
  const { width, height } = motionMeta["first-work-order"];
  const frames = motionFrames["first-work-order"];

  const rows = [0, 1, 2].map((index) =>
    group(
      [
        group([checkBox(42, 26 + index * 24)], { position: [-62, 0] }),
        shape(rect({ pos: [30, -9], size: [104, 13], radius: 6.5 }), { fill: palette.graphite200 }),
        shape(rect({ pos: [14, 13], size: [72, 10], radius: 5 }), { fill: palette.graphite200 }),
      ],
      { position: [0, -56 + index * 78] },
    ),
  );

  const board = layer(
    "clipboard",
    [
      shape(rect({ size: [264, 336], radius: 24 }), { fill: palette.terra600 }),
      shape(rect({ pos: [0, 14], size: [222, 282], radius: 14 }), { fill: palette.white }),
      shape(rect({ pos: [0, -152], size: [116, 42], radius: 14 }), { fill: palette.graphite500 }),
      shape(rect({ pos: [0, -158], size: [42, 12], radius: 6 }), { fill: palette.graphite200 }),
      ...rows,
    ],
    {
      position: [k(0, [256, 300], ease.out), k(16, [256, 270])],
      opacity: [k(0, 0), k(10, 100)],
    },
  );

  return composition({ name: "first-work-order", width, height, frames, layers: [board] });
}
