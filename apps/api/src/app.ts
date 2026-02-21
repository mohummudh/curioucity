import cors from "cors";
import express from "express";
import helmet from "helmet";
import { v1Router } from "./routes/v1Router.js";
import { env } from "./config/env.js";
import { rateLimit } from "./middleware/rateLimit.js";

export const createApp = () => {
  const app = express();

  app.use(
    cors({
      origin: [env.webBaseUrl, "http://localhost:5173", "http://127.0.0.1:5173"],
      credentials: false,
    }),
  );

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }),
  );

  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: false }));
  app.use(rateLimit);

  app.get("/", (_req, res) => {
    res.json({
      service: "wondertalk-api",
      docs: "/v1/health",
      timestamp: new Date().toISOString(),
    });
  });

  app.use("/v1", v1Router);

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: "Internal server error", detail: err.message });
  });

  return app;
};
