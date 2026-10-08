import react from "@agrorende/config/eslint/react";

export default [
  ...react({ devOnly: ["app/(dev)/**"] }),
  {
    // Metro loads its configuration with require(), so this one file stays CommonJS.
    files: ["metro.config.cjs"],
    languageOptions: { sourceType: "commonjs", globals: { require: "readonly", module: "writable", __dirname: "readonly" } },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
];
