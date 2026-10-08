import type { Config } from "tailwindcss";

import { designTokens } from "@agrorende/design-tokens";

const config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      borderRadius: {
        controls: `${designTokens.radii.controls}px`,
        cards: `${designTokens.radii.cards}px`,
        sheets: `${designTokens.radii.sheets}px`,
      },
      minHeight: {
        touch: `${designTokens.sizes.minTouchTarget}px`,
        primary: `${designTokens.sizes.primaryButtonHeight}px`,
      },
    },
  },
} satisfies Config;

export default config;
