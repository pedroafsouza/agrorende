import {
  arc,
  circle,
  composition,
  ease,
  group,
  k,
  layer,
  palette,
  pivot,
  polyline,
  rect,
  shape,
  type Key,
} from "../lottie/builder";
import { motionFrames, motionMeta } from "../meta";
import { exhaustPuffs, tractor } from "./parts";

/** Cost per machine hour: the hour-meter needle sweeps while a coin stack grows beside the tractor. */
export function buildMachineCost() {
  const { width, height } = motionMeta["machine-cost"];
  const frames = motionFrames["machine-cost"];

  const sweep: Key<number>[] = [k(6, 0, ease.inOut), k(88, 1, ease.inOut), k(112, 0)];
  const needleRotation = sweep.map((key) => ({ ...key, v: -120 + key.v * 240 }));
  const progress = sweep.map((key) => ({ ...key, v: key.v * 100 }));

  const ticks = [-120, -60, 0, 60, 120].map((deg) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return shape(
      polyline([
        [Math.cos(a) * 66, Math.sin(a) * 66],
        [Math.cos(a) * 74, Math.sin(a) * 74],
      ]),
      { stroke: palette.graphite500, width: 5 },
    );
  });

  const dial = layer(
    "hour-meter",
    [
      shape(circle(92), { fill: palette.white, stroke: palette.graphite900, width: 9 }),
      shape(arc([0, 0], 56, 150, 390), { stroke: palette.graphite200, width: 12 }),
      shape(arc([0, 0], 56, 150, 390), { stroke: palette.mata600, width: 12, trim: { end: progress } }),
      ...ticks,
      shape(polyline([[0, 6], [0, -50]]), { stroke: palette.graphite900, width: 8 }, pivot([0, 0], { rotation: needleRotation })),
      shape(circle(10), { fill: palette.terra600 }),
    ],
    { position: [256, 140] },
  );

  const machine = layer("tractor", [exhaustPuffs(frames, 40), tractor()], { position: [180, 448], scale: 88 });

  const coins = Array.from({ length: 4 }, (_, index) => {
    const y = 448 - 13 - index * 26;
    const start = 14 + index * 16;
    return shape(rect({ size: [84, 24], radius: 12 }), { fill: palette.sun, stroke: palette.terra600, width: 5 }, {
      position: [k(start, [400, y - 56], ease.out), k(start + 10, [400, y])],
      opacity: [k(start, 0, ease.out), k(start + 4, 100, "hold"), k(98, 100), k(110, 0)],
    });
  });
  const stack = layer("coins", [group(coins)]);

  return composition({ name: "machine-cost", width, height, frames, layers: [machine, stack, dial] });
}
