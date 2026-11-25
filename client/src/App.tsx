import type {
  ControlSummary,
  DashboardStats,
  DocumentRecord,
  FrameworkSummary,
  Workspace,
} from "@shared/schema";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Route, Switch, useLocation } from "wouter";
import { CommandPalette, Icon } from "@/components/PaperUi";
import {
  apiRequest,
  getActiveWorkspaceId,
  invalidateWorkspaceQueries,
  setActiveWorkspaceId,
} from "@/lib/api";
import { AuditPage } from "@/pages/AuditPage";
import { ControlsPage } from "@/pages/ControlsPage";
import { EvidencePage } from "@/pages/EvidencePage";
import { FrameworksPage } from "@/pages/FrameworksPage";
import { GovernancePage } from "@/pages/GovernancePage";
import { OverviewPage } from "@/pages/OverviewPage";
import { SettingsPage } from "@/pages/SettingsPage";

const PRIMARY_NAV = [
  { href: "/", label: "Overview" },
  { href: "/controls", label: "Controls" },
  { href: "/frameworks", label: "Frameworks" },
  { href: "/governance", label: "Governance" },
  { href: "/evidence", label: "Evidence" },
  { href: "/audit", label: "Audit & SoA" },
] as const;

export default function App() {
  const [location, navigate] = useLocation();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const scrollRef = useRef<HTMLElement>(null);
  const lastNonSettingsPathRef = useRef<string>("/");

  const { data: wsData, refetch: refetchWorkspaces } = useQuery<{
    workspaces: Workspace[];
    archivedWorkspaces: Workspace[];
  }>({
    queryKey: ["workspaces"],
    queryFn: () => apiRequest("GET", "/api/workspaces"),
  });

  const workspaces = wsData?.workspaces || [];
  const archivedWorkspaces = wsData?.archivedWorkspaces || [];
  const storedId = getActiveWorkspaceId();
  const activeWorkspace = workspaces.find((w) => w.id === storedId) || workspaces[0] || null;
  const activeWsId = activeWorkspace?.id ?? null;

  useEffect(() => {
    if (activeWorkspace && activeWorkspace.id !== storedId) {
      setActiveWorkspaceId(activeWorkspace.id);
      invalidateWorkspaceQueries();
    }
  }, [activeWorkspace, storedId]);

  useEffect(() => {
    if (!location.startsWith("/settings")) {
      lastNonSettingsPathRef.current = location || "/";
    }
  }, [location]);

  const { data: stats } = useQuery<DashboardStats>({
    queryKey: ["dashboard", activeWsId],
    queryFn: () => apiRequest<DashboardStats>("GET", "/api/dashboard"),
    enabled: activeWsId !== null,
  });

  const { data: controls = [] } = useQuery<ControlSummary[]>({
    queryKey: ["controls", activeWsId],
    queryFn: () => apiRequest<ControlSummary[]>("GET", "/api/controls"),
    enabled: activeWsId !== null,
  });

  const { data: documents = [] } = useQuery<DocumentRecord[]>({
    queryKey: ["documents", activeWsId],
    queryFn: () => apiRequest<DocumentRecord[]>("GET", "/api/documents"),
    enabled: activeWsId !== null,
  });

  const { data: frameworks = [] } = useQuery<FrameworkSummary[]>({
    queryKey: ["frameworks", activeWsId],
    queryFn: () => apiRequest<FrameworkSummary[]>("GET", "/api/frameworks"),
    enabled: activeWsId !== null,
  });

  const onSettings = location === "/settings" || location.startsWith("/settings/");
  const isControlsSplit = location === "/controls" || location.startsWith("/controls/");

  const toggleSettings = useCallback(() => {
    navigate(onSettings ? lastNonSettingsPathRef.current || "/" : "/settings");
  }, [navigate, onSettings]);

  // Global keyboard shortcuts (⌘K palette, ⌘, Settings toggle, ⌘1-6 workspaces) + native menu bridge
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      } else if (key === ",") {
        e.preventDefault();
        toggleSettings();
      } else if (key >= "1" && key <= "6") {
        const target = PRIMARY_NAV[Number(key) - 1];
        if (target) {
          e.preventDefault();
          navigate(target.href);
        }
      }
    };
    const onCustomNav = (e: Event) => {
      const path = (e as CustomEvent<string>).detail;
      if (typeof path === "string") navigate(path);
    };
    const onCustomPalette = () => setPaletteOpen((v) => !v);
    window.addEventListener("keydown", onKey);
    window.addEventListener("mount-charter:navigate", onCustomNav);
    window.addEventListener("mount-charter:palette", onCustomPalette);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mount-charter:navigate", onCustomNav);
      window.removeEventListener("mount-charter:palette", onCustomPalette);
    };
  }, [navigate, toggleSettings]);

  useEffect(() => {
    if (location !== undefined) {
      scrollRef.current?.scrollTo({ top: 0 });
    }
  }, [location]);

  const handleWorkspaceSwitch = async (id: number) => {
    setActiveWorkspaceId(id);
    await refetchWorkspaces();
    await invalidateWorkspaceQueries();
  };

  const isCurrent = (href: string) =>
    href === "/" ? location === "/" : location === href || location.startsWith(`${href}/`);

  const enabledExtraFrameworks = frameworks.filter(
    (f) => f.enabled && f.supportTier === "full" && f.code !== "iso27001_2022",
  ).length;

  return (
    <div className="pp-app pp-workspace mw-shell">
      <a href="#main-content" className="mw-skip-link">
        Skip to main content
      </a>

      {/* 52 px Paper Unified Compact Top Bar — matches Home & Shortlist */}
      <header id="main-topbar" className="pp-topbar pp-topbar--compact pp-topbar--workbench">
        <div className="pp-topbar__start">
          <Link
            href="/"
            className="pp-topbar__title mw-brand"
            aria-label="Mount Charter — Overview"
          >
            <svg
              className="pp-brand-glyph mw-brand__glyph"
              width="18"
              height="18"
              viewBox="226 226 572 572"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M 512 292 L 708 362 V 508 Q 708 654 512 732 Q 316 654 316 508 V 362 Z"
                stroke="currentColor"
                strokeWidth="108"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="512" cy="512" r="54" fill="currentColor" />
            </svg>
            <span>Mount Charter</span>
          </Link>

          <nav aria-label="Main workspaces">
            <ul className="pp-tabs pp-tabs--nav">
              {PRIMARY_NAV.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="pp-tabs__tab"
                    aria-current={isCurrent(item.href) ? "page" : undefined}
                  >
                    <span>{item.label}</span>
                    {item.href === "/controls" && stats && (
                      <span className="pp-badge">{stats.applicableControls}</span>
                    )}
                    {item.href === "/frameworks" && enabledExtraFrameworks > 0 && (
                      <span className="pp-badge">{enabledExtraFrameworks}</span>
                    )}
                    {item.href === "/evidence" &&
                      stats &&
                      stats.documentStats.pendingSuggestions > 0 && (
                        <span className="pp-badge pp-badge--accent">
                          {stats.documentStats.pendingSuggestions}
                        </span>
                      )}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="pp-topbar__end">
          {workspaces.length > 0 && (
            <>
              <label className="pp-sr-only" htmlFor="topbar-ws-switcher">
                Active organisation workspace
              </label>
              <select
                id="topbar-ws-switcher"
                className="pp-select pp-select--sm pp-select--ghost mw-ws-select"
                value={activeWorkspace?.id ?? ""}
                onChange={(e) => handleWorkspaceSwitch(Number(e.target.value))}
                title="Switch organisation workspace"
              >
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </>
          )}

          <Link
            href="/evidence?upload=1"
            className="pp-button pp-button--sm pp-compact-icon-lg"
            title="Upload evidence document"
          >
            <Icon name="plus" />
            <span className="pp-btn-label">Upload</span>
          </Link>

          <button
            type="button"
            className="pp-icon-button"
            aria-label="Quick jump palette (⌘K)"
            title="Quick jump to control, framework, or document (⌘K)"
            onClick={() => setPaletteOpen((v) => !v)}
          >
            <Icon name="command" />
          </button>

          <button
            type="button"
            className="pp-icon-button"
            aria-label="Settings & Preferences (⌘,)"
            aria-pressed={onSettings}
            title="Settings & Preferences (⌘,)"
            onClick={toggleSettings}
          >
            <Icon name="settings" />
          </button>
        </div>
      </header>

      <main
        id="main-content"
        ref={scrollRef}
        className={`pp-app__main mw-scroll-area${isControlsSplit ? " mw-scroll-area--split" : ""}`}
        tabIndex={-1}
      >
        <Switch>
          <Route path="/" component={OverviewPage} />
          <Route path="/controls" component={ControlsPage} />
          <Route path="/controls/:controlNumber" component={ControlsPage} />
          <Route path="/frameworks" component={FrameworksPage} />
          <Route path="/governance" component={GovernancePage} />
          <Route path="/evidence" component={EvidencePage} />
          <Route path="/documents" component={EvidencePage} />
          <Route path="/audit" component={AuditPage} />
          <Route path="/settings">
            {() => (
              <SettingsPage
                activeWorkspace={activeWorkspace}
                workspaces={workspaces}
                archivedWorkspaces={archivedWorkspaces}
                onWorkspaceChanged={handleWorkspaceSwitch}
              />
            )}
          </Route>
          <Route>
            {() => (
              <div className="mw-container">
                <div className="pp-state">
                  <div className="pp-state__title">Page not found</div>
                  <Link href="/" className="pp-button pp-button--primary pp-button--sm">
                    Return to Overview
                  </Link>
                </div>
              </div>
            )}
          </Route>
        </Switch>
      </main>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        controls={controls}
        documents={documents}
        frameworks={frameworks}
        onNavigate={(path) => navigate(path)}
      />

      <paper-toast-region class="pp-toasts" popover="manual" aria-label="Notifications" />
    </div>
  );
}
