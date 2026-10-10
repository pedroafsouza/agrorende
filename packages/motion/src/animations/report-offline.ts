import {
  circle,
  composition,
  ease,
  group,
  k,
  layer,
  palette,
  polyline,
  popIn,
  popInOut,
  rect,
  shape,
  type Color,
  type Key,
  type Vec2,
} from "../lottie/builder";
import { motionFrames, motionMeta } from "../meta";
import { checkBadge, cloud, phone, tractor } from "./parts";

/**
 * Works without signal: the phone has no signal, the camera flashes and a tractor photo is
 * saved on the phone with a check. Signal returns and the photo travels up to the cloud.
 */
export function buildReportOffline() {
  const { width, height } = motionMeta["report-offline"];
  const frames = motionFrames["report-offline"];
  const phonePos: Vec2 = [196, 290];
  const online = 70;
  const offlineAgain = 138;

  const barColor: Key<Color>[] = [
    k(online, palette.graphite500, ease.linear),
    k(online + 6, palette.mata600, "hold"),
    k(offlineAgain, palette.mata600, ease.linear),
    k(offlineAgain + 6, palette.graphite500),
  ];
  const bars = [8, 13, 18, 23].map((h, index) =>
    shape(rect({ pos: [36 + index * 10, -108 - h / 2], size: [7, h], radius: 3.5 }), { fill: barColor }),
  );
  const slash = shape(polyline([[32, -104], [68, -128]]), { stroke: palette.terra600, width: 5 }, {
    opacity: [k(online, 100, ease.linear), k(online + 6, 0, "hold"), k(offlineAgain, 0, ease.linear), k(offlineAgain + 6, 100)],
  });

  const bracket = (x: number, y: number) => {
    const sx = Math.sign(x);
    const sy = Math.sign(y + 25);
    return shape(polyline([[x, y - sy * 18], [x, y], [x - sx * 18, y]]), { stroke: palette.graphite500, width: 5 });
  };
  const viewfinder = group([
    shape(rect({ pos: [0, 16], size: [116, 26], radius: 8 }), { fill: palette.mata400 }),
    tractor({ transform: { position: [4, 24], scale: 44 } }),
    bracket(-66, -90),
    bracket(66, -90),
    bracket(-66, 40),
    bracket(66, 40),
  ]);
  const shutter = shape(circle(20), { fill: palette.white, stroke: palette.graphite500, width: 6 }, {
    position: [0, 92],
    scale: [k(12, 100), k(17, 78), k(24, 100)],
  });
  const flash = shape(rect({ size: [160, 264], radius: 14 }), { fill: palette.white }, {
    opacity: [k(18, 0, ease.linear), k(21, 100, ease.out), k(34, 0)],
  });

  const device = layer("phone", [phone(), viewfinder, shutter, ...bars, slash, flash], { position: phonePos });

  const thumbHome: Vec2 = [phonePos[0] - 50, phonePos[1] + 92];
  const cloudPos: Vec2 = [384, 128];
  const thumb = layer(
    "photo",
    [
      group([
        shape(rect({ size: [56, 44], radius: 9 }), { fill: palette.white, stroke: palette.graphite200, width: 4 }),
        shape(rect({ pos: [0, 10], size: [44, 12], radius: 4 }), { fill: palette.mata400 }),
        tractor({ transform: { position: [0, 14], scale: 17 } }),
      ]),
      checkBadge({ radius: 13, position: [26, -20], scale: popIn(38, 10), draw: [k(42, 0), k(52, 100)] }),
    ],
    {
      position: [k(84, thumbHome, ease.inOut), k(97, [300, 196], ease.inOut), k(110, [cloudPos[0], cloudPos[1] + 8])],
      scale: [k(24, 0, ease.back), k(34, 100, "hold"), k(84, 100), k(110, 45)],
      opacity: [k(102, 100), k(110, 0)],
    },
  );

  const sky = layer(
    "cloud",
    [
      cloud(palette.info),
      shape(polyline([[0, 30], [0, -8]]), { stroke: palette.white, width: 9 }),
      shape(polyline([[-16, 6], [0, -10], [16, 6]]), { stroke: palette.white, width: 9 }),
    ],
    { position: cloudPos, scale: [k(106, 100), k(112, 112), k(120, 100)] },
  );
  const cloudCheck = layer("cloud-check", [
    checkBadge({ radius: 20, position: [cloudPos[0] + 60, cloudPos[1] + 40], scale: popInOut(112, 144, 10), draw: [k(116, 0), k(128, 100)] }),
  ]);

  return composition({ name: "report-offline", width, height, frames, layers: [sky, device, thumb, cloudCheck] });
}
