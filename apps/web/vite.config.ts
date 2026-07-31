import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  root: ".",
  resolve: {
    alias: {
      "@stick-royale/shared": path.resolve(__dirname, "../../packages/shared/src/index.ts"),
      "@stick-royale/sim": path.resolve(__dirname, "../../packages/sim/src/index.ts"),
    },
  },
  worker: {
    format: "es",
  },
  server: {
    port: 5173,
    host: "127.0.0.1",
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
