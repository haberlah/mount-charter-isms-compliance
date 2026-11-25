// <paper-ai-connections> and <paper-ai-pill>: unified, framework-agnostic
// Light-DOM custom elements for AI subscription SSO, OpenRouter OAuth PKCE + ZDR,
// direct API keys, and local offline servers across Paper desktop apps.
//
// Events emitted (all bubbling CustomEvents):
//   paper-ai-select            { providerId }
//   paper-ai-sso-start         { providerId }
//   paper-ai-signout           { providerId }
//   paper-ai-openrouter-oauth  {}
//   paper-ai-key-save          { providerId, apiKey, baseUrl? }
//   paper-ai-key-remove        { providerId }
//   paper-ai-zdr-change        { enabled }
//   paper-ai-preset-change     { preset }
//   paper-ai-test              { providerId? }
//   paper-ai-refresh           {}
//   paper-ai-open-preferences  {}

const GLYPHS = {
  claude: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 2.2 12.8 13.5h-2.1L9.6 10.7H6.4l-1.1 2.8H3.2L8 2.2Zm0 3.3-1 2.9h2l-1-2.9Z" fill="currentColor"/></svg>',
  codex: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.5"/><circle cx="8" cy="8" r="2" fill="currentColor"/></svg>',
  gemini: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 1.5c.8 3.6 2.9 5.7 6.5 6.5-3.6.8-5.7 2.9-6.5 6.5-.8-3.6-2.9-5.7-6.5-6.5 3.6-.8 5.7-2.9 6.5-6.5Z" fill="currentColor"/></svg>',
  grok: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  cursor: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3.5 2.5 13 7.2 8.6 8.8 7 13.5 3.5 2.5Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
  openrouter: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="3.5" cy="8" r="1.8" stroke="currentColor" stroke-width="1.4"/><circle cx="12.5" cy="4" r="1.8" stroke="currentColor" stroke-width="1.4"/><circle cx="12.5" cy="12" r="1.8" stroke="currentColor" stroke-width="1.4"/><path d="M5.2 7.3 10.8 4.7M5.2 8.7l5.6 2.6" stroke="currentColor" stroke-width="1.3"/></svg>',
  lock: '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="3.5" y="7" width="9" height="6.5" rx="1.5" stroke="currentColor" stroke-width="1.5"/><path d="M5.5 7V5.2a2.5 2.5 0 0 1 5 0V7" stroke="currentColor" stroke-width="1.5"/></svg>',
};

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtUsd(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  return `$${value.toFixed(2)}`;
}

function defaultState() {
  return {
    activeProviderId: "auto",
    activeLabel: "Not connected",
    activeMeta: "Sign in to a subscription or OpenRouter to begin",
    health: "none",
    zdrEnabled: true,
    preset: "balanced",
    resolvedScreening: "",
    resolvedSynthesis: "",
    subscriptions: [
      { id: "claude_cli", glyph: "claude", name: "Claude", installed: false, authenticated: false, statusText: "Install CLI", installCmd: "curl -fsSL https://claude.ai/install.sh | bash" },
      { id: "codex_cli", glyph: "codex", name: "ChatGPT", installed: false, authenticated: false, statusText: "Install CLI", installCmd: "npm i -g @openai/codex" },
      { id: "gemini_cli", glyph: "gemini", name: "Gemini", installed: false, authenticated: false, statusText: "Install CLI", installCmd: "brew install gemini-cli" },
      { id: "grok_cli", glyph: "grok", name: "Grok", installed: false, authenticated: false, statusText: "Install CLI", installCmd: "curl -fsSL https://grok.com/install.sh | sh" },
      { id: "cursor_cli", glyph: "cursor", name: "Cursor", installed: false, authenticated: false, statusText: "Install CLI", installCmd: "curl -fsSL https://cursor.com/install | bash" },
    ],
    openrouter: {
      connected: false,
      creditsRemainingUsd: null,
      isProvisioningKey: false,
      oauthSupported: true,
      note: "",
    },
    localServers: [],
    directKeys: [],
    hubConnected: false,
  };
}

