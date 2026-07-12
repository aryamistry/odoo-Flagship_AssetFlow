import { createApp } from "./app.js";
import { env } from "./platform/config/env.js";
import { cleanupOrphanedFiles } from "./modules/uploads/upload.service.js";

createApp().listen(env.PORT, () => {
  process.stdout.write(`AssetFlow API listening on http://localhost:${env.PORT}\n`);
  
  // Run orphaned file cleanup every hour
  setInterval(() => {
    cleanupOrphanedFiles().catch((e) => {
      console.error("[Scheduler] Failed to cleanup orphaned files:", e);
    });
  }, 1000 * 60 * 60);
});
