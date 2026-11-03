import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const src = resolve(import.meta.dirname, "src");

export default defineConfig({
  root: src,
  publicDir: resolve(import.meta.dirname, "public"),
  plugins: [react(), tailwindcss()],
  build: {
    outDir: resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(src, "popup/index.html"),
        options: resolve(src, "options/index.html"),
        background: resolve(src, "background/index.ts"),
      },
      output: {
        // The manifest points at a fixed path for the service worker.
        entryFileNames: (chunk) =>
          chunk.name === "background" ? "background.js" : "assets/[name]-[hash].js",
      },
    },
  },
});
