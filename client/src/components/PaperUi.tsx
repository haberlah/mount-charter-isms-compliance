import type {
  ControlSummary,
  ControlUrgency,
  DocumentRecord,
  E8AchievedLevel,
  FrameworkSummary,
  ImplementationStatus,
  RequirementStatus,
  Severity,
  TestStatus,
} from "@shared/schema";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PaperTabs as PaperTabsElement } from "../../vendor/paper/elements/index.js";

const LOCAL_ICONS = new Set([
  "mw-brand",
  "shield",
  "file-text",
  "clipboard-check",
  "upload",
  "download",
  "link-2",
  "history",
  "building-2",
  "key",
  "calendar",
]);

export function Icon({ name, className = "pp-icon" }: { name: string; className?: string }) {
  const sprite = LOCAL_ICONS.has(name) ? "/mount-charter-icons.svg" : "/paper/icons.svg";
  return (
    <svg className={className} aria-hidden="true">
      <use href={`${sprite}#${name}`} />
    </svg>
  );
}

const STATUS_META: Record<
  TestStatus | "NotAttempted",
  { label: string; tone: "ok" | "warn" | "err" | "accent" | "neutral" }
> = {
  Pass: { label: "Pass", tone: "ok" },
  PassPrevious: { label: "Pass (Previous)", tone: "ok" },
  ContinualImprovement: { label: "Improvement", tone: "accent" },
  Blocked: { label: "Blocked", tone: "warn" },
  Fail: { label: "Fail", tone: "err" },
  NotAttempted: { label: "Not Tested", tone: "neutral" },
};

export function StatusBadge({ status }: { status: TestStatus | null | undefined }) {
  const key = status || "NotAttempted";
  const meta = STATUS_META[key] || STATUS_META.NotAttempted;
  if (meta.tone === "neutral") {
    return <span className="pp-badge">{meta.label}</span>;
  }
  return <span className={`pp-status pp-status--${meta.tone}`}>{meta.label}</span>;
}

export function ImplementationStatusBadge({ status }: { status: ImplementationStatus }) {
  switch (status) {
    case "Implemented":
      return <span className="pp-status pp-status--ok">Implemented</span>;
    case "PartiallyImplemented":
      return <span className="pp-status pp-status--warn">Partial</span>;
    case "Planned":
      return <span className="pp-badge pp-badge--accent">Planned</span>;
    default:
      return <span className="pp-badge">Not Implemented</span>;
  }
}

export function RequirementStatusBadge({ status }: { status: RequirementStatus }) {
  switch (status) {
    case "Met":
      return <span className="pp-status pp-status--ok">Met</span>;
    case "PartiallyMet":
      return <span className="pp-status pp-status--warn">Partial</span>;
    case "NotApplicable":
      return <span className="pp-badge">N/A</span>;
    default:
      return <span className="pp-status pp-status--err">Not Met</span>;
  }
}

export function E8MaturityBadge({ level }: { level: E8AchievedLevel }) {
  if (level === "ML3") return <span className="pp-status pp-status--ok">ML3</span>;
  if (level === "ML2") return <span className="pp-status pp-status--ok">ML2</span>;
  if (level === "ML1") return <span className="pp-status pp-status--warn">ML1</span>;
  return <span className="pp-status pp-status--err">ML0</span>;
}

export function UrgencyBadge({ urgency }: { urgency: ControlUrgency }) {
  if (urgency === "now") return <span className="pp-status pp-status--err">Now</span>;
  if (urgency === "next") return <span className="pp-status pp-status--warn">Next</span>;
  return <span className="pp-badge">Later</span>;
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  if (severity === "Critical") return <span className="pp-status pp-status--err">Critical</span>;
  if (severity === "High") return <span className="pp-status pp-status--warn">High</span>;
  if (severity === "Medium") return <span className="pp-badge pp-badge--accent">Medium</span>;
  return <span className="pp-badge">Low</span>;
}

