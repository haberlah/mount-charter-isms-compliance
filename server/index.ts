import { createServer } from "node:http";
import { createApp } from "./app";
import { getPort, HOST } from "./config";
import { closeDb } from "./db";
import { serveStatic } from "./static";

async function main() {
  const port = getPort();
  const { app, launchToken } = createApp({ expectedPort: port });
  const httpServer = createServer(app);

  if (process.env.NODE_ENV === "production") {
    serveStatic(app, launchToken);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app, launchToken);
  }

  httpServer.listen(port, HOST, () => {
    console.log(`[mount-charter] listening on http://${HOST}:${port}`);
  });

  const shutdown = () => {
    httpServer.close(() => {
      closeDb();
      process.exit(0);
    });
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[mount-charter] fatal startup error:", err);
  process.exit(1);
});
