import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server.ts"],
  format: ["esm"],
  outDir: "dist",
  clean: true,
  // The shared workspace package exports TypeScript source (fine for tsx
  // and Vite) — inline it into the bundle so the production build has no
  // runtime import of raw .ts files.
  noExternal: ["@task-tracker/shared"],
});
