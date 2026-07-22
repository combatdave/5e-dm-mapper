import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// The app source lives in app/; `npm run build` emits ONE self-contained
// index.html at the repo root (map image, styles and code all inlined),
// which GitHub Pages serves directly.
export default defineConfig({
  root: "app",
  publicDir: false,
  plugins: [react(), viteSingleFile()],
  build: {
    outDir: "..",
    emptyOutDir: false,
    assetsInlineLimit: 100_000_000,
  },
});
