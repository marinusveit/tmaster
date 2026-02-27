# tmaster — Agent-Steuerungsdatei

AI-gesteuerter Terminal-Orchestrator für Entwickler die mit mehreren Coding-Agents arbeiten.
Ein Scrum Master für deine AI-Coding-Agents — beobachtet, schlägt vor, coached, handelt wenn erlaubt.

**Stack:** Electron · TypeScript (durchgehend) · React · Zustand · xterm.js + WebGL · node-pty · better-sqlite3 · Vite
**Prozess-Modell:** Main Process (Node.js: PTY, DB, Events, IPC) ↔ Renderer Process (Chromium: React UI, xterm.js)
**Ziel:** 5-25 gleichzeitige Terminals mit AI-Agents (Claude Code, Codex CLI, etc.)

Aktueller Stand: siehe [ROADMAP.md](./ROADMAP.md)

---

## HARTE REGELN

> Non-negotiable. Gelten ab dem ersten Commit. Bei Verstößen: sofort korrigieren.

### IPC

- NIEMALS `ipcRenderer.sendSync()` — immer async via `ipcMain.handle()` / `ipcRenderer.invoke()`
- NIEMALS `@electron/remote` verwenden
- PTY-Output wird über 16ms-Batching gesendet — nie einzelne Chunks direkt per IPC
- Channel-Namen folgen dem `domain:action` Schema, definiert in `shared/ipc-channels.ts`

### TypeScript

- Nur `.ts`/`.tsx` Dateien in `src/` — keine `.js`
- Kein `any` — stattdessen `unknown` + Type-Narrowing
- `strict: true` in tsconfig — keine Ausnahmen

### Prozess-Isolation

- Renderer hat keinen direkten Node.js-Zugang
- Kein `nodeIntegration: true`
- Kein `contextIsolation: false`
- SQLite (better-sqlite3) läuft ausschließlich im Main Process
- Alle Node-Zugriffe aus dem Renderer über Preload + IPC

### PTY-Lifecycle

- Jeder PTY wird bei Tab-Close, Workspace-Switch und App-Quit via `pty.kill()` beendet
- Kein PTY ohne Eintrag im TerminalManager
- `app.on('before-quit')` und `mainWindow.on('closed')` rufen `destroyAll()` auf
- Kein Zombie-Prozess — TerminalManager ist Single Source of Truth

### Security

- Terminal-Output ist IMMER untrusted — nie `eval()`, nie als Code interpretieren
- Secret-Filter läuft im Main Process BEVOR Output an AI-Analyse geht
- Kein `shell: true` in `child_process` außerhalb von node-pty
- Strikte System-Prompt-Trennung: Assistent-Kontext und Terminal-Output werden nie vermischt

### Native Module

- `electron-rebuild` (via `@electron/rebuild`) läuft nach jedem `pnpm install` (postinstall-Script)
- node-pty ist C++ — bei Electron-Updates immer rebuild prüfen

### State

- Frontend State nur über Zustand Stores — kein lokaler React State für shared/globale Daten
- SQLite im WAL-Modus: `PRAGMA journal_mode = WAL` und `PRAGMA synchronous = NORMAL`

### Workflow: Loop schließen

- Nach jeder Implementierung IMMER selbstständig testen: `pnpm typecheck`, `pnpm lint`, `pnpm test`
- Nicht nur bestehende Tests laufen lassen — aktiv prüfen ob neue Tests sinnvoll sind und diese schreiben
- Minimaler Test-Loop: Implementieren → Typecheck → Lint → Tests laufen lassen → Fehler fixen → erst dann fertig melden
- Kein Feature ohne mindestens einen Test, außer es handelt sich um reine UI-Verdrahtung
- Bei IPC-Handlern, PTY-Lifecycle und Secret-Filter sind Tests Pflicht

---

## Projektstruktur

```
src/
  main/                   # Electron Main Process
    terminal/             # TerminalManager, PTY-Lifecycle, 16ms-Batching
    events/               # EventExtractor, Pattern-Matching (Regex, kein LLM)
    broker/               # Kontext-Broker, Konflikt-Erkennung (chokidar)
    db/                   # better-sqlite3 Setup, Migrations, Queries
    ipc/                  # IPC-Handler (ipcMain.handle)
    security/             # SecretFilter
    index.ts              # Main-Entry, BrowserWindow, app-Lifecycle
  renderer/               # Renderer Process (React)
    components/           # Feature-gruppiert:
      sidebar/            #   Terminal-Liste, AI-Assistent
      terminal/           #   xterm.js Wrapper, Tabs
      workspace/          #   Workspace-Tabs, Layout
      statusbar/          #   Status Bar
      common/             #   Shared UI-Komponenten
    stores/               # Zustand Stores
      terminalStore.ts
      workspaceStore.ts
      assistantStore.ts
    transport/            # Transport-Abstraktion (IPC-Adapter)
    hooks/                # Custom React Hooks
    App.tsx
    main.tsx
  shared/                 # NUR Typen + Konstanten — keine Logik!
    types/
    constants/
    ipc-channels.ts       # Zentrale Channel-Definitionen
  preload/
    index.ts              # contextBridge.exposeInMainWorld()
```