export function ComplianceRing({
  percentage,
  label,
  sublabel,
  tone = "accent",
}: {
  percentage: number;
  label: string;
  sublabel: string;
  tone?: "accent" | "ok";
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(percentage)));
  const r = 26;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - clamped / 100);
  return (
    <div className="mw-ring-wrap">
      <svg className="mw-ring" viewBox="0 0 64 64" role="img" aria-label={`${label}: ${clamped}%`}>
        <circle className="mw-ring__track" cx="32" cy="32" r={r} />
        <circle
          className={`mw-ring__fill${tone === "ok" ? " mw-ring__fill--ok" : ""}`}
          cx="32"
          cy="32"
          r={r}
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
        <text className="mw-ring__text" x="32" y="32">
          {clamped}%
        </text>
      </svg>
      <div className="mw-stack mw-stack--sm" style={{ gap: 2 }}>
        <div className="pp-title">{label}</div>
        <div className="mw-muted">{sublabel}</div>
      </div>
    </div>
  );
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Accessible Paper underline tabs wrapping the vendored <paper-tabs> custom element
 * with full WAI-ARIA roving tabindex & ArrowLeft/ArrowRight/Home/End navigation.
 */
export function PaperTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: ReadonlyArray<{ id: T; label: string }>;
  value: T;
  onChange: (next: T) => void;
  label: string;
}) {
  const hostRef = useRef<PaperTabsElement>(null);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const onTabChange = (e: Event) => {
      const idx = (e as CustomEvent<{ index?: number }>).detail?.index;
      if (typeof idx === "number" && tabs[idx] && tabs[idx].id !== value) {
        onChange(tabs[idx].id);
      }
    };
    el.addEventListener("paper-tab-change", onTabChange);
    return () => el.removeEventListener("paper-tab-change", onTabChange);
  }, [tabs, value, onChange]);

  return (
    <paper-tabs ref={hostRef} class="mw-tabs-wrap">
      <div className="pp-tabs pp-tabs--underline" role="tablist" aria-label={label}>
        {tabs.map((t) => {
          const selected = t.id === value;
          return (
            <button
              key={t.id}
              id={`tab-${t.id}`}
              type="button"
              role="tab"
              className="pp-tabs__tab"
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(t.id)}
            >
              {t.label}
            </button>
          );
        })}
      </div>
    </paper-tabs>
  );
}

/**
 * Native Paper confirmation modal replacing blocking window.confirm()
 * (which silently fails inside macOS WKWebView).
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  danger = false,
  busy = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) dlg.showModal();
    else if (!open && dlg.open) dlg.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="pp-dialog pp-dialog--confirm"
      closedby="any"
      aria-labelledby="mw-confirm-title"
      onClose={onClose}
    >
      <div className="pp-dialog__header">
        <h2 id="mw-confirm-title" className="pp-dialog__title">
          {title}
        </h2>
        <button
          type="button"
          className="pp-icon-button pp-icon-button--compact"
          aria-label="Close confirmation dialog"
          onClick={onClose}
        >
          <Icon name="x" />
        </button>
      </div>
      <div className="pp-dialog__body">
        <p className="pp-prose" style={{ margin: 0 }}>
          {message}
        </p>
      </div>
      <div className="pp-dialog__footer">
        <button type="button" className="pp-button" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className={`pp-button ${danger ? "pp-button--danger" : "pp-button--primary"}`}
          disabled={busy}
          onClick={onConfirm}
        >
          {busy ? "Working…" : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}

export interface ParsedAiAnalysis {
  assessment?: string;
  suggested_status?: TestStatus;
  confidence?: number;
  observations?: string[];
  recommendations?: string[];
  persona_specific?: Record<string, unknown>;
}

/**
 * Shared structured renderer for AI test analyses across ControlDetail & Audit Trail
 * (renders observations, recommendations, and all persona_specific Auditor/Advisor/Analyst fields).
 */
