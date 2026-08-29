import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "es2022",
});
