import { CORE_RESTRICTED } from "@agrorende/config/eslint";
import node from "@agrorende/config/eslint/node";

/** ARCHITECTURE §4 lets these folders import one otherwise restricted package each. */
const SCOPED_ALLOWANCES = [
  { files: ["src/jobs/**"], allow: "bullmq" },
  { files: ["src/modules/exports/**"], allow: "csv-stringify" },
  { files: ["src/pdf/**"], allow: "@react-pdf/renderer" },
];

export default [
  ...node({ restricted: CORE_RESTRICTED }),
  ...SCOPED_ALLOWANCES.map(({ files, allow }) => ({
    files,
    ignores: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        { ...CORE_RESTRICTED, paths: CORE_RESTRICTED.paths.filter((entry) => entry.name !== allow) },
      ],
    },
  })),
];
