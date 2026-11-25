import Cocoa
import WebKit

final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, WKUIDelegate, WKNavigationDelegate, WKScriptMessageHandler {
  private var window: NSWindow!
  private var webView: WKWebView!
  private var statusItem: NSStatusItem?
  private var serverProcess: Process?
  private var watchdogTimer: Timer?
  private var appearanceObservation: NSKeyValueObservation?
  private var isSpawningServer = false
  private var isEnteringFullScreen = false

  private let port = 3852
  private lazy var projectDir: String = Self.resolveProjectDir()
  private let pageZoomDefaultsKey = "mount-charter.pageZoom"
  private let launchToken: String = UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased()

  private static func resolveProjectDir() -> String {
    let fm = FileManager.default
    var candidates: [URL] = []
    if let envDir = ProcessInfo.processInfo.environment["MOUNT_CHARTER_PROJECT_DIR"], !envDir.isEmpty {
      candidates.append(URL(fileURLWithPath: envDir))
    }
    candidates.append(Bundle.main.bundleURL.deletingLastPathComponent())
    candidates.append(URL(fileURLWithPath: fm.currentDirectoryPath))
    candidates.append(
      fm.homeDirectoryForCurrentUser
        .appendingPathComponent("Documents")
        .appendingPathComponent("GitHub")
        .appendingPathComponent("mount-charter-isms-compliance")
    )
    for dir in candidates {
      if fm.fileExists(atPath: dir.appendingPathComponent("dist/index.cjs").path) ||
         fm.fileExists(atPath: dir.appendingPathComponent("package.json").path) {
        return dir.path
      }
    }
    return fm.homeDirectoryForCurrentUser
      .appendingPathComponent("Documents/GitHub/mount-charter-isms-compliance").path
  }

  func applicationDidFinishLaunching(_ notification: Notification) {
    setupMenus()
    setupWindow()
    buildStatusItem()
    ensureServerAndLoad()
    startServerWatchdog()
  }

  func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
    openMainWindow()
    return true
  }

  func applicationWillTerminate(_ notification: Notification) {
    watchdogTimer?.invalidate()
    watchdogTimer = nil
    if let proc = serverProcess, proc.isRunning {
      proc.terminate()
    }
  }

  private func setupMenus() {
    let mainMenu = NSMenu()

    let appMenuItem = NSMenuItem()
    mainMenu.addItem(appMenuItem)
    let appMenu = NSMenu()
    appMenu.addItem(withTitle: "About Mount Charter", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
    appMenu.addItem(NSMenuItem.separator())
    appMenu.addItem(withTitle: "Preferences…", action: #selector(menuSettings), keyEquivalent: ",")
    appMenu.addItem(withTitle: "Quick Jump…", action: #selector(menuPalette), keyEquivalent: "k")
    appMenu.addItem(NSMenuItem.separator())
    appMenu.addItem(withTitle: "Reload UI", action: #selector(reloadWebView), keyEquivalent: "r")
    appMenu.addItem(withTitle: "Reveal Data Folder in Finder", action: #selector(revealDataFolder), keyEquivalent: "o")
    appMenu.addItem(NSMenuItem.separator())
    appMenu.addItem(withTitle: "Quit Mount Charter", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
    appMenuItem.submenu = appMenu

    let editMenuItem = NSMenuItem()
    mainMenu.addItem(editMenuItem)
    let editMenu = NSMenu(title: "Edit")
    editMenu.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
    editMenu.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "Z")
    editMenu.addItem(NSMenuItem.separator())
    editMenu.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
    editMenu.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
    editMenu.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
    editMenu.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
    editMenuItem.submenu = editMenu

    let viewMenuItem = NSMenuItem()
    mainMenu.addItem(viewMenuItem)
    let viewMenu = NSMenu(title: "View")
    viewMenu.addItem(withTitle: "Overview", action: #selector(menuOverview), keyEquivalent: "1")
    viewMenu.addItem(withTitle: "Controls", action: #selector(menuControls), keyEquivalent: "2")
    viewMenu.addItem(withTitle: "Frameworks", action: #selector(menuFrameworks), keyEquivalent: "3")
    viewMenu.addItem(withTitle: "Evidence Library", action: #selector(menuEvidence), keyEquivalent: "4")
    viewMenu.addItem(withTitle: "Audit & SoA", action: #selector(menuAudit), keyEquivalent: "5")
    viewMenu.addItem(NSMenuItem.separator())
    viewMenu.addItem(withTitle: "Back", action: #selector(menuBack), keyEquivalent: "[")
    viewMenu.addItem(withTitle: "Forward", action: #selector(menuForward), keyEquivalent: "]")
    viewMenu.addItem(NSMenuItem.separator())
    viewMenu.addItem(withTitle: "Actual Size", action: #selector(menuZoomReset), keyEquivalent: "0")
    viewMenu.addItem(withTitle: "Zoom In", action: #selector(menuZoomIn), keyEquivalent: "=")
    viewMenu.addItem(withTitle: "Zoom Out", action: #selector(menuZoomOut), keyEquivalent: "-")
    viewMenuItem.submenu = viewMenu

    let windowMenuItem = NSMenuItem()
    mainMenu.addItem(windowMenuItem)
    let windowMenu = NSMenu(title: "Window")
    windowMenu.addItem(withTitle: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
    windowMenu.addItem(withTitle: "Close Window", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
    windowMenuItem.submenu = windowMenu

    NSApp.mainMenu = mainMenu
  }

  private func paperColor(_ hex: UInt32) -> NSColor {
    let c = PaperTokens.components(hex)
    return NSColor(srgbRed: c.red, green: c.green, blue: c.blue, alpha: 1)
  }

  private func paintWindowAppearance() {
    guard let window = window else { return }
    let isDark = window.effectiveAppearance.bestMatch(from: [.aqua, .darkAqua]) == .darkAqua
    window.backgroundColor = paperColor(isDark ? PaperTokens.Dark.topbar : PaperTokens.Light.topbar)
    if let webView = webView {
      webView.underPageBackgroundColor = paperColor(isDark ? PaperTokens.Dark.bg : PaperTokens.Light.bg)
    }
  }

  private func applyPaperMode(_ mode: String) {
    switch mode {
    case "light":
      window.appearance = NSAppearance(named: .aqua)
    case "dark":
      window.appearance = NSAppearance(named: .darkAqua)
    default:
      window.appearance = nil
    }
    paintWindowAppearance()
  }

  private func syncUnifiedToolbarForWindowState() {
    guard let window = window else { return }
    if isEnteringFullScreen || window.styleMask.contains(.fullScreen) {
      if window.toolbar != nil { window.toolbar = nil }
    } else {
      if window.toolbar == nil {
        window.toolbar = NSToolbar(identifier: "MountCharterUnifiedToolbar")
      }
      window.toolbarStyle = .unifiedCompact
      window.titlebarAppearsTransparent = true
      window.titleVisibility = .hidden
    }
  }

  private func currentTitlebarLeading() -> Int {
    guard let window = window, !isEnteringFullScreen, !window.styleMask.contains(.fullScreen) else { return 0 }
    let zoomMaxX = window.standardWindowButton(.zoomButton)?.frame.maxX ?? 72
    return max(72, Int(ceil(zoomMaxX)))
  }

  private func buildBootScriptSource(leading: Int) -> String {
    """
    window.__mountCharterNativeShell = true;
    document.documentElement.style.setProperty('--paper-titlebar-leading', '\(leading)px');
    document.documentElement.style.setProperty('--paper-titlebar-inset', '0px');
    (() => {
      try {
        var savedMode = localStorage.getItem('mount-charter.mode');
        if (savedMode !== 'light' && savedMode !== 'dark' && savedMode !== 'system') {
          savedMode = 'light';
        }
        window.webkit?.messageHandlers?.paperMode?.postMessage(savedMode);
        new MutationObserver(() => {
          var m = document.documentElement.getAttribute('data-mode') || 'light';
          window.webkit?.messageHandlers?.paperMode?.postMessage(m);
        }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-mode'] });
      } catch (e) {}
    })();
    (() => {
      if (window.__mwWindowDragInstalled) return;
      window.__mwWindowDragInstalled = true;
      const skip = 'button,a,input,select,textarea,label,summary,[role="button"],[role="tab"],[role="menuitem"],[role="option"],[role="switch"],paper-theme-switch,[data-no-window-drag]';
      const bar = '#main-topbar';
      window.addEventListener('mousedown', (e) => {
        if (e.button !== 0 || !(e.target instanceof Element)) return;
        if (!e.target.closest(bar) || e.target.closest(skip)) return;
        const sx = e.screenX, sy = e.screenY;
        const move = (m) => {
          if (Math.hypot(m.screenX - sx, m.screenY - sy) >= 3) {
            cleanup();
            window.webkit?.messageHandlers?.paperWindowDrag?.postMessage('drag');
          }
        };
        const cleanup = () => {
          window.removeEventListener('mousemove', move, true);
          window.removeEventListener('mouseup', cleanup, true);
        };
        window.addEventListener('mousemove', move, true);
        window.addEventListener('mouseup', cleanup, true);
      }, true);
    })();
    """
  }

  private func setupWindow() {
    let rect = NSRect(x: 0, y: 0, width: 1320, height: 860)
    window = NSWindow(
      contentRect: rect,
      styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
      backing: .buffered,
      defer: false
    )
    window.title = "Mount Charter"
    window.minSize = NSSize(width: 820, height: 560)
    window.delegate = self
    window.center()
    window.setFrameAutosaveName("MountCharterMainWindow")
    window.appearance = NSAppearance(named: .aqua)
    syncUnifiedToolbarForWindowState()

    let config = WKWebViewConfiguration()
    config.preferences.tabFocusesLinks = true
    let ucc = config.userContentController
    ucc.add(self, name: "paperMode")
    ucc.add(self, name: "paperWindowDrag")
    ucc.add(self, name: "mountCharterExport")
    ucc.add(self, name: "mountCharterRevealDataDir")
    let bootScript = WKUserScript(
      source: buildBootScriptSource(leading: currentTitlebarLeading()),
      injectionTime: .atDocumentStart,
      forMainFrameOnly: true
    )
    ucc.addUserScript(bootScript)

    webView = WKWebView(frame: window.contentView!.bounds, configuration: config)
    webView.autoresizingMask = [.width, .height]
    webView.uiDelegate = self
    webView.navigationDelegate = self
    window.contentView?.addSubview(webView)

    let savedZoom = UserDefaults.standard.double(forKey: pageZoomDefaultsKey)
    if savedZoom >= 0.5 && savedZoom <= 2.5 {
      webView.pageZoom = CGFloat(savedZoom)
    }

    appearanceObservation = window.observe(\.effectiveAppearance, options: [.initial, .new]) { [weak self] _, _ in
      DispatchQueue.main.async { self?.paintWindowAppearance() }
    }
    paintWindowAppearance()
    window.makeKeyAndOrderFront(nil)
    NSApp.activate(ignoringOtherApps: true)
  }

  private func buildStatusItem() {
    let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
    if let imgPath = Bundle.main.path(forResource: "StatusGlyph", ofType: "png"),
       let img = NSImage(contentsOfFile: imgPath) {
      img.isTemplate = true
      img.size = NSSize(width: 18, height: 18)
      item.button?.image = img
    } else {
      item.button?.title = "M"
    }
    let menu = NSMenu()
    menu.addItem(withTitle: "Open Mount Charter", action: #selector(openMainWindow), keyEquivalent: "")
    menu.addItem(withTitle: "Reveal Data Folder", action: #selector(revealDataFolder), keyEquivalent: "")
    menu.addItem(NSMenuItem.separator())
    menu.addItem(withTitle: "Quit Mount Charter", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
    item.menu = menu
    statusItem = item
  }

  // MARK: - Server lifecycle

  private func resolveNodeExecutable() -> String {
    let candidates = [
      "/opt/homebrew/bin/node",
      "/usr/local/bin/node",
      "/usr/bin/node",
    ]
    for path in candidates where FileManager.default.isExecutableFile(atPath: path) {
      return path
    }
    return "/usr/bin/env"
  }

  private func checkServerHealth(completion: @escaping (Bool) -> Void) {
    guard let url = URL(string: "http://127.0.0.1:\(port)/api/health") else {
      completion(false)
      return
    }
    var req = URLRequest(url: url)
    req.timeoutInterval = 1.5
    URLSession.shared.dataTask(with: req) { data, resp, _ in
      let ok = (resp as? HTTPURLResponse)?.statusCode == 200 && data != nil
      DispatchQueue.main.async { completion(ok) }
    }.resume()
  }

  private func spawnServerIfNeeded() {
    guard !isSpawningServer else { return }
    if let proc = serverProcess, proc.isRunning { return }
    isSpawningServer = true

    let proc = Process()
    let nodeBin = resolveNodeExecutable()
    let entryPath = URL(fileURLWithPath: projectDir).appendingPathComponent("dist/index.cjs").path
    if nodeBin == "/usr/bin/env" {
      proc.executableURL = URL(fileURLWithPath: "/usr/bin/env")
      proc.arguments = ["node", entryPath]
    } else {
      proc.executableURL = URL(fileURLWithPath: nodeBin)
      proc.arguments = [entryPath]
    }
    proc.currentDirectoryURL = URL(fileURLWithPath: projectDir)

    var env = ProcessInfo.processInfo.environment
    env["NODE_ENV"] = "production"
    env["MOUNT_CHARTER_PORT"] = String(port)
    env["MOUNT_CHARTER_LAUNCH_TOKEN"] = launchToken
    env["PATH"] = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
    proc.environment = env

    proc.terminationHandler = { [weak self] _ in
      DispatchQueue.main.async {
        self?.serverProcess = nil
        self?.isSpawningServer = false
      }
    }

    do {
      try proc.run()
      serverProcess = proc
    } catch {
      NSLog("[Mount Charter] failed to spawn server: \(error)")
    }
    isSpawningServer = false
  }

  private func ensureServerAndLoad(attempt: Int = 0) {
    checkServerHealth { [weak self] healthy in
      guard let self = self else { return }
      if healthy {
        if let url = URL(string: "http://127.0.0.1:\(self.port)/") {
          self.webView.load(URLRequest(url: url))
        }
        return
      }
      if attempt == 0 {
        self.spawnServerIfNeeded()
      }
      if attempt < 40 {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
          self.ensureServerAndLoad(attempt: attempt + 1)
        }
      } else {
        let html = """
        <!doctype html><html><body style="font-family:-apple-system,sans-serif;padding:40px;color:#222;background:#f7f7f5;">
        <h2>Mount Charter local engine did not start</h2>
        <p>Could not connect to <code>http://127.0.0.1:\(self.port)</code>. Press <strong>⌘R</strong> to retry or check Console logs.</p>
        </body></html>
        """
        self.webView.loadHTMLString(html, baseURL: nil)
      }
    }
  }

  private func startServerWatchdog() {
    watchdogTimer = Timer.scheduledTimer(withTimeInterval: 5.0, repeats: true) { [weak self] _ in
      self?.checkServerHealth { healthy in
        if !healthy {
          self?.spawnServerIfNeeded()
        }
      }
    }
  }

  // MARK: - Window & WebKit Delegates

  func windowWillEnterFullScreen(_ notification: Notification) {
    isEnteringFullScreen = true
    syncUnifiedToolbarForWindowState()
    updateLeadingVar()
  }

  func windowDidExitFullScreen(_ notification: Notification) {
    isEnteringFullScreen = false
    syncUnifiedToolbarForWindowState()
    updateLeadingVar()
  }

  private func updateLeadingVar() {
    let leading = currentTitlebarLeading()
    webView?.evaluateJavaScript(
      "document.documentElement.style.setProperty('--paper-titlebar-leading', '\(leading)px');",
      completionHandler: nil
    )
  }

  func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
    guard let url = navigationAction.request.url else {
      decisionHandler(.allow)
      return
    }
    if url.host == "127.0.0.1" || url.host == "localhost" {
      decisionHandler(.allow)
      return
    }
    if url.scheme == "http" || url.scheme == "https" {
      NSWorkspace.shared.open(url)
      decisionHandler(.cancel)
      return
    }
    decisionHandler(.cancel)
  }

  func webView(
    _ webView: WKWebView,
    createWebViewWith configuration: WKWebViewConfiguration,
    for navigationAction: WKNavigationAction,
    windowFeatures: WKWindowFeatures
  ) -> WKWebView? {
    if let url = navigationAction.request.url {
      if url.host == "127.0.0.1" || url.host == "localhost" {
        webView.load(navigationAction.request)
      } else if url.scheme == "http" || url.scheme == "https" {
        NSWorkspace.shared.open(url)
      }
    }
    return nil
  }

  func webView(
    _ webView: WKWebView,
    runJavaScriptAlertPanelWithMessage message: String,
    initiatedByFrame frame: WKFrameInfo,
    completionHandler: @escaping () -> Void
  ) {
    let alert = NSAlert()
    alert.messageText = "Mount Charter"
    alert.informativeText = message
    alert.addButton(withTitle: "OK")
    alert.beginSheetModal(for: window) { _ in
      completionHandler()
    }
  }

  func webView(
    _ webView: WKWebView,
    runJavaScriptConfirmPanelWithMessage message: String,
    initiatedByFrame frame: WKFrameInfo,
    completionHandler: @escaping (Bool) -> Void
  ) {
    let alert = NSAlert()
    alert.messageText = "Confirm Action"
    alert.informativeText = message
    alert.addButton(withTitle: "Confirm")
    alert.addButton(withTitle: "Cancel")
    alert.beginSheetModal(for: window) { response in
      completionHandler(response == .alertFirstButtonReturn)
    }
  }

  func webView(
    _ webView: WKWebView,
    runOpenPanelWith parameters: WKOpenPanelParameters,
    initiatedByFrame frame: WKFrameInfo,
    completionHandler: @escaping ([URL]?) -> Void
  ) {
    let panel = NSOpenPanel()
    panel.canChooseFiles = true
    panel.canChooseDirectories = false
    panel.allowsMultipleSelection = parameters.allowsMultipleSelection
    panel.beginSheetModal(for: window) { response in
      completionHandler(response == .OK ? panel.urls : nil)
    }
  }

  private func resolveExportCallback(_ requestId: String?, payloadJson: String) {
    guard let id = requestId, !id.isEmpty else { return }
    let safeId = id.replacingOccurrences(of: "'", with: "")
    webView?.evaluateJavaScript(
      "window.__mwExportResolve && window.__mwExportResolve('\(safeId)', \(payloadJson));",
      completionHandler: nil
    )
  }

  func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
    // Only trust messages originating from our loopback engine
    let host = message.frameInfo.securityOrigin.host
    guard host == "127.0.0.1" || host == "localhost" else { return }

    switch message.name {
    case "paperMode":
      if let mode = message.body as? String {
        applyPaperMode(mode)
      }
    case "paperWindowDrag":
      if let event = NSApp.currentEvent {
        window.performDrag(with: event)
      }
    case "mountCharterRevealDataDir":
      revealDataFolder()
    case "mountCharterExport":
      guard let dict = message.body as? [String: Any],
            let filename = dict["filename"] as? String,
            let b64 = dict["base64"] as? String,
            let data = Data(base64Encoded: b64) else { return }
      let requestId = dict["requestId"] as? String
      let panel = NSSavePanel()
      panel.nameFieldStringValue = filename
      let exportsDir = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent("Documents/Mount Charter/exports")
      try? FileManager.default.createDirectory(at: exportsDir, withIntermediateDirectories: true)
      panel.directoryURL = exportsDir
      panel.beginSheetModal(for: window) { [weak self] response in
        guard response == .OK, let dest = panel.url else {
          self?.resolveExportCallback(requestId, payloadJson: "{ cancelled: true }")
          return
        }
        do {
          try data.write(to: dest, options: .atomic)
          self?.resolveExportCallback(requestId, payloadJson: "{ ok: true }")
        } catch {
          let escaped = error.localizedDescription
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "\"", with: "\\\"")
          self?.resolveExportCallback(requestId, payloadJson: "{ error: \"\(escaped)\" }")
        }
      }
    default:
      break
    }
  }

  // MARK: - Actions

  @objc private func openMainWindow() {
    window.makeKeyAndOrderFront(nil)
    NSApp.activate(ignoringOtherApps: true)
  }

  @objc private func reloadWebView() {
    ensureServerAndLoad()
  }

  @objc private func revealDataFolder() {
    let dir: URL
    if let envDir = ProcessInfo.processInfo.environment["MOUNT_CHARTER_DATA_DIR"], !envDir.isEmpty {
      dir = URL(fileURLWithPath: envDir)
    } else {
      dir = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent("Library/Application Support/Mount Charter")
    }
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    NSWorkspace.shared.activateFileViewerSelecting([dir])
  }

  private func dispatchNavigate(_ path: String) {
    openMainWindow()
    webView.evaluateJavaScript(
      "window.dispatchEvent(new CustomEvent('mount-charter:navigate', { detail: '\(path)' }));",
      completionHandler: nil
    )
  }

  @objc private func menuOverview() { dispatchNavigate("/") }
  @objc private func menuControls() { dispatchNavigate("/controls") }
  @objc private func menuFrameworks() { dispatchNavigate("/frameworks") }
  @objc private func menuEvidence() { dispatchNavigate("/evidence") }
  @objc private func menuAudit() { dispatchNavigate("/audit") }
  @objc private func menuSettings() { dispatchNavigate("/settings") }
  @objc private func menuBack() { webView?.goBack() }
  @objc private func menuForward() { webView?.goForward() }
  @objc private func menuPalette() {
    openMainWindow()
    webView.evaluateJavaScript("window.dispatchEvent(new Event('mount-charter:palette'));", completionHandler: nil)
  }

  @objc private func menuZoomIn() {
    let next = PaperTokens.Zoom.stepped(Double(webView.pageZoom), steps: 1)
    webView.pageZoom = CGFloat(next)
    UserDefaults.standard.set(next, forKey: pageZoomDefaultsKey)
  }

  @objc private func menuZoomOut() {
    let next = PaperTokens.Zoom.stepped(Double(webView.pageZoom), steps: -1)
    webView.pageZoom = CGFloat(next)
    UserDefaults.standard.set(next, forKey: pageZoomDefaultsKey)
  }

  @objc private func menuZoomReset() {
    webView.pageZoom = 1.0
    UserDefaults.standard.set(1.0, forKey: pageZoomDefaultsKey)
  }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
