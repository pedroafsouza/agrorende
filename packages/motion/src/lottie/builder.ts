import type { JsonObject, JsonValue, LottieJson } from "./types.js";

/**
 * A tiny typed DSL that emits Lottie (bodymovin 5.7+) JSON.
 *
 * Conventions:
 * - Every list of layers or child groups is written in painter's order (first item is
 *   painted first, so it ends up at the bottom). The builder reverses the lists on output,
 *   because Lottie renders the first layer and the first shape on top.
 * - Angles are in degrees, clockwise, with 0° pointing to +x (the y axis points down).
 * - Opacity, scale and trim values are percentages, as in After Effects.
 */

export const palette = {
  mata600: "#2B8A3E",
  mata700: "#237032",
  mata400: "#51CF66",
  terra600: "#E8590C",
  sun: "#F2B705",
  graphite900: "#1C1F23",
  graphite500: "#6B7280",
  graphite200: "#E3E6EA",
  graphite50: "#F8F9FA",
  white: "#FFFFFF",
  info: "#1D4ED8",
} as const;

export type Color = (typeof palette)[keyof typeof palette];

export type Vec2 = readonly [number, number];

/** Cubic bezier easing of the segment that leaves a keyframe: `o` is (x1, y1), `i` is (x2, y2). */
export interface Ease {
  readonly o: Vec2;
  readonly i: Vec2;
}

export const ease = {
  linear: { o: [0, 0], i: [1, 1] },
  inOut: { o: [0.42, 0], i: [0.58, 1] },
  out: { o: [0.16, 0.6], i: [0.3, 1] },
  in: { o: [0.5, 0], i: [0.84, 0.4] },
  back: { o: [0.34, 1.56], i: [0.64, 1] },
} as const satisfies Record<string, Ease>;

export interface Key<T> {
  readonly t: number;
  readonly v: T;
  /** Easing towards the next keyframe; `"hold"` jumps at the next keyframe. Defaults to ease-in-out. */
  readonly e?: Ease | "hold";
}

export type Anim<T> = T | readonly Key<T>[];

/** Shorthand keyframe constructor. */
export function k<T>(t: number, v: T, e?: Ease | "hold"): Key<T> {
  return e === undefined ? { t, v } : { t, v, e };
}

function isKeys<T>(value: Anim<T>): value is readonly Key<T>[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  const first: unknown = value[0];
  return typeof first === "object" && first !== null && !Array.isArray(first) && "t" in first;
}

/** Maps the values of a static or animated property, keeping the keyframe timing. */
export function mapAnim<T, U>(value: Anim<T>, fn: (v: T) => U): Anim<U> {
  if (isKeys(value)) {
    return value.map((key) => ({ ...key, v: fn(key.v) }));
  }
  return fn(value as T);
}

/** Shifts every keyframe of an animated property by `dt` frames. */
export function delay<T>(value: Anim<T>, dt: number): Anim<T> {
  if (isKeys(value)) {
    return value.map((key) => ({ ...key, t: key.t + dt }));
  }
  return value;
}

function round(n: number, digits = 2): number {
  const f = 10 ** digits;
  const r = Math.round(n * f) / f;
  return Object.is(r, -0) ? 0 : r;
}

type Encoded = number | number[];

function toArray(v: Encoded): number[] {
  return Array.isArray(v) ? v : [v];
}

function encodeProp<T>(value: Anim<T>, conv: (v: T) => Encoded): JsonObject {
  if (!isKeys(value)) {
    return { a: 0, k: conv(value as T) };
  }
  const keys = [...value].sort((a, b) => a.t - b.t);
  const out: JsonValue[] = keys.map((key, index) => {
    const s = toArray(conv(key.v));
    const frame: JsonObject = { t: round(key.t, 3), s };
    if (index === keys.length - 1) return frame;
    if (key.e === "hold") {
      frame.h = 1;
      return frame;
    }
    const e = key.e ?? ease.inOut;
    const dims = s.length;
    frame.o = { x: Array(dims).fill(e.o[0]), y: Array(dims).fill(e.o[1]) };
    frame.i = { x: Array(dims).fill(e.i[0]), y: Array(dims).fill(e.i[1]) };
    return frame;
  });
  return { a: 1, k: out };
}

