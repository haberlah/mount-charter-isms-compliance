#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const MANIFEST_PATH = path.join(ROOT_DIR, "client", "public", "paper", "manifest.json");
const PAPER_VERSION = "0.7.0";

const VENDOR_FILES = [
  { src: "paper.css", dest: "client/public/paper/paper.css" },
  { src: "paper.tokens.css", dest: "client/public/paper/paper.tokens.css" },
  { src: "packs/workbench.css", dest: "client/public/paper/packs/workbench.css" },
  { src: "paper.js", dest: "client/public/paper/paper.js" },
  { src: "paper-mode.js", dest: "client/public/paper/paper-mode.js" },
  { src: "icons.svg", dest: "client/public/paper/icons.svg" },
  {
    src: "fonts/inter-latin-wght-normal.woff2",
    dest: "client/public/paper/fonts/inter-latin-wght-normal.woff2",
  },
  {
    src: "fonts/ibm-plex-mono-latin-500-normal.woff2",
    dest: "client/public/paper/fonts/ibm-plex-mono-latin-500-normal.woff2",
  },
  {
    src: "fonts/ibm-plex-mono-latin-600-normal.woff2",
    dest: "client/public/paper/fonts/ibm-plex-mono-latin-600-normal.woff2",
  },
  { src: "elements/index.js", dest: "client/vendor/paper/elements/index.js" },
  { src: "elements/index.d.ts", dest: "client/vendor/paper/elements/index.d.ts" },
  { src: "elements/paper-split.js", dest: "client/vendor/paper/elements/paper-split.js" },
  { src: "elements/paper-tabs.js", dest: "client/vendor/paper/elements/paper-tabs.js" },
  {
    src: "elements/paper-theme-switch.js",
    dest: "client/vendor/paper/elements/paper-theme-switch.js",
  },
  {
    src: "elements/paper-toast-region.js",
    dest: "client/vendor/paper/elements/paper-toast-region.js",
  },
  {
    src: "behaviours/dialog-backdrop.js",
    dest: "client/vendor/paper/behaviours/dialog-backdrop.js",
  },
  {
    src: "behaviours/popover-placement.js",
    dest: "client/vendor/paper/behaviours/popover-placement.js",
  },
  { src: "behaviours/theme-meta.js", dest: "client/vendor/paper/behaviours/theme-meta.js" },
  {
    src: "behaviours/tooltip-dismiss.js",
    dest: "client/vendor/paper/behaviours/tooltip-dismiss.js",
  },
  { src: "PaperTokens.swift", dest: "macos/PaperTokens.swift" },
];

function sha256Buffer(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function sha256File(filePath) {
  return sha256Buffer(fs.readFileSync(filePath));
}

function resolvePaperDistDir() {
  if (process.env.PAPER_DIST_DIR) {
    return path.resolve(process.env.PAPER_DIST_DIR);
  }
  return path.join(os.homedir(), "Documents", "GitHub", "paper", "dist");
}

function runVendor() {
  const distDir = resolvePaperDistDir();
  if (!fs.existsSync(distDir)) {
    console.error(`Paper dist directory not found: ${distDir}`);
    console.error("Set PAPER_DIST_DIR to point to Paper dist/.");
    process.exit(1);
  }

  const files = {};
  for (const entry of VENDOR_FILES) {
    const srcPath = path.join(distDir, entry.src);
    const destPath = path.join(ROOT_DIR, entry.dest);
    if (!fs.existsSync(srcPath)) {
      console.error(`Missing source file in Paper dist: ${srcPath}`);
      process.exit(1);
    }
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    const content = fs.readFileSync(srcPath);
    fs.writeFileSync(destPath, content);
    files[entry.dest] = {
      source: entry.src,
      sha256: sha256Buffer(content),
      bytes: content.length,
    };
  }

  const manifest = {
    name: "paper",
    version: PAPER_VERSION,
    files,
  };
  fs.mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true });
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(
    `Vendored Paper v${PAPER_VERSION} (${VENDOR_FILES.length} files) and wrote client/public/paper/manifest.json.`,
  );
}

function runCheck() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error(
      "Drift check failed: client/public/paper/manifest.json is missing. Run `npm run vendor:paper`.",
    );
    process.exit(1);
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  } catch (err) {
    console.error(`Drift check failed: invalid JSON in manifest.json (${err.message}).`);
    process.exit(1);
  }

  if (manifest.version !== PAPER_VERSION) {
    console.error(
      `Drift check failed: manifest version is ${manifest.version}, expected ${PAPER_VERSION}.`,
    );
    process.exit(1);
  }

  const failures = [];
  for (const entry of VENDOR_FILES) {
    const expected = manifest.files?.[entry.dest];
    const destPath = path.join(ROOT_DIR, entry.dest);
    if (!expected?.sha256) {
      failures.push(`Manifest missing hash for ${entry.dest}`);
      continue;
    }
    if (!fs.existsSync(destPath)) {
      failures.push(`Missing vendored file: ${entry.dest}`);
      continue;
    }
    const actualHash = sha256File(destPath);
    if (actualHash !== expected.sha256) {
      failures.push(`SHA-256 mismatch for ${entry.dest}`);
    }
  }

  if (failures.length > 0) {
    console.error("Paper drift check FAILED:");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  console.log(
    `Paper v${manifest.version} drift check passed (${VENDOR_FILES.length} files verified).`,
  );
}

if (process.argv.includes("--check")) {
  runCheck();
} else {
  runVendor();
}
