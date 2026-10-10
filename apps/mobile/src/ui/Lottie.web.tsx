import { animations, motionMeta, type AnimationId } from "@agrorende/motion";
import lottie from "lottie-web/build/player/lottie_light";
import { useEffect, useRef, useState, type ComponentRef } from "react";
import { AccessibilityInfo, StyleSheet, View } from "react-native";

import type { LottieProps } from "./Lottie";

export type { AnimationId };
export type { LottieProps };

/**
 * Web variant of `Lottie.tsx` (development web preview only). lottie-react-native needs
 * `@lottiefiles/dotlottie-react` on the web, which downloads its engine from a CDN, so the web
 * build plays the same JSON with `lottie-web` instead. Native builds never load this file.
 */
export function posterProgress(id: AnimationId): number {
  const total = animations[id].op;
  return total > 0 ? Math.min(1, motionMeta[id].posterFrame / total) : 0;
}

export function useReduceMotionSetting(): boolean | undefined {
  const [reduced, setReduced] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (active) setReduced(value);
      })
      .catch(() => {
        if (active) setReduced(false);
      });
    return () => {
      active = false;
    };
  }, []);
  return reduced;
}

export function Lottie({ id, loop, playOnce = false, size = 160, onFinish, style, testID = `lottie-${id}` }: LottieProps) {
  const reduced = useReduceMotionSetting();
  const meta = motionMeta[id];
  const shouldLoop = playOnce ? false : (loop ?? meta.loop);
  const host = useRef<ComponentRef<typeof View>>(null);
  const finish = useRef(onFinish);
  finish.current = onFinish;

  useEffect(() => {
    const container = host.current as unknown as HTMLElement | null;
    if (reduced === undefined || container === null) return undefined;
    const still = reduced;
    const player = lottie.loadAnimation({
      container,
      renderer: "svg",
      loop: !still && shouldLoop,
      autoplay: !still,
      animationData: JSON.parse(JSON.stringify(animations[id])) as unknown,
      rendererSettings: { preserveAspectRatio: "xMidYMid meet" },
    });
    if (still) player.goToAndStop(meta.posterFrame, true);
    const done = () => finish.current?.();
    player.addEventListener("complete", done);
    return () => {
      player.removeEventListener("complete", done);
      player.destroy();
    };
  }, [id, reduced, shouldLoop, meta.posterFrame]);

  return (
    <View
      testID={testID}
      accessible={false}
      aria-hidden
      pointerEvents="none"
      style={[styles.wrap, { maxWidth: size, aspectRatio: meta.width / meta.height }, style]}
    >
      <View ref={host} testID={`${testID}-player`} style={styles.fill} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: "center", width: "100%" },
  fill: { flex: 1 },
});