**Import-Regeln:**
- `shared/` importiert nie aus `main/` oder `renderer/`
- IPC-Channels zentral in `shared/ipc-channels.ts` — nirgendwo sonst definieren
- Komponenten nach Feature gruppiert, nicht nach Typ (kein `buttons/`, `forms/`, etc.)
- Keine zirkulären Imports zwischen `main/`, `renderer/` und `shared/`

---

## Code-Konventionen

### Datei-Benennung

- Komponenten: `PascalCase.tsx` (z.B. `TerminalTabs.tsx`)
- Stores: `camelCaseStore.ts` (z.B. `terminalStore.ts`)
- Services/Utils: `camelCase.ts` (z.B. `secretFilter.ts`)
- Types: `PascalCase.ts` in `shared/types/` (z.B. `TerminalEvent.ts`)

### Namensgebung

- Kein `I`-Prefix für Interfaces — `TerminalSession`, nicht `ITerminalSession`
- `type` für Unions und Utility-Types, `interface` für erweiterbare Shapes
- Event-Handler: `on`-Prefix (z.B. `onTerminalClose`)
- Booleans: `is`/`has`/`should`-Prefix (z.B. `isActive`, `hasErrors`)
- Code-Bezeichner auf Englisch, Kommentare auf Deutsch

### Import-Ordnung

1. Node.js built-ins (nur in `main/`)
2. Externe Pakete
3. Shared types/constants (`@shared/`)
4. Lokale Imports

### Path Aliases

- `@main/*` → `src/main/*`
- `@renderer/*` → `src/renderer/*`
- `@shared/*` → `src/shared/*`
- `@preload/*` → `src/preload/*`

### Sonstiges

- Nur Named Exports — keine Default-Exports
- `import type` verwenden wenn nur Typen importiert werden
- Kein `console.log` in Production-Code — eigener Logger
- Kommentare auf Deutsch
- Code-Bezeichner (Variablen, Funktionen, Klassen) auf Englisch

---

## Architektur-Patterns

> Kurzregeln. Für Details und Code-Beispiele: [ARCHITECTURE.md](./ARCHITECTURE.md)

**16ms Batching:**
Buffer pro Terminal-ID im Main Process, `setInterval(flush, 16)`, nur non-empty Buffer flushen.
Verhindert Event-Queue-Überlastung bei 25 aktiven PTYs.

**Lazy WebGL:**
WebGL-Addon nur für sichtbare Terminals erstellen. Bei Tab-Wechsel: altes WebGL destroyen, neues erstellen.
`onContextLoss()` → Canvas-Fallback. `scrollback: 5000` (RAM-Schutz).

**Transport-Abstraktion:**
Renderer kommuniziert nie direkt via `ipcRenderer`. Stattdessen: `TransportLayer` Interface → `ElectronTransport` Implementierung.
Ermöglicht spätere WebSocket-Anbindung und einfaches Testing.

**Event-Extraktor:**
Regex-basiert im Main Process — kein LLM. Pipeline: PTY-Output → Secret-Filter → Event-Extraktor → SQLite.
Pattern-Matching für Errors, Warnings, Test-Results, Server-Events, Context-Warnings.

**Preload:**
Minimales `contextBridge.exposeInMainWorld()` API. Nur exponieren was der Renderer tatsächlich braucht.
Kein Durchreichen von Node.js APIs.

**Kontext-Broker:**
Aggregiert Events aus allen Terminals. Reichert Prompts mit Live-Kontext an (Errors, Warnings, Konflikte).
Konflikt-Erkennung via chokidar (reaktiv, nicht präventiv).

---

## Befehle

```bash
pnpm dev          # Electron + Vite Dev mit HMR
pnpm build        # Production Build
pnpm lint         # ESLint + tsc
pnpm typecheck    # tsc --noEmit
pnpm test         # Vitest
```

---

## Qualitäts-Anforderungen

- `tsc --noEmit` muss fehlerfrei durchlaufen (strict-Modus)
- Kein `any` im gesamten Codebase
- IPC-Handler validieren ihre Inputs
- React Props als explizite Interfaces definieren
- Keine zirkulären Imports zwischen `main/`, `renderer/`, `shared/`
- Secret-Filter braucht Tests für alle bekannten Patterns (API Keys, JWTs, Private Keys, Connection Strings)
- Jeder PTY-Lifecycle-Pfad (create, kill, destroyAll) muss getestet sein

---

## Referenz-Dokumente

| Frage | Dokument |
|-------|----------|
| Wie funktioniert IPC, Batching, PTY, DB? | [ARCHITECTURE.md](./ARCHITECTURE.md) |
| Welche Features sind MVP vs. später? | [FEATURES.md](./FEATURES.md) |
| Wie sieht die UI aus? | [GUI.md](./GUI.md) |
| Welche Phase kommt als nächstes? | [ROADMAP.md](./ROADMAP.md) |
| Trust-Modell, Secrets, Prompt-Injection? | [SECURITY.md](./SECURITY.md) |
| Metriken und Optimierung? | [METRICS.md](./METRICS.md) |

**Regel:** Lies das relevante Dokument bevor du ein Feature implementierst oder eine Architektur-Entscheidung triffst.
