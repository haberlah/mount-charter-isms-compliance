import fs from "node:fs";
import type { Server } from "node:http";
import path from "node:path";
import type { Express } from "express";
import { createServer as createViteServer } from "vite";
import viteConfig from "../vite.config";
import { injectCsrfMeta } from "./static";

export async function setupVite(server: Server, app: Express, launchToken: string): Promise<void> {
  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: {
      middlewareMode: true,
      hmr: { server, path: "/vite-hmr" },
    },
    appType: "custom",
  });

  app.use(vite.middlewares);

  app.use(async (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    try {
      const clientTemplate = path.resolve(process.cwd(), "client", "index.html");
      const template = await fs.promises.readFile(clientTemplate, "utf8");
      const transformed = await vite.transformIndexHtml(req.originalUrl, template);
      res.status(200).setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(injectCsrfMeta(transformed, launchToken));
    } catch (err) {
      vite.ssrFixStacktrace(err as Error);
      next(err);
    }
  });
}
