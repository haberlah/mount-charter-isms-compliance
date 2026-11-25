/* Paper mode script (<head>). Restores/stores data-mode and syncs color-scheme. */
(() => {
  const d = document, r = d.documentElement, M = "data-mode";
  const k = d.currentScript?.getAttribute("data-storage-key") || "paper-mode";
  const ok = (m) => m === "light" || m === "dark" || m === "system";
  const sync = () => {
    const a = r.getAttribute(M), m = ok(a) ? a : "system";
    let cs = d.querySelector("meta[name=color-scheme]");
    if (!cs && d.head) (cs = d.createElement("meta")), (cs.name = "color-scheme"), d.head.append(cs);
    if (cs) cs.content = m === "system" ? "light dark" : m;
  };
  try { const s = localStorage.getItem(k); if (ok(s)) r.setAttribute(M, s); } catch {}
  let last = r.getAttribute(M);
  sync();
  new MutationObserver(() => {
    const m = r.getAttribute(M);
    if (m === last) return;
    last = m;
    sync();
    try { localStorage.setItem(k, ok(m) ? m : "system"); } catch {}
  }).observe(r, { attributes: true, attributeFilter: [M] });
})();
