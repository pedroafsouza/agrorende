import type * as React from "react";
import type * as ReactNative from "react-native";

import { initI18n } from "../../src/i18n";

jest.mock("expo-haptics", () => ({
  notificationAsync: jest.fn(),
  impactAsync: jest.fn(),
  selectionAsync: jest.fn(),
  NotificationFeedbackType: { Success: "success", Warning: "warning", Error: "error" },
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
}));

jest.mock("lottie-react-native", () => {
  const { createElement } = jest.requireActual<typeof React>("react");
  const { View } = jest.requireActual<typeof ReactNative>("react-native");
  const LottieView = (props: Record<string, unknown>) => createElement(View, props);
  return { __esModule: true, default: LottieView };
});

void initI18n("pt-BR");
