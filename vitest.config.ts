import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/cli.ts"],
      thresholds: {
        statements: 95,
        branches: 80,
        functions: 90,
        lines: 95,
      },
    },
  },
});
