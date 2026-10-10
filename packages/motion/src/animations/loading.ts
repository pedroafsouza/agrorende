import { composition, ease, k, layer, palette, polyline, shape } from "../lottie/builder.js";
import { motionFrames, motionMeta } from "../meta.js";

/** Loading: three field rows fill green one after another, then drain out to the right. */
export function buildLoading() {
  const { width, height } = motionMeta.loading;
  const frames = motionFrames.loading;

  const rows = [0, 1, 2].flatMap((index) => {
    const y = 186 + index * 70;
    const offset = index * 8;
    const line = polyline([
      [136, y],
      [376, y],
    ]);
    return [
      shape(line, { stroke: palette.graphite200, width: 44 }),
      shape(line, {
        stroke: palette.mata600,
        width: 44,
        trim: {
          end: [k(offset, 0, ease.inOut), k(offset + 22, 100)],
          start: [k(offset + 42, 0, ease.inOut), k(offset + 62, 100)],
        },
      }),
    ];
  });

  return composition({ name: "loading", width, height, frames, layers: [layer("rows", rows)] });
}
