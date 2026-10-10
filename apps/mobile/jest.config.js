const shared = {
  moduleNameMapper: {
    "^@agrorende/contracts$": "<rootDir>/../../packages/contracts/src/index.ts",
    "^@agrorende/contracts/(.*)$": "<rootDir>/../../packages/contracts/src/$1",
    "^@agrorende/design-tokens$": "<rootDir>/../../packages/design-tokens/src/index.ts",
    "^@agrorende/motion$": "<rootDir>/../../packages/motion/src/index.ts",
    "^@agrorende/i18n$": "<rootDir>/../../packages/i18n/src/index.ts",
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
};

const transformIgnorePatterns = [
  "node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|uuidv7|lucide-react-native|zustand|i18next-icu|intl-messageformat|@formatjs/.*))",
];

export default {
  projects: [
    {
      ...shared,
      displayName: "engine",
      testEnvironment: "node",
      testMatch: ["<rootDir>/test/engine/**/*.test.ts", "<rootDir>/test/foundation.test.js"],
      transform: { "^.+\\.[jt]sx?$": ["babel-jest", { presets: ["babel-preset-expo"] }] },
      transformIgnorePatterns,
    },
    {
      ...shared,
      displayName: "ui",
      preset: "jest-expo",
      testMatch: ["<rootDir>/test/ui/**/*.test.tsx", "<rootDir>/test/ui/**/*.test.ts"],
      transformIgnorePatterns,
      setupFiles: ["<rootDir>/test/ui/setup.ts"],
    },
  ],
};
