import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The API (backend/src/LinhaZero.Api, port 8080 in compose) is reached through the same origin, so there is no CORS to configure.
// The Host header stays localhost:5173 (no changeOrigin): the API builds the login's return address from it, and Keycloak
// only accepts http://localhost:5173/api/auth/callback (infra/keycloak). 127.0.0.1: compose publishes the API on IPv4 only.
const proxy = {
  "/api": { target: "http://127.0.0.1:8080", changeOrigin: false },
};

export default defineConfig({
  plugins: [react()],
  worker: { format: "es" },
  server: { proxy },
  preview: { proxy },
});