const num = (v: number): Encoded => round(v);
const vec = (v: Vec2): Encoded => [round(v[0]), round(v[1])];

export function hexToRgba(hex: Color): number[] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1].map((c) => round(c, 4));
}

const color = (c: Color): Encoded => hexToRgba(c);

// ---------------------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------------------

/** A path or parametric shape, before paint is applied. */
export interface Geometry {
  readonly json: JsonObject;
}

export function rect(opts: { size: Anim<Vec2>; pos?: Anim<Vec2>; radius?: Anim<number> }): Geometry {
  return {
    json: {
      ty: "rc",
      d: 1,
      s: encodeProp(opts.size, vec),
      p: encodeProp(opts.pos ?? [0, 0], vec),
      r: encodeProp(opts.radius ?? 0, num),
    },
  };
}

export function ellipse(opts: { size: Anim<Vec2>; pos?: Anim<Vec2> }): Geometry {
  return {
    json: { ty: "el", d: 1, s: encodeProp(opts.size, vec), p: encodeProp(opts.pos ?? [0, 0], vec) },
  };
}

export function circle(radius: number, pos: Vec2 = [0, 0]): Geometry {
  return ellipse({ size: [radius * 2, radius * 2], pos });
}

export interface Vertex {
  readonly v: Vec2;
  /** In tangent, relative to the vertex. */
  readonly i?: Vec2;
  /** Out tangent, relative to the vertex. */
  readonly o?: Vec2;
}

export function bezierPath(vertices: readonly Vertex[], closed = false): Geometry {
  return {
    json: {
      ty: "sh",
      d: 1,
      ks: {
        a: 0,
        k: {
          i: vertices.map((p) => vec(p.i ?? [0, 0])),
          o: vertices.map((p) => vec(p.o ?? [0, 0])),
          v: vertices.map((p) => vec(p.v)),
          c: closed,
        },
      },
    },
  };
}

/** Straight segments through the points. */
export function polyline(points: readonly Vec2[], closed = false): Geometry {
  return bezierPath(
    points.map((v) => ({ v })),
    closed,
  );
}

function at<T>(list: readonly T[], index: number): T {
  const item = list[index];
  if (item === undefined) throw new RangeError(`index ${index} out of range`);
  return item;
}

/** Catmull-Rom spline through the points, as cubic bezier vertices. */
export function smoothVertices(points: readonly Vec2[], closed = false, tension = 1): Vertex[] {
  const n = points.length;
  return points.map((p, index) => {
    const prev = closed ? at(points, (index - 1 + n) % n) : at(points, Math.max(0, index - 1));
    const next = closed ? at(points, (index + 1) % n) : at(points, Math.min(n - 1, index + 1));
    const tx = ((next[0] - prev[0]) / 6) * tension;
    const ty = ((next[1] - prev[1]) / 6) * tension;
    return { v: p, i: [-tx, -ty], o: [tx, ty] };
  });
}

export function smoothPath(points: readonly Vec2[], closed = false, tension = 1): Geometry {
  return bezierPath(smoothVertices(points, closed, tension), closed);
}

/** Vertices of a circular arc from `startDeg` to `endDeg` (clockwise when end > start). */
export function arcVertices(center: Vec2, radius: number, startDeg: number, endDeg: number): Vertex[] {
  const total = endDeg - startDeg;
  const segments = Math.max(1, Math.ceil(Math.abs(total) / 90));
  const step = ((total / segments) * Math.PI) / 180;
  const kappa = (4 / 3) * Math.tan(step / 4) * radius;
  const result: Vertex[] = [];
  for (let s = 0; s <= segments; s += 1) {
    const a = (startDeg * Math.PI) / 180 + step * s;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const tangent: Vec2 = [-sin * kappa, cos * kappa];
    result.push({
      v: [center[0] + cos * radius, center[1] + sin * radius],
      i: s === 0 ? [0, 0] : [-tangent[0], -tangent[1]],
      o: s === segments ? [0, 0] : tangent,
    });
  }
  return result;
}

