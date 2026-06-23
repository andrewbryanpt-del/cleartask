import { buildApp } from "./app";
import { env } from "./config/env";
import { ensureUploadsDir, getUploadsDir } from "./lib/storage";
import { startJobs, stopJobs } from "./jobs";

await ensureUploadsDir();
console.info(`[storage] uploads directory: ${getUploadsDir()}`);

const app = await buildApp();

try {
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  await startJobs(app.log);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info(`${signal} received, shutting down`);
  await stopJobs();
  await app.close();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
