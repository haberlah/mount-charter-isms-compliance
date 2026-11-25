/* Paper 0.8.0. Custom elements as a classic script; the same code as dist/elements/. */
"use strict";
// elements/paper-tabs.js
(() => {
// <paper-tabs>: tabs with roving focus.
//
// Wrap an element with role="tablist" whose tabs carry role="tab" and
// aria-controls naming their panel. Panels may sit anywhere in the same
// document. The element selects one tab, hides the other panels and moves
// focus with the arrow keys, Home and End. It never moves its children, and
// without the script every panel the page has not hidden stays readable.
//
// Attributes: activation="manual" moves focus with the arrow keys and selects
// with Enter or Space. The default selects the focused tab at once.
// Event: paper-tab-change, bubbling, detail { tab, panel, index }.

/** Runs fn once the document has been parsed, so the children exist. */
const whenParsed = (fn) => {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn, { once: true });
  else fn();
};

const isDisabled = (el) => el.disabled === true || el.getAttribute("aria-disabled") === "true";

class PaperTabs extends HTMLElement {
  #observer = null;

  #onClick = (event) => {
    const tab = this.#tabFrom(event.target);
    if (tab && !isDisabled(tab)) this.select(tab, { focus: false });
  };

  #onKeyDown = (event) => {
    const tab = this.#tabFrom(event.target);
    if (!tab || event.altKey || event.ctrlKey || event.metaKey) return;
    const all = this.tabs;
    const enabled = all.filter((t) => !isDisabled(t));
    const list = tab.closest('[role="tablist"]');
    const vertical = list?.getAttribute("aria-orientation") === "vertical";
    const rtl = !vertical && getComputedStyle(list ?? this).direction === "rtl";
    const back = vertical ? "ArrowUp" : rtl ? "ArrowRight" : "ArrowLeft";
    const forward = vertical ? "ArrowDown" : rtl ? "ArrowLeft" : "ArrowRight";
    // The nearest enabled tab in a direction, counted from the focused tab
    // even when that tab is itself disabled.
    const step = (direction) => {
      const start = all.indexOf(tab);
      for (let i = 1; i <= all.length; i++) {
        const next = all[(start + direction * i + all.length * i) % all.length];
        if (!isDisabled(next)) return next;
      }
      return undefined;
    };
    let target;
    if (event.key === back) target = step(-1);
    else if (event.key === forward) target = step(1);
    else if (event.key === "Home") target = enabled[0];
    else if (event.key === "End") target = enabled.at(-1);
    else if ((event.key === "Enter" || event.key === " ") && this.#manual) {
      event.preventDefault();
      if (!isDisabled(tab)) this.select(tab);
      return;
    }
    if (!target) return;
    event.preventDefault();
    if (this.#manual) target.focus();
    else this.select(target);
  };

  get #manual() {
    return this.getAttribute("activation") === "manual";
  }

  /** The tabs that belong to this element, not to a nested one. */
  get tabs() {
    return [...this.querySelectorAll('[role="tab"]')].filter((t) => t.closest("paper-tabs") === this);
  }

  get selected() {
    return this.tabs.find((t) => t.getAttribute("aria-selected") === "true") ?? null;
  }

  connectedCallback() {
    this.addEventListener("click", this.#onClick);
    this.addEventListener("keydown", this.#onKeyDown);
    this.#observer = new MutationObserver(() => this.#sync());
    this.#observer.observe(this, { childList: true, subtree: true });
    whenParsed(() => this.#sync());
  }

  disconnectedCallback() {
    this.removeEventListener("click", this.#onClick);
    this.removeEventListener("keydown", this.#onKeyDown);
    this.#observer?.disconnect();
    this.#observer = null;
  }

  #sync() {
    if (!this.isConnected) return;
    const tabs = this.tabs;
    if (!tabs.length) return;
    const first =
      tabs.find((t) => t.getAttribute("aria-selected") === "true" && !isDisabled(t)) ?? tabs.find((t) => !isDisabled(t));
    if (first) this.select(first, { focus: false, emit: false });
  }

  /** Selects a tab, given as the element or its index, and shows its panel. */
  select(tabOrIndex, { focus = true, emit = true } = {}) {
    const tabs = this.tabs;
    const tab = typeof tabOrIndex === "number" ? tabs[tabOrIndex] : tabOrIndex;
    if (!tab || !tabs.includes(tab)) return;
    const changed = tab.getAttribute("aria-selected") !== "true";
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      const panel = this.#panel(t);
      if (panel) panel.hidden = !on;
    }
    if (focus) tab.focus();
    if (emit && changed) {
      const detail = { tab, panel: this.#panel(tab), index: tabs.indexOf(tab) };
      this.dispatchEvent(new CustomEvent("paper-tab-change", { bubbles: true, detail }));
    }
  }

  #tabFrom(node) {
    const tab = node instanceof Element ? node.closest('[role="tab"]') : null;
    return tab && tab.closest("paper-tabs") === this ? tab : null;
  }

  #panel(tab) {
    const id = tab.getAttribute("aria-controls");
    return id ? this.getRootNode().getElementById(id) : null;
  }
}

if (!customElements.get("paper-tabs")) customElements.define("paper-tabs", PaperTabs);
})();

