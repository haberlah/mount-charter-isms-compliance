// Hides a showing tooltip when Escape is pressed, as WCAG 2.2 asks of content
// that appears on hover or focus. The tooltip shows again once the pointer has
// left its host or focus has moved on.

const KEY = Symbol.for("paper.tooltip-dismiss");

if (!window[KEY]) {
  window[KEY] = true;
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    for (const host of document.querySelectorAll(".pp-tooltip-host:not([data-dismissed])")) {
      if (!host.matches(":hover, :has(:focus-visible)")) continue;
      host.setAttribute("data-dismissed", "");
      const clear = () => {
        host.removeAttribute("data-dismissed");
        host.removeEventListener("pointerleave", clear);
        host.removeEventListener("focusout", clear);
      };
      host.addEventListener("pointerleave", clear);
      host.addEventListener("focusout", clear);
    }
  });
}
