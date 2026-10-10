import {
  circle,
  composition,
  ease,
  ellipse,
  group,
  k,
  layer,
  palette,
  polyline,
  popIn,
  rect,
  shape,
  type Vec2,
} from "../lottie/builder.js";
import { motionFrames, motionMeta } from "../meta.js";
import { tractor } from "./parts.js";

/** First machine: a tractor fades in and a label tag swings from its cab roof. */
export function buildFirstMachine() {
  const { width, height } = motionMeta["first-machine"];
  const frames = motionFrames["first-machine"];
  const ground: Vec2 = [236, 410];
  const scale = 1.25;
  const hook: Vec2 = [ground[0] - 4 * scale, ground[1] - 154 * scale];

  const shadow = layer("shadow", [shape(ellipse({ size: [250, 18] }), { fill: palette.graphite200 })], {
    position: [ground[0], ground[1] + 4],
    scaleXY: [k(0, [60, 100], ease.out), k(22, [100, 100])],
    opacity: [k(0, 0), k(18, 100)],
  });
  const machine = layer("tractor", [tractor()], {
    position: ground,
    scale: [k(0, scale * 92, ease.out), k(24, scale * 100)],
    opacity: [k(0, 0, ease.out), k(16, 100)],
  });

  const tag = layer(
    "tag",
    [
      shape(polyline([[0, 0], [0, 34]]), { stroke: palette.graphite900, width: 5 }),
      shape(
        polyline(
          [
            [-14, 30],
            [14, 30],
            [34, 50],
            [34, 124],
            [-34, 124],
            [-34, 50],
          ],
          true,
        ),
        { fill: palette.sun, stroke: palette.sun, width: 8 },
      ),
      shape(circle(7, [0, 48]), { fill: palette.white, stroke: palette.graphite900, width: 4 }),
      group([
        shape(rect({ pos: [0, 80], size: [40, 9], radius: 4.5 }), { fill: palette.terra600 }),
        shape(rect({ pos: [-6, 100], size: [28, 9], radius: 4.5 }), { fill: palette.terra600 }),
      ]),
    ],
    {
      position: hook,
      scale: popIn(16, 12),
      rotation: [
        k(16, 46, ease.inOut),
        k(30, -26, ease.inOut),
        k(43, 15, ease.inOut),
        k(55, -8, ease.inOut),
        k(66, 4, ease.inOut),
        k(78, 0),
      ],
    },
  );
  const pinDot = layer("hook", [shape(circle(6), { fill: palette.graphite900 })], { position: hook, opacity: [k(14, 0), k(18, 100)] });

  return composition({ name: "first-machine", width, height, frames, layers: [shadow, machine, tag, pinDot] });
}
