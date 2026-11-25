import fs from "node:fs";
import path from "node:path";
import express, { type Express } from "express";

export function injectCsrfMeta(html: string, launchToken: string): string {
  const tag = `<meta name="mount-charter-csrf-token" content="${launchToken}" />`;
  if (html.includes("</head>")) {
    return html.replace("</head>", `  ${tag}\n</head>`);
  }
  return `${tag}\n${html}`;
}

export function serveStatic(app: Express, launchToken: string): void {
  const distPath = path.resolve(process.cwd(), "dist", "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(`Could not find built client at ${distPath}. Run \`npm run build\` first.`);
  }

  const indexPath = path.join(distPath, "index.html");
  const cachedIndexHtml = injectCsrfMeta(fs.readFileSync(indexPath, "utf8"), launchToken);

  app.use(express.static(distPath, { index: false }));

  app.use((req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.status(200).setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(cachedIndexHtml);
  });
}