class PaperAiConnections extends HTMLElement {
  #state = defaultState();
  #pendingSso = new Set();
  #expandedInstall = null;
  #busy = false;
  #slotNodes = [];

  static get observedAttributes() {
    return ["mode", "features", "endpoint"];
  }

  get mode() {
    return this.getAttribute("mode") === "multi" ? "multi" : "single";
  }

  get features() {
    const raw = this.getAttribute("features");
    if (!raw) return new Set(["zdr", "presets", "local", "direct-keys"]);
    return new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
  }

  get state() {
    return this.#state;
  }

  set state(next) {
    if (!next || typeof next !== "object") return;
    this.#state = { ...defaultState(), ...next };
    this.#render();
  }

  connectedCallback() {
    // Preserve host-provided extension slot nodes across renders
    this.#slotNodes = [...this.querySelectorAll("[data-ai-slot]")];
    this.addEventListener("click", this.#onClick);
    this.addEventListener("change", this.#onChange);
    this.addEventListener("submit", this.#onSubmit);
    this.#render();
    const ep = this.getAttribute("endpoint");
    if (ep) void this.refreshFromEndpoint();
  }

  disconnectedCallback() {
    this.removeEventListener("click", this.#onClick);
    this.removeEventListener("change", this.#onChange);
    this.removeEventListener("submit", this.#onSubmit);
  }

  attributeChangedCallback() {
    if (this.isConnected) this.#render();
  }

  async refreshFromEndpoint() {
    const ep = this.getAttribute("endpoint");
    if (!ep) return;
    this.#busy = true;
    this.#render();
    try {
      const res = await fetch(ep, { credentials: "same-origin" });
      if (res.ok) {
        const data = await res.json();
        if (data && typeof data === "object") {
          this.#state = { ...defaultState(), ...data };
        }
      }
    } catch {
      // keep prior state on transient error
    } finally {
      this.#busy = false;
      this.#render();
    }
  }

  #emit(name, detail = {}) {
    this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: false, detail }));
  }

  #onClick = (event) => {
    const btn = event.target instanceof Element ? event.target.closest("[data-ai-action]") : null;
    if (!btn || !this.contains(btn)) return;
    const action = btn.getAttribute("data-ai-action");
    const providerId = btn.getAttribute("data-provider") || "";
    if (action === "refresh") {
      this.#emit("paper-ai-refresh");
      if (this.getAttribute("endpoint")) void this.refreshFromEndpoint();
    } else if (action === "test") {
      this.#emit("paper-ai-test", providerId ? { providerId } : {});
    } else if (action === "sso-start") {
      this.#pendingSso.add(providerId);
      this.#render();
      this.#emit("paper-ai-sso-start", { providerId });
    } else if (action === "signout") {
      this.#pendingSso.delete(providerId);
      this.#emit("paper-ai-signout", { providerId });
    } else if (action === "openrouter-oauth") {
      this.#emit("paper-ai-openrouter-oauth");
    } else if (action === "toggle-install") {
      this.#expandedInstall = this.#expandedInstall === providerId ? null : providerId;
      this.#render();
    } else if (action === "copy-install") {
      const cmd = btn.getAttribute("data-cmd") || "";
      if (cmd && navigator.clipboard) void navigator.clipboard.writeText(cmd);
    } else if (action === "preset") {
      const preset = btn.getAttribute("data-preset") || "balanced";
      this.#state = { ...this.#state, preset };
      this.#render();
      this.#emit("paper-ai-preset-change", { preset });
    } else if (action === "select") {
      this.#state = { ...this.#state, activeProviderId: providerId };
      this.#render();
      this.#emit("paper-ai-select", { providerId });
    } else if (action === "remove-key") {
      this.#emit("paper-ai-key-remove", { providerId });
    }
  };

  #onChange = (event) => {
    const el = event.target;
    if (!(el instanceof HTMLElement) || !this.contains(el)) return;
    const action = el.getAttribute("data-ai-change");
    if (action === "select-radio" && el instanceof HTMLInputElement && el.checked) {
      this.#state = { ...this.#state, activeProviderId: el.value };
      this.#render();
      this.#emit("paper-ai-select", { providerId: el.value });
    } else if (action === "select-dropdown" && el instanceof HTMLSelectElement) {
      this.#state = { ...this.#state, activeProviderId: el.value };
      this.#render();
      this.#emit("paper-ai-select", { providerId: el.value });
    } else if (action === "zdr" && el instanceof HTMLInputElement) {
      this.#state = { ...this.#state, zdrEnabled: el.checked };
      this.#render();
      this.#emit("paper-ai-zdr-change", { enabled: el.checked });
    }
  };

