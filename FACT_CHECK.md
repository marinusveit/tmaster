# Fact Check (Stand: 2026-02-27)

Dieses Dokument hält verifizierte externe Annahmen fest, damit Architektur-Entscheidungen nicht auf veralteten Aussagen basieren.

## Verifiziert

1. xterm.js WebGL wird über Addons eingebunden (`@xterm/addon-webgl`).
   Quelle: https://github.com/xtermjs/xterm.js/tree/master/addons/addon-webgl

2. xterm.js 6 hat `fastScrollModifier` entfernt.
   Quelle: https://github.com/xtermjs/xterm.js/releases/tag/6.0.0

3. Für Electron-Native-Module ist `@electron/rebuild` das aktuelle Paket.
   Quelle: https://github.com/electron/rebuild

4. `node-pty` nutzt native Bindings; Electron-Targets können Rebuilds brauchen.
   Quelle: https://www.npmjs.com/package/node-pty

5. `ipcRenderer.sendSync()` blockiert den Renderer.
   Quelle: https://www.electronjs.org/docs/latest/api/ipc-renderer

6. Claude Code kann MCP-Server anbinden.
   Quelle: https://docs.anthropic.com/en/docs/claude-code/mcp

7. OpenAI-Tools unterstützen MCP-Server-Anbindung.
   Quelle: https://platform.openai.com/docs/guides/tools-remote-mcp

8. Chromium-WebGL-Kontext-Limits sind implementationabhängig (historisch oft ~16 Desktop/~8 Mobile).
   Quelle: https://groups.google.com/a/chromium.org/g/graphics-dev/c/fmNedEEAYpA

## Nicht verifiziert (muss gemessen werden)

1. 16ms IPC-Batching ist der beste Default für alle Workloads.
2. better-sqlite3 ist in diesem konkreten Event-Muster signifikant schneller als Alternativen.
3. RAM-Budget pro Agent-Typ bei 5/10/25 aktiven Sessions.
