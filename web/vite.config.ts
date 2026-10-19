import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The API (services/Api, port 8080 in compose) is reached through the same origin, so there is no CORS to configure.
const proxy = { "/api": "http://localhost:8080" };

export default defineConfig({
  plugins: [react()],
  worker: { format: "es" },
  server: { proxy },
  preview: { proxy },
});