  #onSubmit = (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !this.contains(form)) return;
    const kind = form.getAttribute("data-ai-form");
    if (!kind) return;
    event.preventDefault();
    const input = form.querySelector("input[name='apiKey']");
    const providerSelect = form.querySelector("select[name='providerId']");
    const apiKey = input instanceof HTMLInputElement ? input.value.trim() : "";
    if (!apiKey) return;
    const providerId =
      kind === "openrouter-key"
        ? "openrouter"
        : providerSelect instanceof HTMLSelectElement
          ? providerSelect.value
          : "auto";
    if (input instanceof HTMLInputElement) input.value = "";
    this.#emit("paper-ai-key-save", { providerId, apiKey });
  };

  #render() {
    const s = this.#state;
    const feats = this.features;
    const isSingle = this.mode === "single";
    const subs = Array.isArray(s.subscriptions) ? s.subscriptions : [];
    const connectedSubs = subs.filter((x) => x.authenticated);
    const or = s.openrouter || {};
    const locals = Array.isArray(s.localServers) ? s.localServers : [];
    const directKeys = Array.isArray(s.directKeys) ? s.directKeys : [];
    const readyExtras = locals.filter((l) => l.running).length + directKeys.filter((d) => d.configured).length;

    const dotCls =
      s.health === "ok"
        ? "pp-ai-dot--ok"
        : s.health === "warn"
          ? "pp-ai-dot--warn"
          : s.health === "err"
            ? "pp-ai-dot--err"
            : "";

    const switcherOptions = [
      { id: "auto", label: "Auto (Best connected)" },
      ...connectedSubs.map((x) => ({ id: x.id, label: `${x.name} Sub` })),
      ...(or.connected ? [{ id: "openrouter", label: "OpenRouter" }] : []),
      ...locals.filter((l) => l.running).map((l) => ({ id: l.id, label: l.name })),
      ...directKeys.filter((d) => d.configured).map((d) => ({ id: d.id, label: d.name })),
    ];

    const subRows = subs
      .map((sub) => {
        const active = isSingle && s.activeProviderId === sub.id;
        const waiting = this.#pendingSso.has(sub.id);
        const statusCls = sub.authenticated
          ? "pp-status pp-status--ok"
          : sub.needsReauth
            ? "pp-status pp-status--warn"
            : "pp-status";
        const statusLabel = sub.authenticated
          ? sub.planLabel
            ? `Connected · ${sub.planLabel}`
            : "Connected · Signed in"
          : sub.needsReauth
            ? "Expired"
            : sub.installed
              ? "Sign in"
              : "Install CLI";
        const btnHtml = waiting
          ? `<button type="button" class="pp-button pp-button--sm" aria-busy="true" disabled>Waiting for browser…</button>`
          : sub.authenticated
            ? `<button type="button" class="pp-button pp-button--ghost pp-button--sm" data-ai-action="signout" data-provider="${esc(sub.id)}">Sign out</button>`
            : sub.installed
              ? `<button type="button" class="pp-button pp-button--sm" data-ai-action="sso-start" data-provider="${esc(sub.id)}">${sub.needsReauth ? "Reconnect" : "Sign in →"}</button>`
              : `<button type="button" class="pp-button pp-button--ghost pp-button--sm" data-ai-action="toggle-install" data-provider="${esc(sub.id)}">Install…</button>`;
        const installDrawer =
          !sub.installed && this.#expandedInstall === sub.id && sub.installCmd
            ? `<div class="pp-ai-install-hint"><span>Run in Terminal: <code>${esc(sub.installCmd)}</code></span><button type="button" class="pp-button pp-button--sm" data-ai-action="copy-install" data-cmd="${esc(sub.installCmd)}">Copy</button></div>`
            : "";
        return `
          <div class="pp-ai-row${isSingle ? "" : " pp-ai-row--no-radio"}" data-active="${active ? "true" : "false"}">
            ${isSingle ? `<input class="pp-ai-row__radio" type="radio" name="pp-ai-primary" value="${esc(sub.id)}" data-ai-change="select-radio" ${active ? "checked" : ""} ${sub.authenticated ? "" : "disabled"} aria-label="Use ${esc(sub.name)} subscription" />` : ""}
            <span class="pp-ai-glyph">${GLYPHS[sub.glyph] || GLYPHS.claude}</span>
            <div class="pp-ai-row__body">
              <div class="pp-ai-row__line">
                <span class="pp-ai-row__name">${esc(sub.name)}</span>
                <span class="${statusCls}">${esc(statusLabel)}</span>
              </div>
              ${sub.detail ? `<span class="pp-ai-row__sub">${esc(sub.detail)}</span>` : ""}
            </div>
            <div class="pp-ai-row__controls">${btnHtml}</div>
          </div>${installDrawer}`;
      })
      .join("");

    const orStatusHtml = or.isProvisioningKey
      ? `<span class="pp-status pp-status--warn">Provisioning key</span>`
      : or.connected
        ? `<span class="pp-status pp-status--ok">${or.creditsRemainingUsd != null ? `${fmtUsd(or.creditsRemainingUsd)} credit` : "Connected"}</span>`
        : `<span class="pp-status">Not connected</span>`;

    const orActionsHtml = or.connected
      ? `${isSingle && s.activeProviderId !== "openrouter" ? `<button type="button" class="pp-button pp-button--sm" data-ai-action="select" data-provider="openrouter">Use</button>` : ""}<button type="button" class="pp-button pp-button--ghost pp-button--sm" data-ai-action="remove-key" data-provider="openrouter">Disconnect</button>`
      : or.oauthSupported !== false
        ? `<button type="button" class="pp-button pp-button--primary pp-button--sm" data-ai-action="openrouter-oauth">Sign in with OpenRouter →</button>`
        : "";

    const presetHtml = feats.has("presets")
      ? `
        <hr class="pp-ai-divider" />
        <div class="pp-ai-setting">
          <div class="pp-ai-setting__label">
            <span class="pp-ai-setting__title">Smart Model Preset</span>
            <span class="pp-ai-preset-meta">
              ${s.resolvedScreening || s.resolvedSynthesis ? `Screening <code>${esc(s.resolvedScreening || "auto")}</code> · Deep <code>${esc(s.resolvedSynthesis || "auto")}</code>` : "Auto-selects best fast and frontier models from live catalog"}
            </span>
          </div>
          <div class="pp-segmented" role="radiogroup" aria-label="Smart Model Preset">
            ${["balanced", "max_depth", "low_cost"]
              .map((p) => {
                const label = p === "balanced" ? "Balanced" : p === "max_depth" ? "Max Depth" : "Low Cost";
                const pressed = s.preset === p;
                return `<button type="button" class="pp-segmented__item" data-ai-action="preset" data-preset="${p}" aria-pressed="${pressed ? "true" : "false"}">${label}</button>`;
              })
              .join("")}
          </div>
        </div>`
      : "";

    const zdrHtml = feats.has("zdr")
      ? `
        <hr class="pp-ai-divider" />
        <label class="pp-ai-setting">
          <span class="pp-ai-setting__label">
            <span class="pp-ai-setting__title">${GLYPHS.lock} Zero Data Retention (ZDR)</span>
            <span class="pp-ai-setting__desc">Enforce ZDR-certified endpoints only (zdr: true · data_collection: deny)</span>
          </span>
          <input class="pp-switch" type="checkbox" role="switch" data-ai-change="zdr" ${s.zdrEnabled ? "checked" : ""} />
        </label>`
      : "";

    const extrasHtml =
      feats.has("local") || feats.has("direct-keys")
        ? `
      <details class="pp-ai-disclosure">
        <summary>
          <span>Direct API Keys &amp; Local Offline (Ollama / LM Studio)</span>
          <span class="pp-badge">${readyExtras > 0 ? `${readyExtras} ready` : "Optional"}</span>
        </summary>
        <div class="pp-ai-disclosure__body">
          ${
            feats.has("local") && locals.length > 0
              ? `<div class="pp-ai-section">
                  <div class="pp-ai-section__head"><h4 class="pp-ai-section__title">Local Offline · $0 Private</h4></div>
                  <div class="pp-ai-list">
                    ${locals
                      .map(
                        (loc) => `
                      <div class="pp-ai-row pp-ai-row--no-radio" data-active="${isSingle && s.activeProviderId === loc.id ? "true" : "false"}">
                        <span class="pp-ai-glyph">${GLYPHS.lock}</span>
                        <div class="pp-ai-row__body">
                          <div class="pp-ai-row__line">
                            <span class="pp-ai-row__name">${esc(loc.name)}</span>
                            <span class="pp-status${loc.running ? " pp-status--ok" : ""}">${loc.running ? `${loc.modelCount ?? 0} models` : "Not running"}</span>
                          </div>
                          <span class="pp-ai-row__sub">${esc(loc.baseUrl || "")}</span>
                        </div>
                        <div class="pp-ai-row__controls">
                          ${loc.running && isSingle ? `<button type="button" class="pp-button pp-button--sm" data-ai-action="select" data-provider="${esc(loc.id)}">Use</button>` : ""}
                        </div>
                      </div>`,
                      )
                      .join("")}
                  </div>
                </div>`
              : ""
          }
          ${
            feats.has("direct-keys")
              ? `<div class="pp-ai-section">
                  <div class="pp-ai-section__head"><h4 class="pp-ai-section__title">Direct API Keys · macOS Keychain</h4></div>
                  <form class="pp-ai-key-form" data-ai-form="direct-key">
                    <select class="pp-select pp-select--sm" name="providerId" aria-label="Direct API Provider">
                      <option value="anthropic">Anthropic</option>
                      <option value="openai">OpenAI</option>
                      <option value="gemini">Google Gemini</option>
                      <option value="xai">xAI Grok</option>
                      <option value="perplexity">Perplexity</option>
                      <option value="huggingface">Hugging Face</option>
                    </select>
                    <input class="pp-input pp-input--sm pp-ai-key-input" type="password" name="apiKey" placeholder="Paste API key…" autocomplete="off" />
                    <button type="submit" class="pp-button pp-button--sm">Save Key</button>
                  </form>
                  ${
                    directKeys.length > 0
                      ? `<div class="pp-ai-direct-chips">
                          ${directKeys
                            .filter((d) => d.configured)
                            .map(
                              (d) => `<span class="pp-status pp-status--ok">${esc(d.name)} <button type="button" class="pp-button pp-button--ghost pp-button--sm" data-ai-action="remove-key" data-provider="${esc(d.id)}" aria-label="Remove ${esc(d.name)} key">×</button></span>`,
                            )
                            .join("")}
                        </div>`
                      : ""
                  }
                </div>`
              : ""
          }
        </div>
      </details>`
        : "";

    this.innerHTML = `
      <div class="pp-ai-strip">
        <div class="pp-ai-strip__info">
          <span class="pp-ai-dot ${dotCls}" aria-hidden="true"></span>
          <div class="pp-ai-strip__text">
            <span class="pp-ai-strip__title">${esc(s.activeLabel)}</span>
            <span class="pp-ai-strip__meta">${esc(s.activeMeta)}${s.hubConnected ? " · Synced across apps" : ""}</span>
          </div>
        </div>
        <div class="pp-ai-strip__actions">
          ${feats.has("zdr") ? `<span class="pp-badge${s.zdrEnabled ? " pp-badge--accent" : ""}">${GLYPHS.lock} ${s.zdrEnabled ? "ZDR On" : "ZDR Off"}</span>` : ""}
          ${
            isSingle
              ? `<select class="pp-select pp-select--sm" data-ai-change="select-dropdown" aria-label="Active AI Connection">
                  ${switcherOptions.map((o) => `<option value="${esc(o.id)}" ${s.activeProviderId === o.id ? "selected" : ""}>${esc(o.label)}</option>`).join("")}
                </select>`
              : `<button type="button" class="pp-button pp-button--sm" data-ai-action="test">Test all</button>`
          }
          <button type="button" class="pp-button pp-button--ghost pp-button--sm" data-ai-action="refresh" ${this.#busy ? 'aria-busy="true"' : ""}>Recheck</button>
        </div>
      </div>

      <section class="pp-ai-section" aria-label="Subscriptions">
        <div class="pp-ai-section__head">
          <h3 class="pp-ai-section__title">Subscriptions · $0 API Spend</h3>
          <span class="pp-ai-preset-meta">${connectedSubs.length}/${subs.length} signed in</span>
        </div>
        <div class="pp-ai-list">${subRows}</div>
      </section>

      <section class="pp-ai-section" aria-label="Unified API OpenRouter">
        <div class="pp-ai-section__head">
          <h3 class="pp-ai-section__title">Unified API · OpenRouter</h3>
          <span class="pp-badge pp-badge--accent">Recommended</span>
        </div>
        <div class="pp-ai-card" data-active="${isSingle && s.activeProviderId === "openrouter" ? "true" : "false"}">
          <div class="pp-ai-card__hero">
            <div class="pp-ai-card__id">
              <span class="pp-ai-glyph">${GLYPHS.openrouter}</span>
              <div class="pp-ai-row__body">
                <div class="pp-ai-row__line">
                  <span class="pp-ai-row__name">OpenRouter</span>
                  ${orStatusHtml}
                </div>
                <span class="pp-ai-row__sub">One connection for 300+ frontier models · Browser SSO (OAuth PKCE)</span>
              </div>
            </div>
            <div class="pp-ai-row__controls">${orActionsHtml}</div>
          </div>
          ${
            or.isProvisioningKey
              ? `<div class="pp-ai-warn">
                  <span>Management/Provisioning key detected — cannot run inference directly.</span>
                  <button type="button" class="pp-button pp-button--sm" data-ai-action="openrouter-oauth">Connect with Browser SSO →</button>
                </div>`
              : ""
          }
          <details>
            <summary class="pp-ai-setting__desc" style="cursor:pointer">Paste API key manually</summary>
            <form class="pp-ai-key-form" data-ai-form="openrouter-key">
              <input class="pp-input pp-input--sm pp-ai-key-input" type="password" name="apiKey" placeholder="Paste OpenRouter Inference key…" autocomplete="off" />
              <button type="submit" class="pp-button pp-button--sm">Save to Keychain</button>
            </form>
          </details>
          ${zdrHtml}
          ${presetHtml}
          <div class="pp-ai-slot-anchor" data-ai-anchor="after-presets"></div>
        </div>
      </section>

      ${extrasHtml}
    `;

    // Re-attach preserved host extension slot nodes
    for (const node of this.#slotNodes) {
      const target = node.getAttribute("data-ai-slot") || "after-presets";
      const anchor = this.querySelector(`[data-ai-anchor="${target}"]`);
      if (anchor) anchor.appendChild(node);
    }
  }
}

