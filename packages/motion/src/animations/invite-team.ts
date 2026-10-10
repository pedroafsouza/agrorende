import {
  circle,
  composition,
  draw,
  group,
  k,
  layer,
  palette,
  pivot,
  polyline,
  popIn,
  rect,
  shape,
  type Vec2,
} from "../lottie/builder.js";
import { motionFrames, motionMeta } from "../meta.js";
import { checkBadge, keyIcon, person, phone } from "./parts.js";

/** Inviting the team: the phone receives a chat bubble with an access key, then a person appears with a check. */
export function buildInviteTeam() {
  const { width, height } = motionMeta["invite-team"];
  const frames = motionFrames["invite-team"];
  const phonePos: Vec2 = [160, 270];
  const avatarPos: Vec2 = [380, 262];

  const tailCorner: Vec2 = [-46, 16];
  const bubble = group(
    [
      shape(polyline([[-44, 0], [-16, 0], [-50, 26]], true), { fill: palette.mata600, stroke: palette.mata600, width: 4 }),
      shape(rect({ pos: [0, -24], size: [124, 82], radius: 20 }), { fill: palette.mata600 }),
      shape(rect({ pos: [0, -24], size: [84, 46], radius: 8 }), { fill: palette.white }),
      group([keyIcon(palette.mata700, 9)], { position: [-4, -24], scale: popIn(26, 10, 62) }),
    ],
    pivot(tailCorner, { scale: popIn(10, 14) }),
  );
  const device = layer(
    "phone",
    [
      phone({ width: 170, height: 300 }),
      shape(rect({ pos: [-20, -98], size: [96, 10], radius: 5 }), { fill: palette.graphite200 }),
      shape(rect({ pos: [-34, 70], size: [68, 10], radius: 5 }), { fill: palette.graphite200 }),
      bubble,
    ],
    { position: phonePos },
  );

  const link = layer("link", [
    shape(polyline([[phonePos[0] + 100, 250], [avatarPos[0] - 78, 250]]), {
      stroke: palette.graphite500,
      width: 6,
      dash: [1, 14],
      trim: { end: draw(36, 14) },
    }),
  ]);

  const avatar = layer(
    "person",
    [shape(circle(62), { fill: palette.white, stroke: palette.info, width: 7 }), group([person(palette.info)], { scale: 120, position: [0, 4] })],
    { position: avatarPos, scale: popIn(48, 14) },
  );
  const check = layer("check", [
    checkBadge({ radius: 22, position: [avatarPos[0] + 46, avatarPos[1] + 46], scale: popIn(70, 12), draw: [k(74, 0), k(88, 100)] }),
  ]);

  return composition({ name: "invite-team", width, height, frames, layers: [link, device, avatar, check] });
}
