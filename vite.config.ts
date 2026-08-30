import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  base: "./",
  build: {
    outDir: "dist/web",
    // A single-file build has no modulepreload links. Disabling Vite's
    // polyfill also keeps its fetch-based preload helper out of the bundle.
    modulePreload: { polyfill: false },
  },
});
