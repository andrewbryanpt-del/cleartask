import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // 127.0.0.1, not localhost: Windows resolves localhost to ::1 first,
      // and the API listens on IPv4.
      "/api": "http://127.0.0.1:3001",
    },
  },
});
