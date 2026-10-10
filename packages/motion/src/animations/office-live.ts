import {
  circle,
  composition,
  ease,
  group,
  k,
  layer,
  palette,
  polyline,
  popInOut,
  rect,
  shape,
  smoothPath,
  type Color,
  type Key,
  type ShapeItem,
  type Vec2,
} from "../lottie/builder.js";
import { motionFrames, motionMeta } from "../meta.js";
import { checkBadge } from "./parts.js";

function pin(color: Color, at: Vec2, start: number, end: number): ShapeItem {
  return group(
    [
      shape(polyline([[-13, -24], [13, -24], [0, 0]], true), { fill: color, stroke: color, width: 4 }),
      shape(circle(17, [0, -32]), { fill: color }),
      shape(circle(6.5, [0, -32]), { fill: palette.white }),
    ],
    { position: at, scale: popInOut(start, end, 12) },
  );
}

/** The office sees the field live: pins pop onto a map card and a list row turns green. */
export function buildOfficeLive() {
  const { width, height } = motionMeta["office-live"];
  const frames = motionFrames["office-live"];
  const reset = 136;

  const map = layer(
    "map",
    [
      shape(rect({ size: [320, 210], radius: 24 }), { fill: palette.graphite50, stroke: palette.graphite200, width: 6 }),
      shape(rect({ pos: [-88, -38], size: [96, 62], radius: 12 }), { fill: palette.mata400 }),
      shape(rect({ pos: [78, 46], size: [104, 58], radius: 12 }), { fill: palette.mata400 }),
      shape(
        smoothPath([
          [-150, 70],
          [-50, 40],
          [10, -10],
          [80, -50],
          [150, -60],
        ]),
        { stroke: palette.graphite200, width: 14 },
      ),
      pin(palette.info, [-88, -30], 10, reset),
      pin(palette.terra600, [86, 44], 22, reset),
      shape(circle(12, [8, 6]), { stroke: palette.mata600, width: 5 }, {
        position: [0, 0],
        scale: [k(48, 100, ease.out), k(72, 320)],
        opacity: [k(48, 0, "hold"), k(49, 100, ease.out), k(72, 0)],
      }),
      pin(palette.mata600, [8, 6], 34, reset),
    ],
    { position: [256, 160] },
  );

  const stateColor = (from: Color, to: Color): Key<Color>[] => [
    k(56, from, ease.linear),
    k(62, to, "hold"),
    k(reset, to, ease.linear),
    k(reset + 6, from),
  ];

  const rows = [0, 1, 2].map((index) => {
    const live = index === 1;
    const y = 318 + index * 62;
    const items: ShapeItem[] = [
      shape(rect({ size: [320, 50], radius: 16 }), {
        fill: palette.white,
        stroke: live ? stateColor(palette.graphite200, palette.mata600) : palette.graphite200,
        width: 5,
      }),
      shape(circle(10, [-128, 0]), { fill: live ? stateColor(palette.graphite200, palette.mata600) : palette.graphite200 }),
      shape(rect({ pos: [-44, 0], size: [128, 12], radius: 6 }), { fill: palette.graphite200 }),
      shape(rect({ pos: [70, 0], size: [44, 12], radius: 6 }), { fill: palette.graphite200 }),
    ];
    if (live) {
      items.push(checkBadge({ radius: 15, position: [132, 0], scale: popInOut(58, reset + 4, 10), draw: [k(62, 0), k(74, 100)] }));
    }
    return group(items, { position: [256, y] });
  });

  return composition({ name: "office-live", width, height, frames, layers: [map, layer("list", rows)] });
}
