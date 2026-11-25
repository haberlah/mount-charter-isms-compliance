// Type declarations for Paper's custom elements, for dist/elements/index.js
// and for the classic bundle dist/paper.js, which defines the same elements.
// Importing the index also installs the 4 behaviours: popover placement,
// tooltip dismissal, theme-color synchronisation, and dialog backdrop dismissal.

export type PaperMode = "light" | "dark" | "system";

export interface PaperTabChangeDetail {
  tab: HTMLElement;
  panel: HTMLElement | null;
  index: number;
}

export type PaperSplitPane = "start" | "end";
export type PaperSplitResponsive = "stack" | "collapse" | "none";

export interface PaperResizeDetail {
  size: number;
}

export interface PaperCollapseDetail {
  collapsed: boolean;
  size: number | null;
  reason: "user" | "drag" | "responsive" | "api";
}

export interface PaperModeChangeDetail {
  mode: PaperMode;
}

export type PaperToastTone = "" | "ok" | "warn" | "err";

export interface PaperToastOptions {
  title?: string;
  tone?: PaperToastTone;
  /** Milliseconds before the toast leaves. 0 keeps it until dismissed. */
  timeout?: number;
  action?: { label: string; onClick?: (toast: HTMLElement) => void };
  dismissLabel?: string;
}

export interface PaperToastDismissDetail {
  toast: HTMLElement;
  reason: "timeout" | "dismiss" | "action" | "escape" | "overflow";
}

export declare class PaperTabs extends HTMLElement {
  readonly tabs: HTMLElement[];
  readonly selected: HTMLElement | null;
  select(tab: HTMLElement | number, options?: { focus?: boolean; emit?: boolean }): void;
}

export declare class PaperSplit extends HTMLElement {
  readonly min: number;
  readonly max: number;
  readonly minSecond: number;
  readonly default: number;
  pane: PaperSplitPane;
  collapsed: boolean;
  readonly collapseBelow: number;
  readonly responsive: PaperSplitResponsive;
  readonly collapseAt: number;
  size: number | null;
  toggle(force?: boolean): boolean;
  reset(): void;
}

export declare class PaperThemeSwitch extends HTMLElement {
  mode: PaperMode;
}

export declare class PaperToastRegion extends HTMLElement {
  readonly toasts: HTMLElement[];
  show(message: string, options?: PaperToastOptions): HTMLElement;
  dismiss(toast: HTMLElement, reason?: PaperToastDismissDetail["reason"]): void;
}

declare global {
  interface HTMLElementTagNameMap {
    "paper-tabs": PaperTabs;
    "paper-split": PaperSplit;
    "paper-theme-switch": PaperThemeSwitch;
    "paper-toast-region": PaperToastRegion;
  }

  // The events bubble, so a listener on the document receives them too.
  interface PaperEventMap {
    "paper-tab-change": CustomEvent<PaperTabChangeDetail>;
    "paper-resize": CustomEvent<PaperResizeDetail>;
    "paper-collapse": CustomEvent<PaperCollapseDetail>;
    "paper-mode-change": CustomEvent<PaperModeChangeDetail>;
    "paper-toast-dismiss": CustomEvent<PaperToastDismissDetail>;
  }

  interface HTMLElementEventMap extends PaperEventMap {}
  interface DocumentEventMap extends PaperEventMap {}
}
