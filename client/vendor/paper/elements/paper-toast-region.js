// <paper-toast-region>: short notices in a corner of the window.
//
// Put one near the end of the body:
//   <paper-toast-region class="pp-toasts" aria-label="Notifications"></paper-toast-region>
// and show a toast from script:
//   region.show("The album is in your library.", { title: "Saved", tone: "ok" });
// or add a .pp-toast element inside it. The region is a polite live region, so
// a screen reader reads each new toast. An error toast is an alert.
//
// A toast leaves after its timeout. While the pointer or keyboard focus is in
// the region, the timers wait. Errors stay until dismissed. Each toast has a
// dismiss button, and Escape inside a toast dismisses it and returns focus to
// where it was before it entered the region. The element adds and removes
// toasts; it never moves them.
//
// Attributes: timeout in milliseconds (default 6000; 0 keeps every toast until
// dismissed) and max, the most toasts shown at once (default 3).
// Event: paper-toast-dismiss, bubbling, detail { toast, reason }, where reason
// is "timeout", "dismiss", "action", "escape" or "overflow".

const DEFAULT_TIMEOUT = 6000;
const DEFAULT_MAX = 3;
const SVG = "http://www.w3.org/2000/svg";

/** Runs fn once the document has been parsed, so the children exist. */
const whenParsed = (fn) => {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn, { once: true });
  else fn();
};

function closeIcon() {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("class", "pp-icon");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(SVG, "path");
  path.setAttribute("d", "M18 6 6 18M6 6l12 12");
  svg.append(path);
  return svg;
}

class PaperToastRegion extends HTMLElement {
  #timers = new Map();
  #pointerInside = false;
  #focusInside = false;
  #returnFocus = null;
  #observer = null;

