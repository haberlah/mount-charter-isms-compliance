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

export { PaperTabs };