export function arc(center: Vec2, radius: number, startDeg: number, endDeg: number): Geometry {
  return bezierPath(arcVertices(center, radius, startDeg, endDeg));
}

// ---------------------------------------------------------------------------------------
// Paint, modifiers and transforms
// ---------------------------------------------------------------------------------------

export interface Paint {
  readonly fill?: Anim<Color>;
  readonly fillOpacity?: Anim<number>;
  readonly stroke?: Anim<Color>;
  readonly width?: Anim<number>;
  readonly strokeOpacity?: Anim<number>;
  /** Dash and gap lengths in pixels. */
  readonly dash?: Vec2;
  /** Trim paths (percent), used for line-draw effects. */
  readonly trim?: { readonly start?: Anim<number>; readonly end?: Anim<number>; readonly offset?: Anim<number> };
}

export interface TransformOpts {
  readonly anchor?: Anim<Vec2>;
  readonly position?: Anim<Vec2>;
  /** Uniform scale, percent. */
  readonly scale?: Anim<number>;
  /** Non-uniform scale, percent. Overrides `scale`. */
  readonly scaleXY?: Anim<Vec2>;
  readonly rotation?: Anim<number>;
  readonly opacity?: Anim<number>;
}

/** Transform that rotates or scales around `point` without moving it. */
export function pivot(point: Vec2, rest: Omit<TransformOpts, "anchor" | "position"> = {}): TransformOpts {
  return { ...rest, anchor: point, position: point };
}

function scaleOf(t: TransformOpts): Anim<Vec2> {
  if (t.scaleXY !== undefined) return t.scaleXY;
  return mapAnim<number, Vec2>(t.scale ?? 100, (s) => [s, s]);
}

function groupTransform(t: TransformOpts): JsonObject {
  return {
    ty: "tr",
    p: encodeProp(t.position ?? [0, 0], vec),
    a: encodeProp(t.anchor ?? [0, 0], vec),
    s: encodeProp(scaleOf(t), vec),
    r: encodeProp(t.rotation ?? 0, num),
    o: encodeProp(t.opacity ?? 100, num),
    sk: { a: 0, k: 0 },
    sa: { a: 0, k: 0 },
  };
}

/** A shape group (`gr`), ready to be placed in a layer or in another group. */
export interface ShapeItem {
  readonly json: JsonObject;
}

/** Geometry plus paint (and optional trim) inside one group. */
export function shape(geometry: Geometry | readonly Geometry[], paint: Paint, transform: TransformOpts = {}): ShapeItem {
  const geoms = Array.isArray(geometry) ? (geometry as readonly Geometry[]) : [geometry as Geometry];
  const items: JsonObject[] = geoms.map((g) => g.json);
  if (paint.trim !== undefined) {
    items.push({
      ty: "tm",
      s: encodeProp(paint.trim.start ?? 0, num),
      e: encodeProp(paint.trim.end ?? 100, num),
      o: encodeProp(paint.trim.offset ?? 0, num),
      m: 1,
    });
  }
  if (paint.stroke !== undefined) {
    const strokeJson: JsonObject = {
      ty: "st",
      c: encodeProp(paint.stroke, color),
      o: encodeProp(paint.strokeOpacity ?? 100, num),
      w: encodeProp(paint.width ?? 8, num),
      lc: 2,
      lj: 2,
      ml: 4,
    };
    if (paint.dash !== undefined) {
      strokeJson.d = [
        { n: "d", nm: "dash", v: { a: 0, k: paint.dash[0] } },
        { n: "g", nm: "gap", v: { a: 0, k: paint.dash[1] } },
        { n: "o", nm: "offset", v: { a: 0, k: 0 } },
      ];
    }
    items.push(strokeJson);
  }
  if (paint.fill !== undefined) {
    items.push({ ty: "fl", c: encodeProp(paint.fill, color), o: encodeProp(paint.fillOpacity ?? 100, num), r: 1 });
  }
  items.push(groupTransform(transform));
  return { json: { ty: "gr", it: items, np: items.length - 1 } };
}

