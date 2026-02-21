import "dotenv/config";
import { env } from "./config/env.js";
import { createApp } from "./app.js";
import { logger } from "./utils/logger.js";

const app = createApp();

app.listen(env.port, () => {
  logger.info(`WonderTalk API running on http://localhost:${env.port}`);
});
