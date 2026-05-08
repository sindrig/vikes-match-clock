import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

const basePath = process.env.VITE_BASE_PATH
  ? `/${process.env.VITE_BASE_PATH}/`
  : "/";

export default defineConfig({
  base: basePath,
  plugins: [react(), tsconfigPaths()],
  define: {
    // Shim process.env for libraries that expect it (redux, firebase, etc.)
    "process.env.NODE_ENV": JSON.stringify(
      process.env.NODE_ENV || "development",
    ),
    "process.env.PUBLIC_URL": JSON.stringify(""),
  },
  server: {
    host: true,
    port: process.env.PORT ? parseInt(process.env.PORT, 10) : 3000,
    open: false,
    allowedHosts: true,
  },
  build: {
    outDir: "build",
    sourcemap: false,
  },
  publicDir: "public",
});
