import node from "@agrorende/config/eslint/node";

export default node({ restricted: { paths: [], patterns: [{ group: ["@agrorende/*/src/*"], message: "Import the package entry point, not its internals." }] } });
