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

export { PaperThemeSwitch };
