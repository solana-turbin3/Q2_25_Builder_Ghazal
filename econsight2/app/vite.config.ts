// app/vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { NodeGlobalsPolyfillPlugin } from "@esbuild-plugins/node-globals-polyfill";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // allow `import { Buffer } from "buffer"` in the browser
      buffer: "buffer",
    },
  },
  optimizeDeps: {
    esbuildOptions: {
      // make `global` → `globalThis`
      define: {
        global: "globalThis",
      },
      // polyfill Buffer & process
      plugins: [
        NodeGlobalsPolyfillPlugin({
          buffer: true,
          process: true,
        }),
      ],
    },
  },
});