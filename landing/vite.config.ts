import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // The map helpers of the interface (DEM tiles, terrain texture, projection), used by the hero.
      "@web": fileURLToPath(new URL("../web/src", import.meta.url)),
    },
  },
});
