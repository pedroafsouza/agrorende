import { circle, composition, ease, group, k, layer, palette, rect, shape, type Color, type Vec2 } from "../lottie/builder.js";
import { motionFrames, motionMeta } from "../meta.js";
import { checkBox, keyIcon, person } from "./parts.js";

/** Rental handover: a key passes from the owner's card to the renter's card, then a checklist ticks. */
export function buildRentalHandover() {
  const { width, height } = motionMeta["rental-handover"];
  const frames = motionFrames["rental-handover"];
  const left: Vec2 = [138, 158];
  const right: Vec2 = [374, 158];
  const arrive = 50;

  const card = (pos: Vec2, who: Color, highlight: boolean) =>
    group(
      [
        shape(rect({ size: [180, 196], radius: 24 }), {
          fill: palette.white,
          stroke: highlight
            ? [k(arrive - 2, palette.graphite200, ease.linear), k(arrive + 4, palette.mata600)]
            : palette.graphite200,
          width: 6,
        }),
        shape(circle(38, [0, -36]), { fill: palette.graphite50 }),
        group([person(who)], { position: [0, -34], scale: 78 }),
        shape(rect({ pos: [0, 54], size: [124, 48], radius: 14 }), { fill: palette.graphite50, stroke: palette.graphite200, width: 4 }),
      ],
      { position: pos },
    );

  const cards = layer("cards", [card(left, palette.terra600, false), card(right, palette.info, true)]);

  const slot = (p: Vec2): Vec2 => [p[0], p[1] + 54];
  const key = layer("key", [group([keyIcon(palette.mata700, 9)], { scale: 90 })], {
    position: [k(12, slot(left), ease.inOut), k(31, [256, 70], ease.inOut), k(arrive, slot(right))],
    rotation: [k(12, 0), k(31, -18), k(arrive, 0)],
    scale: [k(12, 100), k(31, 124), k(arrive, 100, ease.inOut), k(arrive + 4, 90, ease.inOut), k(arrive + 10, 100)],
  });

  const checklist = layer(
    "checklist",
    [
      shape(rect({ size: [416, 168], radius: 24 }), { fill: palette.white, stroke: palette.graphite200, width: 6 }),
      ...[0, 1, 2].map((index) =>
        group(
          [
            group([checkBox(34, 62 + index * 14)], { position: [-160, 0] }),
            shape(rect({ pos: [-116 + (224 - index * 40) / 2, 0], size: [224 - index * 40, 12], radius: 6 }), { fill: palette.graphite200 }),
          ],
          { position: [0, -48 + index * 48] },
        ),
      ),
    ],
    { position: [256, 384], opacity: [k(54, 0), k(60, 100)] },
  );

  return composition({ name: "rental-handover", width, height, frames, layers: [cards, checklist, key] });
}
