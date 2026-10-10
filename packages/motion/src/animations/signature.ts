import {
  bezierPath,
  composition,
  ease,
  group,
  k,
  layer,
  palette,
  polyline,
  popIn,
  rect,
  shape,
  smoothVertices,
  type Key,
  type Vec2,
  type Vertex,
} from "../lottie/builder.js";
import { motionFrames, motionMeta } from "../meta.js";
import { checkBadge } from "./parts.js";

function cubic(p0: Vec2, c1: Vec2, c2: Vec2, p1: Vec2, t: number): Vec2 {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return [a * p0[0] + b * c1[0] + c * c2[0] + d * p1[0], a * p0[1] + b * c1[1] + c * c2[1] + d * p1[1]];
}

/** Dense polyline samples of an open bezier path, with cumulative lengths. */
function sample(vertices: readonly Vertex[], perSegment = 24): { points: Vec2[]; lengths: number[] } {
  const points: Vec2[] = [];
  for (let s = 0; s < vertices.length - 1; s += 1) {
    const from = vertices[s];
    const to = vertices[s + 1];
    if (from === undefined || to === undefined) continue;
    const o = from.o ?? [0, 0];
    const i = to.i ?? [0, 0];
    const c1: Vec2 = [from.v[0] + o[0], from.v[1] + o[1]];
    const c2: Vec2 = [to.v[0] + i[0], to.v[1] + i[1]];
    for (let step = s === 0 ? 0 : 1; step <= perSegment; step += 1) {
      points.push(cubic(from.v, c1, c2, to.v, step / perSegment));
    }
  }
  const lengths = [0];
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1] ?? [0, 0];
    const b = points[index] ?? [0, 0];
    lengths.push((lengths[index - 1] ?? 0) + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  return { points, lengths };
}

function pointAt(points: readonly Vec2[], lengths: readonly number[], distance: number): Vec2 {
  for (let index = 1; index < points.length; index += 1) {
    const l1 = lengths[index] ?? 0;
    if (l1 >= distance) {
      const l0 = lengths[index - 1] ?? 0;
      const a = points[index - 1] ?? [0, 0];
      const b = points[index] ?? [0, 0];
      const t = l1 === l0 ? 0 : (distance - l0) / (l1 - l0);
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
  }
  return points[points.length - 1] ?? [0, 0];
}

const smoothstep = (x: number) => x * x * (3 - 2 * x);

/** Signature: a pen writes a signature on a card (trim path), lifts away and a check appears. */
export function buildSignature() {
  const { width, height } = motionMeta.signature;
  const frames = motionFrames.signature;
  const card: Vec2 = [256, 262];

  const scribble: Vec2[] = [
    [-118, 34],
    [-100, -14],
    [-84, 26],
    [-66, -26],
    [-50, 30],
    [-30, 4],
    [-10, 26],
    [12, -18],
    [30, 28],
    [52, 2],
    [74, 22],
    [96, 6],
    [124, 14],
  ];
  const vertices = smoothVertices(scribble, false, 1.1);
  const { points, lengths } = sample(vertices);
  const total = lengths[lengths.length - 1] ?? 1;

  const start = 14;
  const end = 66;
  const trimEnd: Key<number>[] = [];
  const penPos: Key<Vec2>[] = [];
  for (let f = start; f <= end; f += 2) {
    const u = smoothstep((f - start) / (end - start));
    trimEnd.push(k(f, u * 100, ease.linear));
    const p = pointAt(points, lengths, u * total);
    penPos.push(k(f, [card[0] + p[0], card[1] + p[1]], ease.linear));
  }
  const first = penPos[0];
  const last = penPos[penPos.length - 1];
  if (first === undefined || last === undefined) throw new Error("signature samples missing");
  const penPath: Key<Vec2>[] = [
    k(0, [first.v[0] + 70, first.v[1] - 70], ease.out),
    ...penPos,
    k(end + 16, [last.v[0] + 70, last.v[1] - 80]),
  ];

  const sheet = layer(
    "card",
    [
      shape(rect({ size: [380, 230], radius: 24 }), { fill: palette.white, stroke: palette.graphite200, width: 6 }),
      shape(rect({ pos: [-120, -74], size: [100, 12], radius: 6 }), { fill: palette.graphite200 }),
      shape(rect({ pos: [-136, -50], size: [68, 10], radius: 5 }), { fill: palette.graphite200 }),
      shape(polyline([[-150, 64], [150, 64]]), { stroke: palette.graphite200, width: 6 }),
      shape(polyline([[-150, 34], [-136, 48]]), { stroke: palette.graphite500, width: 5 }),
      shape(polyline([[-136, 34], [-150, 48]]), { stroke: palette.graphite500, width: 5 }),
      shape(bezierPath(vertices), { stroke: palette.graphite900, width: 7, trim: { end: trimEnd } }),
    ],
    { position: card },
  );

  const pen = layer(
    "pen",
    [
      group(
        [
          shape(polyline([[0, 0], [-9, -24], [9, -24]], true), { fill: palette.graphite900, stroke: palette.graphite900, width: 4 }),
          shape(rect({ pos: [0, -80], size: [26, 100], radius: 8 }), { fill: palette.info }),
          shape(rect({ pos: [0, -122], size: [26, 22], radius: 8 }), { fill: palette.graphite900 }),
        ],
        { rotation: 32 },
      ),
    ],
    {
      position: penPath,
      opacity: [k(0, 0), k(8, 100, "hold"), k(end + 8, 100), k(end + 16, 0)],
    },
  );

  const check = layer("check", [
    checkBadge({ radius: 28, position: [card[0] + 170, card[1] - 100], scale: popIn(end + 14, 12), draw: [k(end + 18, 0), k(end + 32, 100)] }),
  ]);

  return composition({ name: "signature", width, height, frames, layers: [sheet, pen, check] });
}
