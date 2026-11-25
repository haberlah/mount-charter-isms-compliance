import type { DetailedHTMLProps, HTMLAttributes } from "react";
import type {
  PaperSplit,
  PaperTabs,
  PaperThemeSwitch,
  PaperToastRegion,
} from "../vendor/paper/elements/index.js";

declare module "react" {
  interface DialogHTMLAttributes<T> extends HTMLAttributes<T> {
    closedby?: "any" | "closerequest" | "none";
  }

  namespace JSX {
    interface IntrinsicElements {
      "paper-split": DetailedHTMLProps<HTMLAttributes<PaperSplit>, PaperSplit> & {
        class?: string;
        pane?: "start" | "end";
        min?: number | string;
        max?: number | string;
        "min-second"?: number | string;
        default?: number | string;
        collapsed?: boolean | string;
        "collapse-below"?: number | string;
        responsive?: "stack" | "collapse" | "none";
        "collapse-at"?: number | string;
        "storage-key"?: string;
      };
      "paper-tabs": DetailedHTMLProps<HTMLAttributes<PaperTabs>, PaperTabs> & {
        class?: string;
        activation?: "automatic" | "manual";
      };
      "paper-theme-switch": DetailedHTMLProps<
        HTMLAttributes<PaperThemeSwitch>,
        PaperThemeSwitch
      > & {
        class?: string;
        "storage-key"?: string;
      };
      "paper-toast-region": DetailedHTMLProps<
        HTMLAttributes<PaperToastRegion>,
        PaperToastRegion
      > & {
        class?: string;
        popover?: "auto" | "manual" | "";
        timeout?: number;
        max?: number;
      };
    }
  }
}
