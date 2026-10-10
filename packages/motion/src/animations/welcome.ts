import {
  circle,
  composition,
  draw,
  ease,
  group,
  k,
  layer,
  palette,
  polyline,
  popIn,
  rect,
  ellipse,
  shape,
  type ShapeItem,
} from "../lottie/builder";
import { motionFrames, motionMeta } from "../meta";
import { exhaustPuffs, tractor } from "./parts";

/** First-run welcome: the sun rises over green field rows while a small tractor drives in. */
export function buildWelcome() {
  const { width, height } = motionMeta.welcome;
  const frames = motionFrames.welcome;

  const rays: ShapeItem[] = Array.from({ length: 10 }, (_, index) => {
    const a = (index * 36 * Math.PI) / 180;
    return shape(
      polyline([
        [Math.cos(a) * 80, Math.sin(a) * 80],
        [Math.cos(a) * 104, Math.sin(a) * 104],
      ]),
      { stroke: palette.sun, width: 12 },
    );
  });

  const sun = layer(
    "sun",
    [
      group(rays, { scale: popIn(34, 16), rotation: [k(34, -20, ease.out), k(frames, 16)] }),
      shape(circle(58), { fill: palette.sun }),
    ],
    { position: [k(0, [590, 330], ease.out), k(55, [590, 200])] },
  );

  const hills = layer("hills", [
    shape(ellipse({ size: [420, 150], pos: [250, 305] }), { fill: palette.mata400 }),
    shape(ellipse({ size: [430, 170], pos: [560, 310] }), { fill: palette.mata400 }),
  ]);

  const rows = [345, 385, 425].map((y, index) =>
    shape(polyline([[96, y], [704, y]]), {
      stroke: palette.mata700,
      width: 12,
      trim: { end: draw(6 + index * 8, 34, ease.out) },
    }),
  );
  const field = layer("field", [
    shape(rect({ pos: [400, 385], size: [720, 170], radius: 40 }), { fill: palette.mata600 }),
    ...rows,
  ]);

  const travel = 500;
  const scale = 1.05;
  const turns = ((travel / scale / 48) * 180) / Math.PI;
  const machine = layer(
    "tractor",
    [
      exhaustPuffs(frames, 30, 10),
      tractor({ body: palette.terra600, trim: palette.graphite900, spin: [k(26, 0, ease.out), k(96, turns)] }),
    ],
    {
      position: [k(26, [340 - travel, 446], ease.out), k(96, [340, 446])],
      scale: scale * 100,
    },
  );

  return composition({ name: "welcome", width, height, frames, layers: [sun, hills, field, machine] });
}
