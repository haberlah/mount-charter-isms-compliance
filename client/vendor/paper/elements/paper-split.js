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

export { PaperSplit };
