import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { getDataDir } from "./config";
import { getDb } from "./db";
import { auditRouter } from "./routes/audit";
import { controlsRouter } from "./routes/controls";
import { evidenceRouter } from "./routes/evidence";
import { frameworksRouter } from "./routes/frameworks";
import { governanceRouter } from "./routes/governance";
import { operationsRouter } from "./routes/operations";
import { settingsRouter } from "./routes/settings";
import { workspacesRouter } from "./routes/workspaces";
import {
  createLaunchToken,
  isValidLoopbackHost,
  SECURITY_HEADERS,
  verifyMutationRequest,
} from "./security";

export interface AppContext {
  app: Express;
  launchToken: string;
}

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function createApp(
  options: { launchToken?: string; expectedPort?: number | null; skipHostCheck?: boolean } = {},
): AppContext {
  // Ensure SQLite schema + ontology are initialised before accepting traffic
  getDb();

  const app = express();
  const launchToken =
    options.launchToken || process.env.MOUNT_CHARTER_LAUNCH_TOKEN?.trim() || createLaunchToken();

  app.disable("x-powered-by");

  // 1. Security headers + loopback Host enforcement
  app.use((req, res, next) => {
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
      res.setHeader(k, v);
    }
    if (!options.skipHostCheck && !isValidLoopbackHost(req.headers.host, options.expectedPort)) {
      return res.status(403).json({ error: "Non-loopback Host header rejected." });
    }
    next();
  });

  // 2. Body parsers (10 MB JSON cap; uploads use multer disk storage)
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: false }));

  // 3. Minimal request logging — NEVER log response bodies or PII
  app.use((req, res, next) => {
    const started = Date.now();
    res.on("finish", () => {
      if (req.path.startsWith("/api") && req.path !== "/api/health") {
        const ms = Date.now() - started;
        console.log(`[api] ${req.method} ${req.path} ${res.statusCode} ${ms}ms`);
      }
    });
    next();
  });

  // 4. Health check (used by macOS Swift shell startup + 5s watchdog)
  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      app: "mount-charter",
      dataDir: getDataDir(),
    });
  });

  // 5. CSRF / Origin / Sec-Fetch-Site enforcement on all mutating /api/* routes
  app.use("/api", (req, res, next) => {
    if (!MUTATING_METHODS.has(req.method)) return next();
    const check = verifyMutationRequest(req, launchToken, {
      expectedPort: options.expectedPort,
    });
    if (!check.ok) {
      return res.status(check.status).json({ error: check.error });
    }
    next();
  });

  // 6. Domain API routers
  app.use("/api", workspacesRouter);
  app.use("/api", controlsRouter);
  app.use("/api", evidenceRouter);
  app.use("/api", auditRouter);
  app.use("/api", settingsRouter);
  app.use("/api", frameworksRouter);
  app.use("/api", governanceRouter);
  app.use("/api", operationsRouter);

  // 7. Unknown /api route 404
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "API route not found" });
  });

  // 8. Global error handler (never leak stack traces in response)
  app.use(
    (
      err: Error & { status?: number; statusCode?: number },
      _req: Request,
      res: Response,
      next: NextFunction,
    ) => {
      if (res.headersSent) return next(err);
      const status = err.status || err.statusCode || 500;
      console.error(`[error] ${status}: ${err.message}`);
      res.status(status).json({ error: err.message || "Internal server error" });
    },
  );

  return { app, launchToken };
}