export function AiAnalysisCard({
  analysis,
  raw,
}: {
  analysis?: ParsedAiAnalysis | null;
  raw?: string | null;
}) {
  const parsed = useMemo<ParsedAiAnalysis | null>(() => {
    if (analysis) return analysis;
    if (!raw) return null;
    try {
      return JSON.parse(raw) as ParsedAiAnalysis;
    } catch {
      return { assessment: raw };
    }
  }, [analysis, raw]);

  if (!parsed) return null;
  const ps = parsed.persona_specific || {};
  const psEntries = Object.entries(ps).filter(([, v]) => {
    if (v === null || v === undefined || v === "") return false;
    if (Array.isArray(v) && v.length === 0) return false;
    return true;
  });

  const formatKey = (k: string) =>
    k
      .replace(/_/g, " ")
      .replace(/\bnc\b/gi, "NC")
      .replace(/\bkpis?\b/gi, (m) => m.toUpperCase())
      .replace(/^\w/, (c) => c.toUpperCase());

  return (
    <div className="mw-match-card">
      <div className="mw-row mw-row--between mw-row--wrap">
        <strong>AI Assessment</strong>
        {parsed.suggested_status && (
          <span className="pp-badge pp-badge--accent">
            {parsed.suggested_status}
            {parsed.confidence != null ? ` (${Math.round(parsed.confidence * 100)}%)` : ""}
          </span>
        )}
      </div>
      {parsed.assessment && <div className="pp-prose">{parsed.assessment}</div>}
      {parsed.observations && parsed.observations.length > 0 && (
        <div className="pp-prose">
          <strong>Observations</strong>
          <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
            {parsed.observations.map((o, i) => (
              <li key={i}>{o}</li>
            ))}
          </ul>
        </div>
      )}
      {parsed.recommendations && parsed.recommendations.length > 0 && (
        <div className="pp-prose">
          <strong>Recommendations</strong>
          <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
            {parsed.recommendations.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}
      {psEntries.length > 0 && (
        <div
          className="mw-stack mw-stack--sm"
          style={{ paddingTop: 4, borderTop: "1px solid var(--paper-line-soft)" }}
        >
          {psEntries.map(([k, v]) => (
            <div key={k} className="pp-prose">
              <strong>{formatKey(k)}:</strong>{" "}
              {Array.isArray(v) ? (
                <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                  {v.map((item, i) => (
                    <li key={i}>{String(item)}</li>
                  ))}
                </ul>
              ) : (
                <span>{String(v)}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Paper-styled Command Palette with full ArrowUp / ArrowDown / Home / End / Enter keyboard navigation
 * and deep-links to controls, frameworks, and individual documents.
 */
export function CommandPalette({
  open,
  onClose,
  controls,
  documents,
  frameworks = [],
  onNavigate,
}: {
  open: boolean;
  onClose: () => void;
  controls: ControlSummary[];
  documents: DocumentRecord[];
  frameworks?: FrameworkSummary[];
  onNavigate: (path: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      setQuery("");
      setActiveIndex(0);
      dlg.showModal();
      setTimeout(() => inputRef.current?.focus(), 0);
    } else if (!open && dlg.open) {
      dlg.close();
    }
  }, [open]);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const navItems = [
      {
        id: "nav-overview",
        title: "Overview",
        meta: "Workspace",
        search: "overview dashboard",
        path: "/",
      },
      {
        id: "nav-controls",
        title: "Controls",
        meta: "Workspace",
        search: "controls iso 27001",
        path: "/controls",
      },
      {
        id: "nav-frameworks",
        title: "Frameworks (Essential Eight, Privacy Act & AU Legislation)",
        meta: "Workspace",
        search: "frameworks essential eight e8 privacy act apps pola cps 234 230 soci",
        path: "/frameworks",
      },
      {
        id: "nav-governance",
        title: "Governance (Risks, CAPA, Vendors, Policies, Incidents)",
        meta: "Workspace",
        search:
          "governance risks capa nonconformity audit review vendors msp cps 230 policies incidents breach clock",
        path: "/governance",
      },
      {
        id: "nav-evidence",
        title: "Evidence Library",
        meta: "Workspace",
        search: "evidence documents upload",
        path: "/evidence",
      },
      {
        id: "nav-audit",
        title: "Audit & SoA",
        meta: "Workspace",
        search: "audit soa exports statement of applicability",
        path: "/audit",
      },
      {
        id: "nav-settings",
        title: "Settings",
        meta: "Workspace",
        search: "settings profile api key workspaces",
        path: "/settings",
      },
    ];
    const fwItems = frameworks
      .filter((f) => f.supportTier === "full" && f.code !== "iso27001_2022")
      .map((f) => ({
        id: `fw-${f.code}`,
        title: f.name,
        meta: f.weakestLinkMaturity
          ? `E8 ${f.weakestLinkMaturity}`
          : `${f.readinessPercentage}% ready`,
        search: `${f.name} ${f.shortName} ${f.code}`.toLowerCase(),
        path: `/frameworks?fw=${encodeURIComponent(f.code)}`,
      }));
    const ctrlItems = controls.map((c) => ({
      id: `ctrl-${c.controlNumber}`,
      title: `${c.controlNumber} — ${c.name}`,
      meta: c.shortSummary || c.category.name,
      search:
        `${c.controlNumber} ${c.name} ${c.shortSummary || ""} ${c.category.name} ${c.cps234Reference || ""} ${c.cps230Reference || ""}`.toLowerCase(),
      path: `/controls/${encodeURIComponent(c.controlNumber)}`,
    }));
    const docItems = documents.map((d) => ({
      id: `doc-${d.id}`,
      title: d.title,
      meta: d.evidenceType || "Document",
      search: `${d.title} ${d.originalFilename} ${d.evidenceType || ""}`.toLowerCase(),
      path: `/evidence?doc=${d.id}`,
    }));
    const all = [...navItems, ...fwItems, ...ctrlItems, ...docItems];
    if (!q) return all.slice(0, 14);
    return all.filter((item) => item.search.includes(q)).slice(0, 20);
  }, [query, controls, documents, frameworks]);

  const selectItem = (index: number) => {
    const item = items[index];
    if (!item) return;
    onClose();
    onNavigate(item.path);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (items.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + items.length) % items.length);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActiveIndex(items.length - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      selectItem(activeIndex);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="pp-dialog pp-dialog--palette"
      closedby="any"
      aria-label="Quick jump palette"
      onClose={onClose}
    >
      <div className="pp-palette-search">
        <Icon name="search" className="pp-icon" />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded="true"
          aria-controls="mw-palette-listbox"
          aria-activedescendant={items[activeIndex] ? `pal-${items[activeIndex].id}` : undefined}
          placeholder="Jump to control (5.1, RQ6, CPS 234), framework, or document…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={handleKeyDown}
          aria-label="Search controls, frameworks, documents, and pages"
        />
        <kbd className="pp-kbd">Esc</kbd>
      </div>
      <div
        id="mw-palette-listbox"
        className="pp-palette-list"
        role="listbox"
        aria-label="Search results"
      >
        {items.length === 0 ? (
          <div className="mw-muted" style={{ padding: "14px 12px" }}>
            No matching controls, frameworks, or documents.
          </div>
        ) : (
          items.map((item, idx) => {
            const selected = idx === activeIndex;
            return (
              <button
                key={item.id}
                id={`pal-${item.id}`}
                type="button"
                role="option"
                aria-selected={selected}
                className="pp-palette-item"
                onMouseEnter={() => setActiveIndex(idx)}
                onClick={() => selectItem(idx)}
              >
                <span>{item.title}</span>
                <span className="pp-palette-item__hint">{item.meta}</span>
              </button>
            );
          })
        )}
      </div>
    </dialog>
  );
}
