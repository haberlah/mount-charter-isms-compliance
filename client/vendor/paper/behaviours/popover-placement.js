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
