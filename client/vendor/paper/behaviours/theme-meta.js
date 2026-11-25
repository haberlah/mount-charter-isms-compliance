// Keeps <meta name="theme-color"> (when present) and <meta name="color-scheme">
// aligned with data-mode and the system colour scheme. Runs as a companion to
// paper-mode.js once stylesheets are loaded so --paper-topbar can be read.

const KEY = Symbol.for("paper.theme-meta");

if (!window[KEY]) {
  window[KEY] = true;
  const root = document.documentElement;
  const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
  const isMode = (m) => m === "light" || m === "dark" || m === "system";

  const sync = () => {
    const attr = root.getAttribute("data-mode");
    const mode = isMode(attr) ? attr : "system";
    const cs = document.querySelector('meta[name="color-scheme"]');
    if (cs) cs.content = mode === "system" ? "light dark" : mode;
    const tc = document.querySelector('meta[name="theme-color"]');
    if (!tc) return;
    const dark = mode === "dark" || (mode === "system" && Boolean(mq?.matches));
    const colour = tc.getAttribute(dark ? "data-dark" : "data-light") || getComputedStyle(root).getPropertyValue("--paper-topbar").trim();
    if (colour) tc.content = colour;
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", sync, { once: true });
  else sync();
  mq?.addEventListener?.("change", sync);
  new MutationObserver(sync).observe(root, { attributes: true, attributeFilter: ["data-mode"] });
}
