import { animations, motionMeta, type AnimationId } from "@agrorende/motion";
import LottieView, { type AnimationObject } from "lottie-react-native";
import { useEffect, useState } from "react";
import { AccessibilityInfo, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

export type { AnimationId };

export type LottieProps = {
  readonly id: AnimationId;
  /** Overrides the loop flag from `motionMeta`. */
  readonly loop?: boolean;
  /** Plays once and stops on the last frame, whatever `motionMeta` says. */
  readonly playOnce?: boolean;
  /** Maximum width in dp. The height follows the animation's aspect ratio. */
  readonly size?: number;
  readonly onFinish?: () => void;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
};

const sources = new Map<AnimationId, AnimationObject>();

function sourceFor(id: AnimationId): AnimationObject {
  const cached = sources.get(id);
  if (cached !== undefined) return cached;
  const json = animations[id];
  const source: AnimationObject = { ...json, assets: Array.isArray(json.assets) ? json.assets : [], layers: json.layers };
  sources.set(id, source);
  return source;
}

/** Normalised progress (0–1) of the still frame shown when the user prefers reduced motion. */
export function posterProgress(id: AnimationId): number {
  const total = animations[id].op;
  return total > 0 ? Math.min(1, motionMeta[id].posterFrame / total) : 0;
}

/**
 * The OS "Reduce motion" setting. `undefined` until the first read resolves, so nothing plays
 * for a frame before the setting is known.
 */
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
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => {
      active = false;
      sub.remove();
    };
  }, []);
  return reduced;
}

/**
 * Decorative Lottie animation from `@agrorende/motion` (SIMPLER-TO-SELL §6). It is hidden from
 * screen readers because the meaning always lives in the translated text beside it. With
 * "Reduce motion" on, it shows the poster frame and never plays.
 */
export function Lottie({ id, loop, playOnce = false, size = 160, onFinish, style, testID = `lottie-${id}` }: LottieProps) {
  const reduced = useReduceMotionSetting();
  const meta = motionMeta[id];
  const shouldLoop = playOnce ? false : (loop ?? meta.loop);
  const still = reduced !== false;
  return (
    <View
      testID={testID}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[styles.wrap, { maxWidth: size, aspectRatio: meta.width / meta.height }, style]}
    >
      {reduced === undefined ? null : (
        <LottieView
          key={still ? "still" : "play"}
          testID={`${testID}-player`}
          source={sourceFor(id)}
          autoPlay={!still}
          loop={!still && shouldLoop}
          progress={still ? posterProgress(id) : undefined}
          resizeMode="contain"
          onAnimationFinish={(cancelled) => {
            if (!cancelled) onFinish?.();
          }}
          style={styles.fill}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: "center", width: "100%" },
  fill: { flex: 1 },
});
