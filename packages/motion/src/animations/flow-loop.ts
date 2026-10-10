import {
  arc,
  circle,
  composition,
  ease,
  group,
  k,
  layer,
  palette,
  polyline,
  shape,
  type Color,
  type Key,
  type ShapeItem,
  type Vec2,
} from "../lottie/builder.js";
import { motionFrames, motionMeta } from "../meta.js";
import { keyIcon } from "./parts.js";

const CENTER: Vec2 = [256, 262];
const RADIUS = 150;
const SEGMENT = 50;

function magnifier(color: Color): ShapeItem {
  return group([
    shape(circle(17, [-6, -6]), { stroke: color, width: 9 }),
    shape(polyline([[7, 7], [22, 22]]), { stroke: color, width: 11 }),
  ]);
}

function wrench(color: Color): ShapeItem {
  return group([
    shape(polyline([[-20, 20], [4, -4]]), { stroke: color, width: 11 }),
    shape(arc([12, -12], 13, -15, 285), { stroke: color, width: 9 }),
  ]);
}

/**
 * The core loop: inspect, repair and rent sit on a circle and an arrow travels from one
 * to the next, each icon pulsing as the arrow arrives.
 */
export function buildFlowLoop() {
  const { width, height } = motionMeta["flow-loop"];
  const frames = motionFrames["flow-loop"];

  const stations: { angle: number; color: Color; icon: (c: Color) => ShapeItem }[] = [
    { angle: -90, color: palette.info, icon: magnifier },
    { angle: 30, color: palette.terra600, icon: wrench },
    { angle: 150, color: palette.mata600, icon: (c) => group([keyIcon(c, 9)], { scale: 80, position: [-4, 0] }) },
  ];

  const track = layer("track", [
    shape(circle(RADIUS, CENTER), { stroke: palette.graphite200, width: 6, dash: [2, 18] }),
  ]);

  const rotation: Key<number>[] = [];
  const trimStart: Key<number>[] = [];
  for (let s = 0; s < 3; s += 1) {
    const f = s * SEGMENT;
    rotation.push(k(f + 6, s * 120, ease.inOut), k(f + 40, (s + 1) * 120, "hold"));
    trimStart.push(k(f + 6, 100, ease.out), k(f + 24, 0, ease.in), k(f + 40, 100, "hold"));
  }
  const head: Vec2 = [0, -RADIUS];
  const arrow = layer(
    "arrow",
    [
      shape(arc([0, 0], RADIUS, -90 - 70, -90), { stroke: palette.mata600, width: 10, trim: { start: trimStart } }),
      shape(polyline([[head[0] - 6, head[1] - 16], [head[0] + 12, head[1]], [head[0] - 6, head[1] + 16]], true), {
        fill: palette.mata600,
        stroke: palette.mata600,
        width: 6,
      }),
    ],
    { position: CENTER, rotation },
  );

  const icons = stations.map((station, index) => {
    const a = (station.angle * Math.PI) / 180;
    const pos: Vec2 = [CENTER[0] + Math.cos(a) * RADIUS, CENTER[1] + Math.sin(a) * RADIUS];
    const arrival = index === 0 ? 3 * SEGMENT : index * SEGMENT;
    const pulse: Key<number>[] = [k(arrival - 12, 100, ease.out), k(arrival - 4, 114, ease.inOut), k(arrival + 8, 100)];
    const scale = index === 0 ? [k(0, 104, ease.inOut), k(8, 100), ...pulse.slice(0, 2), k(frames, 104)] : pulse;
    return layer(`station-${index}`, [
      shape(circle(54), { fill: palette.white, stroke: station.color, width: 7 }),
      station.icon(station.color),
    ], { position: pos, scale });
  });

  return composition({ name: "flow-loop", width, height, frames, layers: [track, arrow, ...icons] });
}
