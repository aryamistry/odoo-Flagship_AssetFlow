import { createApp } from "./app.js";
import { env } from "./platform/config/env.js";

createApp().listen(env.PORT, () => {
  process.stdout.write(`AssetFlow API listening on http://localhost:${env.PORT}\n`);
});