let pillCounter = 0;

class PaperAiPill extends HTMLElement {
  #state = defaultState();
  #popId = `pp-ai-pop-${++pillCounter}`;

  static get observedAttributes() {
    return ["mode", "features", "endpoint"];
  }

  get state() {
    return this.#state;
  }

  set state(next) {
    if (!next || typeof next !== "object") return;
    this.#state = { ...defaultState(), ...next };
    this.#render();
  }

  connectedCallback() {
    this.addEventListener("click", this.#onClick);
    this.#render();
    const ep = this.getAttribute("endpoint");
    if (ep) void this.refreshFromEndpoint();
  }

  disconnectedCallback() {
    this.removeEventListener("click", this.#onClick);
  }

  async refreshFromEndpoint() {
    const ep = this.getAttribute("endpoint");
    if (!ep) return;
    try {
      const res = await fetch(ep, { credentials: "same-origin" });
      if (res.ok) {
        const data = await res.json();
        if (data && typeof data === "object") {
          this.#state = { ...defaultState(), ...data };
          this.#render();
        }
      }
    } catch {
      // ignore transient error
    }
  }

  #onClick = (event) => {
    const btn = event.target instanceof Element ? event.target.closest("[data-pill-action]") : null;
    if (!btn || !this.contains(btn)) return;
    const action = btn.getAttribute("data-pill-action");
    const pop = this.querySelector(`#${this.#popId}`);
    if (action === "select") {
      const providerId = btn.getAttribute("data-provider") || "auto";
      this.#state = { ...this.#state, activeProviderId: providerId };
      this.#render();
      this.dispatchEvent(new CustomEvent("paper-ai-select", { bubbles: true, detail: { providerId } }));
      if (pop && typeof pop.hidePopover === "function") pop.hidePopover();
    } else if (action === "open-preferences") {
      if (pop && typeof pop.hidePopover === "function") pop.hidePopover();
      this.dispatchEvent(new CustomEvent("paper-ai-open-preferences", { bubbles: true, detail: {} }));
    }
  };

  #render() {
    const s = this.#state;
    const dotCls =
      s.health === "ok"
        ? "pp-ai-dot--ok"
        : s.health === "warn"
          ? "pp-ai-dot--warn"
          : s.health === "err"
            ? "pp-ai-dot--err"
            : "";
    const subs = Array.isArray(s.subscriptions) ? s.subscriptions : [];
    const connectedSubs = subs.filter((x) => x.authenticated);
    const or = s.openrouter || {};
    const shortLabel = s.pillLabel || s.activeLabel || "Connect AI";

    const items = [
      ...connectedSubs.map((x) => ({
        id: x.id,
        label: `${x.name} Sub`,
        meta: "$0 · Ready",
      })),
      ...(or.connected
        ? [{ id: "openrouter", label: "OpenRouter", meta: or.creditsRemainingUsd != null ? fmtUsd(or.creditsRemainingUsd) : "Ready" }]
        : []),
      ...(Array.isArray(s.localServers) ? s.localServers.filter((l) => l.running) : []).map((l) => ({
        id: l.id,
        label: l.name,
        meta: `${l.modelCount ?? 0} models`,
      })),
    ];

    this.innerHTML = `
      <button type="button" class="pp-ai-pill-btn" popovertarget="${this.#popId}" aria-haspopup="menu">
        <span class="pp-ai-dot ${dotCls}" aria-hidden="true"></span>
        <span>${esc(shortLabel)}</span>
        ${s.zdrEnabled ? GLYPHS.lock : ""}
      </button>
      <div id="${this.#popId}" class="pp-popover pp-ai-popover" popover data-align="end">
        <div class="pp-ai-popover__head">
          <span>AI Connection</span>
          <span class="pp-badge${s.zdrEnabled ? " pp-badge--accent" : ""}">${s.zdrEnabled ? "ZDR On" : "ZDR Off"}</span>
        </div>
        <div class="pp-ai-popover__list">
          ${
            items.length > 0
              ? items
                  .map(
                    (item) => `
                  <button type="button" class="pp-ai-popover__item" data-pill-action="select" data-provider="${esc(item.id)}" data-active="${s.activeProviderId === item.id ? "true" : "false"}">
                    <span>${s.activeProviderId === item.id ? "✓ " : ""}${esc(item.label)}</span>
                    <span>${esc(item.meta)}</span>
                  </button>`,
                  )
                  .join("")
              : `<div class="pp-ai-popover__item"><span>No AI connected yet</span></div>`
          }
        </div>
        <div class="pp-ai-popover__foot">
          <span>${s.hubConnected ? "Synced hub" : "Local"}</span>
          <button type="button" class="pp-button pp-button--ghost pp-button--sm" data-pill-action="open-preferences">Preferences… →</button>
        </div>
      </div>
    `;
  }
}

if (!customElements.get("paper-ai-connections")) {
  customElements.define("paper-ai-connections", PaperAiConnections);
}
if (!customElements.get("paper-ai-pill")) {
  customElements.define("paper-ai-pill", PaperAiPill);
}

export { PaperAiConnections, PaperAiPill };
