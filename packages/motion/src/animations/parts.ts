import {
  arc,
  circle,
  group,
  k,
  mapAnim,
  palette,
  pivot,
  polyline,
  rect,
  shape,
  smoothPath,
  type Anim,
  type Color,
  type Key,
  type ShapeItem,
  type TransformOpts,
  type Vec2,
} from "../lottie/builder.js";

/** Reusable illustrated parts shared by several animations. All parts are drawn around their own origin. */

const REAR_RADIUS = 48;
const FRONT_RADIUS = 28;

function wheel(center: Vec2, radius: number, spin: Anim<number>): ShapeItem {
  const lugs = [0, 90, 180, 270].map((deg) => {
    const a = (deg * Math.PI) / 180;
    const d = radius * 0.34;
    return shape(circle(radius * 0.09, [center[0] + Math.cos(a) * d, center[1] + Math.sin(a) * d]), {
      fill: palette.graphite500,
    });
  });
  return group(
    [
      shape(circle(radius, center), { fill: palette.graphite900 }),
      shape(circle(radius * 0.52, center), { fill: palette.graphite200 }),
      shape(circle(radius * 0.17, center), { fill: palette.graphite500 }),
      ...lugs,
    ],
    pivot(center, { rotation: spin }),
  );
}

export interface TractorOpts {
  /** Rear wheel rotation in degrees; the front wheel turns proportionally faster. */
  readonly spin?: Anim<number>;
  readonly body?: Color;
  /** Colour of the roof, chassis and fender. */
  readonly trim?: Color;
  readonly transform?: TransformOpts;
}

/** Side view of a small tractor facing right. Origin is on the ground, near the middle; about 192 × 160 px. */
export function tractor(opts: TractorOpts = {}): ShapeItem {
  const spin = opts.spin ?? 0;
  const body = opts.body ?? palette.mata600;
  const trim = opts.trim ?? palette.mata700;
  const frontSpin = mapAnim(spin, (v) => (v * REAR_RADIUS) / FRONT_RADIUS);
  return group(
    [
      shape(rect({ pos: [58, -112], size: [11, 42], radius: 5 }), { fill: palette.graphite900 }),
      shape(rect({ pos: [-52, -114], size: [80, 84], radius: 12 }), { fill: body }),
      shape(rect({ pos: [-50, -121], size: [54, 44], radius: 8 }), { fill: palette.graphite50 }),
      shape(rect({ pos: [-52, -160], size: [98, 14], radius: 7 }), { fill: trim }),
      shape(rect({ pos: [30, -72], size: [128, 50], radius: 14 }), { fill: body }),
      shape(circle(7, [84, -80]), { fill: palette.sun }),
      shape(rect({ pos: [8, -42], size: [150, 18], radius: 9 }), { fill: trim }),
      wheel([62, -FRONT_RADIUS], FRONT_RADIUS, frontSpin),
      shape(arc([-50, -REAR_RADIUS], 60, 195, 345), { stroke: trim, width: 12 }),
      wheel([-50, -REAR_RADIUS], REAR_RADIUS, spin),
    ],
    opts.transform,
  );
}

/** Exhaust puffs above the tractor's pipe, repeating every `period` frames. */
export function exhaustPuffs(frames: number, period = 30, offset = 0): ShapeItem {
  const puffs: ShapeItem[] = [];
  for (let start = offset; start + period <= frames + 0.001; start += period) {
    puffs.push(
      shape(circle(9), { fill: palette.graphite200 }, {
        position: [k(start, [64, -126]), k(start + period, [84, -176])],
        scale: [k(start, 40), k(start + period, 130)],
        opacity: [k(start, 0), k(start + 6, 100), k(start + period, 0)],
      }),
    );
  }
  return group(puffs);
}

export interface PhoneOpts {
  readonly width?: number;
  readonly height?: number;
  readonly screen?: Color;
}