// elements/paper-split.js
(() => {
// <paper-split>: two panes with a resizer between them.
//
// Children: the first pane, an element with role="separator" (the resizer),
// then the second pane. The element sets --pp-split-size, the width of the
// sized pane (first pane by default, or second pane when pane="end"), and
// keeps the separator's aria-valuemin, aria-valuemax and aria-valuenow current.
// It never moves its children.
//
// Attributes, in CSS pixels: min, max, min-second, default, collapse-below and
// collapse-at. pane="start" (default) or "end" picks which pane is sized.
// collapsed hides the sized pane and resizer while remembering its width.
// responsive="stack" (default), "collapse" or "none" sets narrow behaviour.
// storage-key keeps the width in localStorage under that key.
// Keyboard on the resizer: Left and Right change the width by 16 px (32 px
// with Shift), Home and End go to the minimum and maximum, Enter restores
// the default. A double click also restores the default.
// Events: paper-resize (detail { size }) and paper-collapse (detail { collapsed, size, reason }).

const STEP = 16;
const BIG_STEP = 32;
const DEFAULT_COLLAPSE_AT = 760;

/** Runs fn once the document has been parsed, so the children exist. */
const whenParsed = (fn) => {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn, { once: true });
  else fn();
};

const number = (value, fallback) => {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
};

class PaperSplit extends HTMLElement {
  static observedAttributes = [
    "min",
    "max",
    "default",
    "min-second",
    "pane",
    "collapsed",
    "collapse-below",
    "responsive",
    "collapse-at",
  ];

  #size = null;
  #wanted = null;
  #drag = null;
  #observer = null;
  #narrow = false;
  #narrowOverride = false;

  #onKeyDown = (event) => {
    if (event.target !== this.#resizer || event.altKey || event.ctrlKey || event.metaKey) return;
    const step = (event.shiftKey ? BIG_STEP : STEP) * this.#sign();
    const { min, max } = this.#bounds();
    const keys = {
      ArrowLeft: () => this.#size - step,
      ArrowRight: () => this.#size + step,
      Home: () => min,
      End: () => max,
      Enter: () => this.default,
    };
    if (!(event.key in keys)) return;
    event.preventDefault();
    this.#apply(keys[event.key](), { persist: true, emit: true });
  };

  #onPointerDown = (event) => {
    const resizer = this.#resizer;
    if (event.target !== resizer || event.button !== 0) return;
    event.preventDefault();
    this.#drag = { x: event.clientX, start: this.#size, raw: this.#size, id: event.pointerId };
    this.setAttribute("data-resizing", "");
    try {
      resizer.setPointerCapture(event.pointerId);
    } catch {
      // Capture is optional: the listeners on window still follow the pointer.
    }
    window.addEventListener("pointermove", this.#onPointerMove);
    window.addEventListener("pointerup", this.#onPointerUp);
    window.addEventListener("pointercancel", this.#onPointerUp);
  };

  #onPointerMove = (event) => {
    if (!this.#drag || event.pointerId !== this.#drag.id) return;
    const raw = this.#drag.start + (event.clientX - this.#drag.x) * this.#sign();
    this.#drag.raw = raw;
    const threshold = this.collapseBelow;
    const wantsCollapse = threshold > 0 && raw < threshold;
    this.toggleAttribute("data-collapse-intent", wantsCollapse);
    this.#apply(raw, { persist: false, emit: false });
  };

  #onPointerUp = (event) => {
    if (!this.#drag || event.pointerId !== this.#drag.id) return;
    const { start, raw } = this.#drag;
    const moved = this.#size !== start;
    const shouldCollapse = this.collapseBelow > 0 && raw < this.collapseBelow;
    this.#stopDrag();
    if (shouldCollapse) {
      this.#wanted = Math.round(Math.min(this.max, Math.max(this.min, start)));
      this.#setCollapsed(true, { emit: true, reason: "drag" });
    } else if (moved) {
      this.#apply(this.#size, { persist: true, emit: true, force: true });
    }
  };

  #stopDrag() {
    if (!this.#drag) return;
    this.#drag = null;
    this.removeAttribute("data-resizing");
    this.removeAttribute("data-collapse-intent");
    window.removeEventListener("pointermove", this.#onPointerMove);
    window.removeEventListener("pointerup", this.#onPointerUp);
    window.removeEventListener("pointercancel", this.#onPointerUp);
  }

  #onResize = () => {
    this.#syncResponsive({ emit: true });
    if (this.#wanted !== null) this.#render({ emit: false });
  };

  #onDoubleClick = (event) => {
    if (event.target === this.#resizer) this.reset();
  };

  get min() {
    return Math.max(0, number(this.getAttribute("min"), 0));
  }

  get max() {
    return Math.max(this.min, number(this.getAttribute("max"), Number.POSITIVE_INFINITY));
  }

  get minSecond() {
    return Math.max(0, number(this.getAttribute("min-second"), 0));
  }

  get default() {
    return number(this.getAttribute("default"), this.min || 320);
  }

  get pane() {
    return this.getAttribute("pane") === "end" ? "end" : "start";
  }

  set pane(value) {
    if (value === "end") this.setAttribute("pane", "end");
    else this.removeAttribute("pane");
  }

  get collapseBelow() {
    return Math.max(0, number(this.getAttribute("collapse-below"), 0));
  }

  get responsive() {
    const mode = this.getAttribute("responsive");
    return mode === "collapse" || mode === "none" ? mode : "stack";
  }

  get collapseAt() {
    return Math.max(0, number(this.getAttribute("collapse-at"), DEFAULT_COLLAPSE_AT));
  }

  get collapsed() {
    return this.hasAttribute("collapsed") || this.hasAttribute("data-auto-collapsed");
  }

  set collapsed(value) {
    this.#setCollapsed(Boolean(value), { emit: false, reason: "api" });
  }

  /** The width of the sized pane in CSS pixels. */
  get size() {
    return this.#size;
  }

  set size(value) {
    this.#apply(number(value, this.default), { persist: true, emit: false });
  }

  connectedCallback() {
    this.addEventListener("keydown", this.#onKeyDown);
    this.addEventListener("pointerdown", this.#onPointerDown);
    this.addEventListener("dblclick", this.#onDoubleClick);
    this.#observer = new ResizeObserver(this.#onResize);
    this.#observer.observe(this);
    whenParsed(() => {
      const resizer = this.#resizer;
      if (!this.isConnected || !resizer) return;
      if (!resizer.hasAttribute("tabindex")) resizer.tabIndex = 0;
      if (!resizer.hasAttribute("aria-orientation")) resizer.setAttribute("aria-orientation", "vertical");
      this.#syncResponsive({ emit: false });
      this.#apply(this.#stored() ?? this.default, { persist: false, emit: false });
    });
  }

  disconnectedCallback() {
    this.#stopDrag();
    this.removeEventListener("keydown", this.#onKeyDown);
    this.removeEventListener("pointerdown", this.#onPointerDown);
    this.removeEventListener("dblclick", this.#onDoubleClick);
    this.#observer?.disconnect();
  }

  attributeChangedCallback(name) {
    if (!this.isConnected || this.#wanted === null) return;
    if (name === "responsive" || name === "collapse-at") this.#syncResponsive({ emit: false });
    this.#render({ emit: false });
  }

  /** Toggles the collapsed state and returns the new collapsed state. */
  toggle(force) {
    const next = typeof force === "boolean" ? force : !this.collapsed;
    this.#setCollapsed(next, { emit: true, reason: "user" });
    return this.collapsed;
  }

  /** Restores the default width. */
  reset() {
    this.#apply(this.default, { persist: true, emit: true });
  }

  get #resizer() {
    return [...this.children].find((c) => c.getAttribute("role") === "separator") ?? null;
  }

  get #sizedPane() {
    const resizer = this.#resizer;
    const panes = [...this.children].filter((c) => c !== resizer);
    if (panes.length === 0) return null;
    return this.pane === "end" ? panes[panes.length - 1] : panes[0];
  }

  #syncHidden() {
    const isCollapsed = this.collapsed;
    const pane = this.#sizedPane;
    const resizer = this.#resizer;
    if (pane) pane.hidden = isCollapsed;
    if (resizer) resizer.hidden = isCollapsed;
  }

  #direction() {
    return getComputedStyle(this).direction === "rtl" ? -1 : 1;
  }

  #sign() {
    return this.#direction() * (this.pane === "end" ? -1 : 1);
  }

  #setCollapsed(next, { emit, reason }) {
    const was = this.collapsed;
    if (next) {
      this.#narrowOverride = false;
      this.removeAttribute("data-auto-collapsed");
      this.setAttribute("collapsed", "");
    } else {
      this.removeAttribute("collapsed");
      this.removeAttribute("data-auto-collapsed");
      if (this.#narrow && this.responsive === "collapse") this.#narrowOverride = true;
    }
    if (this.#wanted !== null) this.#render({ emit: false });
    if (emit && was !== this.collapsed) {
      this.dispatchEvent(new CustomEvent("paper-collapse", { bubbles: true, detail: { collapsed: this.collapsed, size: this.#size, reason } }));
    }
  }

  #syncResponsive({ emit }) {
    if (this.responsive !== "collapse") {
      this.#narrow = false;
      this.#narrowOverride = false;
      this.removeAttribute("data-auto-collapsed");
      return;
    }
    const width = this.clientWidth;
    if (width <= 0) return;
    const isNarrow = width < this.collapseAt;
    if (isNarrow === this.#narrow) return;
    const was = this.collapsed;
    this.#narrow = isNarrow;
    if (isNarrow) {
      this.#narrowOverride = false;
      if (!this.hasAttribute("collapsed")) this.setAttribute("data-auto-collapsed", "");
    } else {
      this.#narrowOverride = false;
      this.removeAttribute("data-auto-collapsed");
    }
    if (emit && was !== this.collapsed) {
      this.dispatchEvent(new CustomEvent("paper-collapse", { bubbles: true, detail: { collapsed: this.collapsed, size: this.#size, reason: "responsive" } }));
    }
  }

  /** min and max, with max also kept within the element's own width (and min-second). */
  #bounds() {
    const min = this.min;
    const resizerWidth = this.#resizer?.getBoundingClientRect().width ?? 0;
    const room = this.clientWidth > 0 ? this.clientWidth - resizerWidth - this.minSecond : Number.POSITIVE_INFINITY;
    return { min, max: Math.max(min, Math.min(this.max, room)) };
  }

  /** Records an asked-for width, within min and max, and shows it. */
  #apply(value, { persist, emit, force = false }) {
    this.#wanted = Math.round(Math.min(this.max, Math.max(this.min, number(value, this.default))));
    const size = this.#render({ emit, force });
    if (persist) this.#store(size);
  }

  /** Shows the asked-for width, narrowed if the element has no room for it. */
  #render({ emit, force = false }) {
    const { min, max } = this.#bounds();
    const size = Math.round(Math.min(max, Math.max(min, this.#wanted)));
    const changed = size !== this.#size;
    this.#size = size;
    this.style.setProperty("--pp-split-size", `${size}px`);
    this.#syncHidden();
    const resizer = this.#resizer;
    if (resizer) {
      resizer.setAttribute("aria-valuemin", String(min));
      resizer.setAttribute("aria-valuemax", String(Number.isFinite(max) ? max : size));
      resizer.setAttribute("aria-valuenow", String(size));
    }
    if (emit && (changed || force)) this.dispatchEvent(new CustomEvent("paper-resize", { bubbles: true, detail: { size } }));
    return size;
  }

  #stored() {
    const key = this.getAttribute("storage-key");
    if (!key) return null;
    try {
      const value = Number.parseFloat(localStorage.getItem(key));
      return Number.isFinite(value) ? value : null;
    } catch {
      return null;
    }
  }

  #store(size) {
    const key = this.getAttribute("storage-key");
    if (!key) return;
    try {
      localStorage.setItem(key, String(size));
    } catch {
      // Storage is optional: the width still applies to this page.
    }
  }
}

if (!customElements.get("paper-split")) customElements.define("paper-split", PaperSplit);
})();

// elements/paper-theme-switch.js
(() => {
// <paper-theme-switch>: chooses light, dark or system mode.
//
// Wrap a segmented control of radios whose values are light, dark and system,
// or of buttons with data-mode set to those words. Radios with the same name
// form one group across the whole page, so give each switch's radios their own
// name, or leave the name off and the element supplies one. The element writes
// data-mode on the root element and marks the matching control. paper-mode.js
// stores the choice. If something else changes data-mode, the switch follows.
// A missing or unknown data-mode counts as system, as it does in the tokens.
//
// Event: paper-mode-change, bubbling, detail { mode }, when the person picks
// a mode.

const MODES = ["light", "dark", "system"];
let unnamed = 0;

/** Runs fn once the document has been parsed, so the children exist. */
const whenParsed = (fn) => {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn, { once: true });
  else fn();
};

class PaperThemeSwitch extends HTMLElement {
  #observer = null;

  #onChange = (event) => {
    const input = event.target;
    if (input instanceof HTMLInputElement && input.type === "radio" && input.checked && MODES.includes(input.value)) {
      this.#choose(input.value);
    }
  };

  #onClick = (event) => {
    const button = event.target instanceof Element ? event.target.closest("button[data-mode]") : null;
    if (button && this.contains(button) && MODES.includes(button.dataset.mode)) this.#choose(button.dataset.mode);
  };

  get mode() {
    const mode = document.documentElement.getAttribute("data-mode");
    return MODES.includes(mode) ? mode : "system";
  }

  set mode(value) {
    if (MODES.includes(value)) document.documentElement.setAttribute("data-mode", value);
  }

  connectedCallback() {
    this.addEventListener("change", this.#onChange);
    this.addEventListener("click", this.#onClick);
    this.#observer = new MutationObserver(() => this.#sync());
    this.#observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-mode"] });
    whenParsed(() => {
      const radios = [...this.querySelectorAll('input[type="radio"]')].filter((i) => MODES.includes(i.value) && !i.name);
      if (radios.length) {
        const name = `paper-mode-${++unnamed}`;
        for (const radio of radios) radio.name = name;
      }
      this.#sync();
    });
  }

  disconnectedCallback() {
    this.removeEventListener("change", this.#onChange);
    this.removeEventListener("click", this.#onClick);
    this.#observer?.disconnect();
  }

  #choose(mode) {
    const changed = mode !== this.mode || !document.documentElement.hasAttribute("data-mode");
    this.mode = mode;
    this.#sync();
    if (changed) this.dispatchEvent(new CustomEvent("paper-mode-change", { bubbles: true, detail: { mode } }));
  }

  #sync() {
    const mode = this.mode;
    for (const input of this.querySelectorAll('input[type="radio"]')) {
      if (MODES.includes(input.value)) input.checked = input.value === mode;
    }
    for (const button of this.querySelectorAll("button[data-mode]")) {
      button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
    }
  }
}

if (!customElements.get("paper-theme-switch")) customElements.define("paper-theme-switch", PaperThemeSwitch);
})();

// elements/paper-toast-region.js
(() => {
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
})();

// behaviours/popover-placement.js
(() => {
// Places each .pp-popover and .pp-menu next to the button that opened it, and
// adds Up/Down/Home/End keyboard navigation to .pp-menu.
//
// The popover attribute opens and closes them and closes them on Escape or a
// click outside, but on its own a popover sits in the middle of the window.
// This script places it below the button and aligned with its start edge (or
// end edge with data-align="end"), or above it when there is no room below,
// and always inside the window, shortened to fit if need be. It skips any
// popover that opts into native CSS Anchor Positioning (data-placement="native"
// or a CSS position-anchor value). Scroll, resize and ResizeObserver listeners
// stay attached only while at least one popover is open, and inline placement
// styles are cleared on close so a popover opened from script with no button is
// centred as usual.

const KEY = Symbol.for("paper.popover-placement");
const SELECTOR = ".pp-popover, .pp-menu";
const INVOKERS = "[popovertarget], [commandfor]";
const GAP = 4;
const EDGE = 8;
const PROPERTIES = ["margin", "inset", "left", "top", "max-height"];

if (!window[KEY]) {
  window[KEY] = true;
  const open = new Map();
  const managed = new WeakSet();
  let clicked = null;
  let listening = false;
  let raf = 0;

  // ToggleEvent.source names the button in newer engines. Older WebKit lacks
  // it, so remember the button that was last activated: its click comes before
  // the popover opens, from the pointer or from Enter and Space.
  document.addEventListener(
    "click",
    (event) => {
      clicked = event.target instanceof Element ? event.target.closest(INVOKERS) : null;
    },
    true,
  );

  const usesNativeAnchor = (popover) => {
    if (popover.dataset.placement === "native") return true;
    if (typeof CSS === "undefined" || !CSS.supports?.("position-anchor: --a")) return false;
    const pa = getComputedStyle(popover).positionAnchor;
    return Boolean(pa && pa !== "none" && pa !== "auto" && pa !== "normal");
  };

  const invokerFor = (popover, event) => {
    if (event.source instanceof Element) return event.source;
    const id = popover.id;
    if (!id) return null;
    const names = (el) => el.getAttribute("popovertarget") === id || el.getAttribute("commandfor") === id;
    if (clicked?.isConnected && names(clicked) && !popover.contains(clicked)) return clicked;
    const escaped = CSS.escape(id);
    return [...document.querySelectorAll(`[popovertarget="${escaped}"], [commandfor="${escaped}"]`)].find((el) => !popover.contains(el)) ?? null;
  };

  const place = (popover, invoker) => {
    const anchor = invoker.getBoundingClientRect();
    const style = popover.style;
    style.margin = "0";
    style.inset = "auto";
    style.maxHeight = "";
    const size = popover.getBoundingClientRect();
    const width = document.documentElement.clientWidth;
    const height = document.documentElement.clientHeight;
    const rtl = getComputedStyle(invoker).direction === "rtl";
    const alignEnd = popover.dataset.align === "end";
    const useRight = alignEnd ? !rtl : rtl;
    let left = useRight ? anchor.right - size.width : anchor.left;
    left = Math.max(EDGE, Math.min(left, width - size.width - EDGE));
    const cap = Math.floor(height * 0.8);
    const below = height - EDGE - (anchor.bottom + GAP);
    const above = anchor.top - GAP - EDGE;
    let top = anchor.bottom + GAP;
    let room = Math.min(below, cap);
    if (size.height > room && above > below) {
      room = Math.min(above, cap);
      top = Math.max(EDGE, anchor.top - GAP - Math.min(size.height, room));
    }
    if (size.height > room) style.maxHeight = `${Math.floor(room)}px`;
    style.left = `${Math.round(left)}px`;
    style.top = `${Math.round(top)}px`;
  };

  const clear = (popover) => {
    for (const property of PROPERTIES) popover.style.removeProperty(property);
  };

  const follow = () => {
    if (raf || !open.size) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      for (const [popover, invoker] of open) {
        if (popover.matches(":popover-open") && invoker.isConnected) place(popover, invoker);
        else untrack(popover);
      }
    });
  };

  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(follow) : null;

  const startListening = () => {
    if (listening) return;
    listening = true;
    window.addEventListener("resize", follow, { passive: true });
    window.addEventListener("scroll", follow, { capture: true, passive: true });
  };

  const stopListening = () => {
    if (!listening) return;
    listening = false;
    window.removeEventListener("resize", follow);
    window.removeEventListener("scroll", follow, true);
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  };

  const track = (popover, invoker) => {
    open.set(popover, invoker);
    ro?.observe(popover);
    ro?.observe(invoker);
    startListening();
  };

  const untrack = (popover) => {
    const invoker = open.get(popover);
    if (!invoker) return;
    open.delete(popover);
    ro?.unobserve(popover);
    if (![...open.values()].includes(invoker)) ro?.unobserve(invoker);
    if (!open.size) stopListening();
  };

  // beforetoggle runs before the popover shows, when it has no size yet. Its
  // corner goes by the button at once, and the animation-frame callback, which
  // runs once it is open and before the next paint, places it exactly, so the
  // first frame already shows it in place.
  document.addEventListener(
    "beforetoggle",
    (event) => {
      const popover = event.target;
      if (!(popover instanceof HTMLElement) || !popover.matches(SELECTOR)) return;
      if (event.newState === "closed") {
        untrack(popover);
        if (managed.has(popover)) {
          managed.delete(popover);
          clear(popover);
        }
        return;
      }
      if (usesNativeAnchor(popover)) return;
      const invoker = invokerFor(popover, event);
      clicked = null;
      if (!invoker) return;
      managed.add(popover);
      const anchor = invoker.getBoundingClientRect();
      Object.assign(popover.style, { margin: "0", inset: "auto", left: `${Math.round(anchor.left)}px`, top: `${Math.round(anchor.bottom + GAP)}px` });
      requestAnimationFrame(() => {
        if (!popover.matches(":popover-open")) return;
        track(popover, invoker);
        place(popover, invoker);
      });
    },
    true,
  );

  // Up/Down/Home/End keyboard navigation for open .pp-menu popovers.
  const menuItems = (menu) =>
    [...menu.querySelectorAll(".pp-menu__item")].filter(
      (el) => !el.disabled && el.getAttribute("aria-disabled") !== "true" && !el.hidden,
    );

  const openMenuForInvoker = (el) => {
    const id = el.getAttribute("popovertarget") || el.getAttribute("commandfor");
    if (id) {
      const target = document.getElementById(id);
      if (target instanceof HTMLElement && target.matches(".pp-menu:popover-open")) return target;
    }
    for (const [popover, invoker] of open) {
      if (invoker === el && popover.matches(".pp-menu:popover-open")) return popover;
    }
    return null;
  };

  document.addEventListener("keydown", (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") return;
    const target = event.target;
    if (!(target instanceof Element)) return;

    const inside = target.closest(".pp-menu:popover-open");
    if (inside) {
      const items = menuItems(inside);
      if (!items.length) return;
      const index = items.indexOf(target.closest(".pp-menu__item"));
      let next;
      if (event.key === "Home") next = items[0];
      else if (event.key === "End") next = items.at(-1);
      else if (event.key === "ArrowDown") next = items[(index + 1 + items.length) % items.length];
      else next = items[(index <= 0 ? items.length - 1 : index - 1)];
      event.preventDefault();
      next.focus();
      return;
    }

    const invoker = target.closest(INVOKERS);
    const menu = invoker ? openMenuForInvoker(invoker) : null;
    if (!menu) return;
    const items = menuItems(menu);
    if (!items.length) return;
    event.preventDefault();
    (event.key === "ArrowUp" || event.key === "End" ? items.at(-1) : items[0]).focus();
  });
}
})();

// behaviours/tooltip-dismiss.js
(() => {
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
})();

// behaviours/theme-meta.js
(() => {
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
})();

// behaviours/dialog-backdrop.js
(() => {
// Progressive-enhancement click-outside close for <dialog closedby="any">
// in engines without native HTMLDialogElement.prototype.closedBy support.

const KEY = Symbol.for("paper.dialog-backdrop");

if (!window[KEY] && typeof HTMLDialogElement !== "undefined" && !("closedBy" in HTMLDialogElement.prototype)) {
  window[KEY] = true;

  document.addEventListener("click", (event) => {
    const dialog = event.target;
    if (!(dialog instanceof HTMLDialogElement)) return;
    if (!dialog.open || !dialog.matches(":modal")) return;
    if (dialog.getAttribute("closedby")?.toLowerCase() !== "any") return;
    if (event.detail === 0 && event.clientX === 0 && event.clientY === 0) return;

    const rect = dialog.getBoundingClientRect();
    const outside =
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom;
    if (outside) dialog.close();
  });
}
})();
