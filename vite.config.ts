import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  base: "/daliuren/",
  server: {
    watch: {
      ignored: [
        "**/.playwright-cli/**",
        "**/output/**",
        "**/library/**",
        "**/.wrangler/**",
      ],
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/lunar-typescript")) return "calendar";
          if (id.includes("node_modules/astronomy-engine")) return "astronomy";
          if (
            id.includes("node_modules/react-dom") ||
            id.includes("node_modules/react/")
          )
            return "react";
        },
      },
    },
  },
});