  #onPointerEnter = () => {
    this.#pointerInside = true;
    this.#pause();
  };

  #onPointerLeave = () => {
    this.#pointerInside = false;
    this.#resume();
  };

  #onFocusIn = (event) => {
    if (!this.#focusInside && event.relatedTarget instanceof HTMLElement && !this.contains(event.relatedTarget)) {
      this.#returnFocus = event.relatedTarget;
    }
    this.#focusInside = true;
    this.#pause();
  };

  #onFocusOut = (event) => {
    if (event.relatedTarget instanceof Node && this.contains(event.relatedTarget)) return;
    this.#focusInside = false;
    this.#resume();
  };

  #onKeyDown = (event) => {
    if (event.key !== "Escape") return;
    const toast = this.#toastFrom(event.target);
    if (!toast) return;
    event.preventDefault();
    this.dismiss(toast, "escape");
  };

  #onClick = (event) => {
    const button = event.target instanceof Element ? event.target.closest("[data-toast-dismiss]") : null;
    const toast = button && this.#toastFrom(button);
    if (toast) this.dismiss(toast, "dismiss");
  };

  get toasts() {
    return [...this.children].filter((c) => c.classList.contains("pp-toast"));
  }

  connectedCallback() {
    if (!this.hasAttribute("role")) this.setAttribute("role", "region");
    if (!this.hasAttribute("aria-label") && !this.hasAttribute("aria-labelledby")) this.setAttribute("aria-label", "Notifications");
    if (!this.hasAttribute("aria-live")) this.setAttribute("aria-live", "polite");
    this.addEventListener("pointerenter", this.#onPointerEnter);
    this.addEventListener("pointerleave", this.#onPointerLeave);
    this.addEventListener("focusin", this.#onFocusIn);
    this.addEventListener("focusout", this.#onFocusOut);
    this.addEventListener("keydown", this.#onKeyDown);
    this.addEventListener("click", this.#onClick);
    this.#observer = new MutationObserver(() => this.#manage());
    this.#observer.observe(this, { childList: true });
    whenParsed(() => this.#manage());
  }

  disconnectedCallback() {
    this.removeEventListener("pointerenter", this.#onPointerEnter);
    this.removeEventListener("pointerleave", this.#onPointerLeave);
    this.removeEventListener("focusin", this.#onFocusIn);
    this.removeEventListener("focusout", this.#onFocusOut);
    this.removeEventListener("keydown", this.#onKeyDown);
    this.removeEventListener("click", this.#onClick);
    this.#observer?.disconnect();
    for (const timer of this.#timers.values()) clearTimeout(timer.id);
    this.#timers.clear();
  }

  /**
   * Shows a toast and returns its element. Options: title, tone ("ok", "warn"
   * or "err"), timeout in milliseconds, action { label, onClick }, and
   * dismissLabel for the dismiss button (default "Dismiss").
   */
  show(message, { title = "", tone = "", timeout, action, dismissLabel = "Dismiss" } = {}) {
    const toast = document.createElement("div");
    toast.className = tone ? `pp-toast pp-toast--${tone}` : "pp-toast";
    if (tone === "err") toast.setAttribute("role", "alert");
    if (timeout !== undefined) toast.dataset.timeout = String(timeout);

    const body = document.createElement("div");
    body.className = "pp-toast__body";
    if (title) {
      const heading = document.createElement("span");
      heading.className = "pp-toast__title";
      heading.textContent = title;
      body.append(heading);
    }
    const text = document.createElement("span");
    text.className = "pp-toast__text";
    text.textContent = message;
    body.append(text);

    const actions = document.createElement("div");
    actions.className = "pp-toast__actions";
    if (action?.label) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "pp-button pp-button--ghost pp-button--sm";
      button.textContent = action.label;
      button.addEventListener("click", () => {
        action.onClick?.(toast);
        this.dismiss(toast, "action");
      });
      actions.append(button);
    }
    const close = document.createElement("button");
    close.type = "button";
    close.className = "pp-icon-button pp-icon-button--compact";
    close.setAttribute("aria-label", dismissLabel);
    close.dataset.toastDismiss = "";
    close.append(closeIcon());
    actions.append(close);

    toast.append(body, actions);
    this.append(toast);
    this.#manage();
    return toast;
  }

  /** Removes a toast and sends paper-toast-dismiss. */
  dismiss(toast, reason = "dismiss") {
    if (!toast || toast.parentElement !== this) return;
    const hadFocus = toast.contains(document.activeElement);
    this.#clear(toast);
    toast.remove();
    if (hadFocus) {
      this.#focusInside = false;
      const target = this.#returnFocus?.isConnected ? this.#returnFocus : null;
      this.#returnFocus = null;
      target?.focus();
      this.#resume();
    }
    this.dispatchEvent(new CustomEvent("paper-toast-dismiss", { bubbles: true, detail: { toast, reason } }));
  }

  #toastFrom(node) {
    const toast = node instanceof Element ? node.closest(".pp-toast") : null;
    return toast && toast.parentElement === this ? toast : null;
  }

  #timeoutOf(toast) {
    const own = Number.parseFloat(toast.dataset.timeout);
    if (Number.isFinite(own)) return own;
    if (toast.getAttribute("role") === "alert" || toast.classList.contains("pp-toast--err")) return 0;
    const region = Number.parseFloat(this.getAttribute("timeout"));
    return Number.isFinite(region) ? region : DEFAULT_TIMEOUT;
  }

  /** Starts timers for new toasts, forgets removed ones and enforces max. */
  #manage() {
    // A removed toast may have held the pointer or focus without the browser
    // sending pointerleave or focusout, so read both again.
    this.#pointerInside = this.matches(":hover");
    this.#focusInside = this.contains(document.activeElement);
    const toasts = this.toasts;
    for (const toast of this.#timers.keys()) if (!toasts.includes(toast)) this.#clear(toast);
    for (const toast of toasts) {
      if (this.#timers.has(toast)) continue;
      const remaining = this.#timeoutOf(toast);
      this.#timers.set(toast, { remaining, started: 0, id: 0 });
      if (remaining > 0 && !this.#paused) this.#start(toast);
    }
    const max = Math.max(1, Number.parseInt(this.getAttribute("max"), 10) || DEFAULT_MAX);
    for (const toast of this.toasts.slice(0, Math.max(0, this.toasts.length - max))) this.dismiss(toast, "overflow");
    this.#resume();
  }

  get #paused() {
    return this.#pointerInside || this.#focusInside;
  }

  #start(toast) {
    const timer = this.#timers.get(toast);
    if (!timer || timer.remaining <= 0) return;
    timer.started = Date.now();
    timer.id = setTimeout(() => this.dismiss(toast, "timeout"), timer.remaining);
  }

  #pause() {
    for (const timer of this.#timers.values()) {
      if (!timer.id) continue;
      clearTimeout(timer.id);
      timer.id = 0;
      // A paused toast gets at least a second after the pause, so it is seen.
      timer.remaining = Math.max(1000, timer.remaining - (Date.now() - timer.started));
    }
  }

  #resume() {
    if (this.#paused) return;
    for (const [toast, timer] of this.#timers) if (!timer.id && timer.remaining > 0) this.#start(toast);
  }

  #clear(toast) {
    const timer = this.#timers.get(toast);
    if (timer?.id) clearTimeout(timer.id);
    this.#timers.delete(toast);
  }
}

if (!customElements.get("paper-toast-region")) customElements.define("paper-toast-region", PaperToastRegion);

export { PaperToastRegion };