/** Groups child items, given in painter's order (first child at the bottom). */
export function group(children: readonly ShapeItem[], transform: TransformOpts = {}): ShapeItem {
  const items: JsonObject[] = [...children].reverse().map((c) => c.json);
  items.push(groupTransform(transform));
  return { json: { ty: "gr", it: items, np: items.length - 1 } };
}

// ---------------------------------------------------------------------------------------
// Layers and composition
// ---------------------------------------------------------------------------------------

export interface LayerSpec {
  readonly name: string;
  readonly shapes: readonly ShapeItem[];
  readonly transform: TransformOpts;
  readonly inPoint?: number;
  readonly outPoint?: number;
}

/** A shape layer. `shapes` are in painter's order. */
export function layer(
  name: string,
  shapes: readonly ShapeItem[],
  transform: TransformOpts = {},
  range: { inPoint?: number; outPoint?: number } = {},
): LayerSpec {
  return { name, shapes, transform, ...range };
}

const vec3 =
  (z: number) =>
  (v: Vec2): Encoded => [round(v[0]), round(v[1]), z];

export interface CompositionSpec {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly frames: number;
  readonly fps?: number;
  /** Layers in painter's order. */
  readonly layers: readonly LayerSpec[];
}

export function composition(spec: CompositionSpec): LottieJson {
  const total = spec.layers.length;
  const layers: JsonObject[] = spec.layers.map((l, index) => ({
    ddd: 0,
    ind: total - index,
    ty: 4,
    nm: l.name,
    sr: 1,
    ks: {
      o: encodeProp(l.transform.opacity ?? 100, num),
      r: encodeProp(l.transform.rotation ?? 0, num),
      p: encodeProp(l.transform.position ?? [0, 0], vec3(0)),
      a: encodeProp(l.transform.anchor ?? [0, 0], vec3(0)),
      s: encodeProp(scaleOf(l.transform), vec3(100)),
    },
    ao: 0,
    shapes: [...l.shapes].reverse().map((s) => s.json),
    ip: l.inPoint ?? 0,
    op: l.outPoint ?? spec.frames,
    st: 0,
    bm: 0,
  }));
  return {
    v: "5.7.4",
    fr: spec.fps ?? 30,
    ip: 0,
    op: spec.frames,
    w: spec.width,
    h: spec.height,
    nm: spec.name,
    ddd: 0,
    assets: [],
    layers: layers.reverse(),
    markers: [],
  };
}

// ---------------------------------------------------------------------------------------
// Motion helpers
// ---------------------------------------------------------------------------------------

/** Scale keyframes that pop an element in from 0 with a slight overshoot. */
export function popIn(start: number, duration = 12, to = 100): Key<number>[] {
  return [k(start, 0, ease.back), k(start + duration, to)];
}

/** Scale keyframes that pop in and later shrink out. */
export function popInOut(start: number, end: number, duration = 12): Key<number>[] {
  return [k(start, 0, ease.back), k(start + duration, 100), k(end - duration, 100, ease.in), k(end, 0)];
}

export function fade(from: number, to: number, start: number, duration = 10): Key<number>[] {
  return [k(start, from), k(start + duration, to)];
}

/** Trim end keyframes that draw a stroke from 0 to 100 percent. */
export function draw(start: number, duration = 15, e: Ease = ease.inOut): Key<number>[] {
  return [k(start, 0, e), k(start + duration, 100)];
}
