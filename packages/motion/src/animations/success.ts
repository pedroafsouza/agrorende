import {
  arc,
  circle,
  composition,
  draw,
  ease,
  group,
  k,
  layer,
  palette,
  polyline,
  rect,
  shape,
  type Color,
} from "../lottie/builder";
import { motionFrames, motionMeta } from "../meta";

/** Success: a ring draws itself, a check draws inside it and confetti dots burst out. */
export function buildSuccess() {
  const { width, height } = motionMeta.success;
  const frames = motionFrames.success;
  const center = [256, 256] as const;

  const mark = layer(
    "mark",
    [
      shape(arc([0, 0], 108, -90, 270), { stroke: palette.mata600, width: 18, trim: { end: draw(0, 20, ease.inOut) } }),
      shape(
        polyline([
          [-48, 4],
          [-14, 38],
          [52, -32],
        ]),
        { stroke: palette.mata600, width: 22, trim: { end: draw(16, 14, ease.out) } },
      ),
    ],
    { position: center, scale: [k(0, 88, ease.out), k(16, 100, ease.inOut), k(28, 100, ease.out), k(34, 108, ease.inOut), k(44, 100)] },
  );

  const colors: Color[] = [palette.sun, palette.terra600, palette.info, palette.mata400];
  const confetti = Array.from({ length: 12 }, (_, index) => {
    const angle = ((index * 30 + 15) * Math.PI) / 180;
    const near = 112 + (index % 2) * 12;
    const far = 176 + (index % 3) * 18;
    const color = colors[index % colors.length] ?? palette.sun;
    const piece =
      index % 2 === 0
        ? circle(8)
        : rect({ size: [20, 9], radius: 4.5 });
    const t0 = 28 + (index % 3) * 2;
    return shape(piece, { fill: color }, {
      position: [
        k(t0, [Math.cos(angle) * near, Math.sin(angle) * near], ease.out),
        k(t0 + 24, [Math.cos(angle) * far, Math.sin(angle) * far]),
      ],
      rotation: [k(t0, index * 30), k(t0 + 24, index * 30 + 120)],
      scale: [k(t0, 0, ease.back), k(t0 + 7, 100, ease.inOut), k(t0 + 16, 100, ease.in), k(t0 + 24, 0)],
    });
  });

  return composition({
    name: "success",
    width,
    height,
    frames,
    layers: [layer("confetti", [group(confetti)], { position: center }), mark],
  });
}