/** Phone body and screen, centred on the origin. Default 180 × 320 px. */
export function phone(opts: PhoneOpts = {}): ShapeItem {
  const w = opts.width ?? 180;
  const h = opts.height ?? 320;
  return group([
    shape(rect({ size: [w, h], radius: 30 }), { fill: palette.graphite900 }),
    shape(rect({ size: [w - 20, h - 56], radius: 14 }), { fill: opts.screen ?? palette.graphite50 }),
    shape(rect({ pos: [0, -h / 2 + 14], size: [40, 7], radius: 3.5 }), { fill: palette.graphite500 }),
    shape(rect({ pos: [0, h / 2 - 14], size: [54, 6], radius: 3 }), { fill: palette.graphite500 }),
  ]);
}

/** Check mark path for a badge of radius `r`. */
export function checkPoints(r: number): Vec2[] {
  return [
    [-0.42 * r, 0.02 * r],
    [-0.12 * r, 0.3 * r],
    [0.44 * r, -0.28 * r],
  ];
}

export interface CheckBadgeOpts {
  readonly radius: number;
  readonly position: Anim<Vec2>;
  /** Scale keyframes of the badge. */
  readonly scale: Anim<number>;
  /** Trim end keyframes of the check stroke. */
  readonly draw: Anim<number>;
  readonly color?: Color;
}

/** Filled circle with a white check that draws itself. */
export function checkBadge(opts: CheckBadgeOpts): ShapeItem {
  const r = opts.radius;
  return group(
    [
      shape(circle(r), { fill: opts.color ?? palette.mata600 }),
      shape(polyline(checkPoints(r)), { stroke: palette.white, width: Math.max(4, r * 0.26), trim: { end: opts.draw } }),
    ],
    { position: opts.position, scale: opts.scale },
  );
}

/** Rounded check box whose fill turns green while a check draws itself in. */
export function checkBox(size: number, start: number): ShapeItem {
  const fillColor: Key<Color>[] = [k(start, palette.white, "hold"), k(start + 1, palette.mata600)];
  const strokeColor: Key<Color>[] = [k(start, palette.graphite500, "hold"), k(start + 1, palette.mata600)];
  return group([
    shape(rect({ size: [size, size], radius: size * 0.22 }), { fill: fillColor, stroke: strokeColor, width: 6 }, {
      scale: [k(start, 100), k(start + 4, 86), k(start + 10, 100)],
    }),
    shape(polyline(checkPoints(size * 0.5)), {
      stroke: palette.white,
      width: 6,
      trim: { end: [k(start + 1, 0), k(start + 11, 100)] },
    }),
  ]);
}

/** Simple key: round bow on the left, shaft and two teeth to the right. About 72 × 32 px. */
export function keyIcon(color: Color, width = 8): ShapeItem {
  return group([
    shape(circle(13, [-22, 0]), { stroke: color, width }),
    shape(polyline([[-9, 0], [34, 0]]), { stroke: color, width }),
    shape(polyline([[22, 0], [22, 11]]), { stroke: color, width }),
    shape(polyline([[32, 0], [32, 9]]), { stroke: color, width }),
  ]);
}

/** Head-and-shoulders person glyph, centred on the origin, about 64 px tall. */
export function person(color: Color): ShapeItem {
  return group([
    shape(circle(17, [0, -14]), { fill: color }),
    shape(
      smoothPath(
        [
          [-30, 34],
          [-26, 16],
          [0, 8],
          [26, 16],
          [30, 34],
        ],
        false,
      ),
      { fill: color },
    ),
  ]);
}

/** Cloud silhouette centred on the origin, about 150 × 90 px. */
export function cloud(color: Color): ShapeItem {
  return group([
    shape(
      [circle(30, [-40, 8]), circle(42, [0, -10]), circle(30, [42, 6]), rect({ pos: [0, 22], size: [140, 36], radius: 18 })],
      { fill: color },
    ),
  ]);
}

/** Small leaf with a stem; the stem base is the origin. */
export function leaf(): ShapeItem {
  return group([
    shape(polyline([[0, 0], [0, -26]]), { stroke: palette.mata700, width: 6 }),
    shape(
      smoothPath(
        [
          [0, -22],
          [16, -40],
          [30, -60],
          [8, -56],
          [-2, -38],
        ],
        true,
        0.9,
      ),
      { fill: palette.mata400 },
    ),
  ]);
}

