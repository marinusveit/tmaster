# Architektur

## Tech-Stack

| Bereich | Technologie | Warum |
|---------|-------------|-------|
| App-Framework | **Electron** | Bewährt (VS Code, Hyper, Tabby), Chromium überall konsistent, riesiges Ökosystem |
| Sprache | **TypeScript** (durchgehend) | Eine Sprache für Backend + Frontend, beste AI-Codegen-Ergebnisse |
| Frontend | **React** | Schnell zu entwickeln, AI-Agents kennen es perfekt |
| Terminal | **xterm.js** + **@xterm/addon-webgl** | Standard für Web-Terminals, GPU-beschleunigt |
| PTY | **node-pty** | Battle-tested, 1:1 PTY-Prozess pro Terminal |
| State | **Zustand** | Minimal, kein Boilerplate, AI-freundlich (vs. Redux) |
| DB | **better-sqlite3** | Synchron = schneller bei lokaler SSD, kein Promise-Overhead |
| Build | **Vite** | Schnelles HMR, ES-Module-nativ |
| File Watching | **chokidar** | Standard für FS-Events, eine Singleton-Instanz |

### Warum dieser Stack (AI-Codegen Perspektive)
- TypeScript durchgehend = kein Sprachwechsel im Prompt, weniger AI-Fehler
- Electron hat massiv Trainingsdaten (VS Code, Slack, Discord, Hyper)
- Zustand statt Redux = weniger Boilerplate = weniger Token-Verbrauch = bessere AI-Ergebnisse
- Vite = schnelle Feedback-Loops bei iterativer AI-Entwicklung

### Verworfene Alternativen

| Framework | Verwerfungsgrund |
|-----------|-----------------|
| **Tauri** | Rust-Backend = Sprachwechsel, Borrow-Checker-Kämpfe für AI-Agents, WebKitGTK auf Linux inkonsistent für xterm.js |
| **NW.js** | Single-Process-Modell (DOM + Node im selben Kontext) erhöht Risiko für UI-Stalls bei hoher PTY-Last; für diesen Use-Case weniger erprobte Referenzen als Electron |
| **Neutralinojs** | Keine native Node-Module (node-pty nicht nutzbar) |
| **Web-App** | Kein nativer PTY-Zugang, separater Server nötig |

---

## Systemübersicht

```
┌──────────────────────────────────────────────────────────────┐
│                     tmaster App (Electron)                   │
│                                                              │
│  ┌─ Projekt A ─┬─ Projekt B ──┬─ + ───────────────────────┐  │
│  │                                                        │  │
│  ├─ SIDEBAR ──────────┬── TERMINAL AREA ──────────────────┤  │
│  │                    │                                   │  │
│  │  Terminal-Liste    │  Tabs: [T1] [T2] [T3] [T4]        │  │
│  │  T1 🟢 claude      │  ┌────────────────────────────┐   │  │
│  │  T2 🟡 codex       │  │                            │   │  │
│  │  T3 🔵 pnpm dev    │  │  Aktives Terminal (xterm)  │   │  │
│  │  T4 ⚫ git         │  │                            │   │  │
│  │  ...               │  │  Fullsize oder Split       │   │  │
│  │                    │  │                            │   │  │
│  │  💬 AI Assistant   │  │                            │   │  │
│  │  (togglebar)       │  └────────────────────────────┘   │  │
│  │                    │                                   │  │
│  └────────────────────┴───────────────────────────────────┘  │
│                                                              │
│  ── Status Bar ───────────────────────────────────────────── │
│  ⚡ 4 active │ 1 waiting │ 0 errors │ Plan-Budget: 45%        │
└──────────────────────────────────────────────────────────────┘
```

---

## Prozess-Architektur (Electron)

```
┌─────────────────────────────────────────┐
│ MAIN PROCESS (Node.js)                  │
│                                         │
│  Terminal Manager                       │
│  ├─ PTY Pool (node-pty, max 25)         │
│  ├─ Lifecycle Management                │
│  ├─ 16ms Output Batching ──────────┐    │
│  │                                 │    │
│  Event Extractor (regelbasiert)    │    │
│  ├─ Pattern Matching auf Output    │    │
│  ├─ Error/Warning/Status Events    │    │
│  └─ Secret Filter                  │    │
│                                    │    │
│  Kontext-Broker                    │    │
│  ├─ Event-Aggregation              │    │
│  ├─ Konflikt-Erkennung (chokidar)  │    │
│  └─ SQLite (better-sqlite3 + WAL)  │    │
│                                    │    │
│  IPC Bridge ◄──────────────────────┘    │
└──────────────┬──────────────────────────┘
               │ Electron IPC (batched, async only)
┌──────────────▼──────────────────────────┐
│ RENDERER PROCESS (Chromium)             │
│                                         │
│  React App                              │
│  ├─ Workspace Tabs                      │
│  ├─ Sidebar (Terminal-Liste + AI Chat)  │
│  ├─ Terminal Area (xterm.js + WebGL)    │
│  └─ Status Bar                          │
│                                         │
│  Zustand Stores                         │
│  ├─ terminalStore (Status, Sessions)    │
│  ├─ workspaceStore (Projekte, Layout)   │
│  └─ assistantStore (Chat, Vorschläge)   │
│                                         │
│  Transport Layer (Abstraktion)          │
│  └─ IPC Adapter (lokal)                 │
│     └─ [SPÄTER] WebSocket Adapter       │
└─────────────────────────────────────────┘
```

---

## Kritische Architektur-Patterns

### 1. IPC-Batching (16ms) ⚠️ KRITISCH

**Problem:** 25 PTYs emittieren tausende Chunks/Sekunde. Jedes einzeln per IPC senden → Event-Queue-Überlastung → UI friert ein.

**Lösung:** Main Process puffert Output pro PTY, sendet gebündelt alle 16ms (= 60fps Takt).

```typescript
// Main Process - Terminal Manager
class TerminalManager {
  private buffers: Map<string, string> = new Map();
  
  constructor() {
    // 16ms = synchron mit 60Hz Monitor-Refresh
    setInterval(() => this.flushBuffers(), 16);
  }
  
  private onPtyData(terminalId: string, data: string) {
    const existing = this.buffers.get(terminalId) ?? '';
    this.buffers.set(terminalId, existing + data);
  }
  
  private flushBuffers() {
    for (const [id, data] of this.buffers) {
      if (data.length > 0) {
        webContents.send('terminal:data', { id, data });
        this.buffers.set(id, '');
      }
    }
  }
}
```

**Regeln:**
- ❌ NIEMALS `ipcRenderer.sendSync()` verwenden
- ❌ NIEMALS `@electron/remote` verwenden
- ✅ Immer async IPC + Batching

### 2. PTY Lifecycle Management ⚠️ KRITISCH

**Problem:** Tab schließen / Workspace wechseln ohne PTY zu killen → Zombie-Prozesse → Speicherleck (50-100MB pro PTY).

**Lösung:** Zentraler Manager der an alle Lifecycle-Events gebunden ist.

```typescript
class TerminalManager {
  private sessions: Map<string, { pty: IPty; metadata: SessionMeta }>;
  
  // Wird aufgerufen bei: Tab close, Workspace switch, App quit
  async destroySession(id: string) {
    const session = this.sessions.get(id);
    if (session) {
      session.pty.kill();           // PTY-Prozess explizit beenden
      this.sessions.delete(id);     // Referenz entfernen
      await this.db.markEnded(id);  // In DB loggen
    }
  }
  
  // App-Shutdown: ALLE PTYs aufräumen
  destroyAll() {
    for (const [id] of this.sessions) {
      this.destroySession(id);
    }
  }
}

// Electron lifecycle hooks
app.on('before-quit', () => terminalManager.destroyAll());
mainWindow.on('closed', () => terminalManager.destroyAll());
```

### 3. Native Module Rebuilding ⚠️ KRITISCH

**Problem:** node-pty ist C++ (kein reines JS). Electron hat eigene V8/ABI-Version → `npm install` kompiliert gegen System-Node → Electron-Start crasht mit `NODE_MODULE_VERSION`-Error.

**Lösung:** `@electron/rebuild` in Build-Pipeline einbinden (`electron-rebuild` ist der CLI-Befehl).

```json
// package.json
{
  "scripts": {
    "postinstall": "electron-rebuild",
    "rebuild": "electron-rebuild -f -w node-pty"
  }
}
```

```bash
pnpm add -D @electron/rebuild
```

### 4. SQLite WAL-Modus ⚠️ WICHTIG

**Problem:** 25 Terminals schreiben Events + AI-Assistent liest gleichzeitig → Database Lock.

**Lösung:** Write-Ahead Logging aktivieren.

```typescript
import Database from 'better-sqlite3';

const db = new Database('tmaster.db');
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');  // Schneller, sicher genug für lokale DB
```

**Warum better-sqlite3 statt node-sqlite3:**
- Synchron = kein Promise-Overhead bei Micro-Queries
- Auf lokaler SSD: synchrone Queries sind signifikant schneller als async, da kein Event-Loop-Overhead
- Bei 25 Terminals die hochfrequent Events loggen: spürbarer Performance-Unterschied

### 5. Transport Abstraction Layer

**Problem:** Renderer direkt an `ipcRenderer` koppeln → nicht testbar, nicht remote-fähig.

**Lösung:** Abstraktes Interface, IPC ist nur ein Adapter.

```typescript
// Shared types
interface TransportLayer {
  send(channel: string, data: unknown): void;
  on(channel: string, handler: (data: unknown) => void): void;
  off(channel: string, handler: (data: unknown) => void): void;
}

// Implementierung 1: Electron IPC (MVP)
class ElectronTransport implements TransportLayer { ... }

// Implementierung 2: WebSocket (SPÄTER - Remote-Zugriff)
class WebSocketTransport implements TransportLayer { ... }
```

---

## Rendering-Architektur für 25 Terminals

### MVP-Strategie: Lazy WebGL

Im MVP zeigen wir maximal 1-4 Terminals gleichzeitig an. WebGL-Kontexte werden nur für **sichtbare** Terminals erstellt.

```
Sichtbar (WebGL aktiv):     T1, T3       → 2 WebGL-Kontexte
Tabs (kein WebGL):          T2, T4-T25   → 0 WebGL-Kontexte, Daten im Buffer
Tab-Wechsel:                T2 wird sichtbar → WebGL erstellen
                            T1 wird Tab → WebGL destroyen
```

Chromium setzt Limits für aktive WebGL-Kontexte (historisch oft ~16 auf Desktop, ~8 auf Mobile; abhängig von Plattform/GPU/Version). Mit Lazy-Strategie brauchen wir im MVP max 4 sichtbare Kontexte.

### [SPÄTER] Shared WebGL Canvas (wenn nötig)

Falls wir irgendwann deutlich mehr Terminals gleichzeitig *sichtbar* darstellen müssen, gibt es eine fortgeschrittene Lösung:

Ein einziges `<canvas>` im Hintergrund mit einem WebGL-Kontext. Terminals werden per `gl.scissor()` und `gl.viewport()` in Bereiche des Canvas gerendert. DOM-Platzhalter (`<div>`) definieren die Position, `getBoundingClientRect()` mappt Koordinaten.

**Status: Nicht für MVP geplant.** Lazy WebGL reicht für 1-4 sichtbare Terminals.

### Frame-Skipping (von VS Code gelernt)

Bei massivem Output (z.B. großer git diff) rendert xterm.js nicht jeden Frame bei 60fps, sondern überspringt visuelle Updates um den PTY-Parser am Laufen zu halten. Das verhindert UI-Freezes.

```typescript
// xterm.js konfiguration
import { WebglAddon } from '@xterm/addon-webgl';

const terminal = new Terminal({
  scrollback: 5000,        // Nicht zu hoch → RAM
});

// WebGL als Addon laden (nicht via rendererType!)
terminal.open(container);
const webglAddon = new WebglAddon();
webglAddon.onContextLoss(() => {
  webglAddon.dispose();     // Graceful fallback auf Canvas
});
terminal.loadAddon(webglAddon);
```

Hinweis: `fastScrollModifier` wurde in xterm.js 6 entfernt.

---

## Event-Extraktor (regelbasiert, kein LLM)

Komprimiert Terminal-Output zu strukturierten Events im Main Process:

```typescript
interface TerminalEvent {
  terminalId: string;
  timestamp: number;
  type: 'error' | 'warning' | 'completed' | 'waiting' | 'file_changed' | 
        'test_result' | 'server_started' | 'server_stopped' | 'context_warning';
  summary: string;         // Kompakt, max 200 chars
  details?: string;        // Für Deep-Dive
  source: 'pattern' | 'exit_code' | 'hook';
}

// Pattern-Matching (Regex, kein LLM)
const patterns = [
  { regex: /error|Error|ERROR/, type: 'error' },
  { regex: /warning|Warning|WARN/, type: 'warning' },
  { regex: /FAIL.*\d+ tests?/, type: 'test_result' },
  { regex: /listening on port (\d+)/, type: 'server_started' },
  { regex: /context window.*(\d+)%/, type: 'context_warning' },
  { regex: /waiting for input|⏳/, type: 'waiting' },
  // ...erweiterbar
];
```

Events werden in SQLite gespeichert und dem AI-Assistenten als kompakter Kontext bereitgestellt.

---

## Kontext-Broker

Das Killer-Feature: sammelt Wissen aus allen Terminals und reichert neue Prompts an.

### Flow

```
Terminal Output → Event-Extraktor → Events in SQLite
                                         │
                                         ▼
User: "Codex soll Login bauen" → AI-Assistent fragt Kontext-Broker
                                         │
                                         ▼
                                  Broker aggregiert:
                                  - T3 hat 2 failing Auth-Tests
                                  - T1 hat auth.ts kürzlich geändert
                                  - T5 Dev-Server gibt 500 auf /auth
                                         │
                                         ▼
                                  Angereicherter Prompt:
                                  "Implementiere Login. Beachte:
                                   - 2 Tests failen in auth-route-guard
                                   - auth.ts wurde kürzlich geändert
                                   - /auth Endpoint gibt 500 zurück"
```

### Konflikt-Erkennung

```
chokidar (Singleton im Main Process)
    │
    ▼
Datei geändert: src/auth.ts
    │
    ▼
Broker checkt: Welcher Terminal hat zuletzt auth.ts geschrieben?
    → T1 (claude) hat auth.ts vor 30s geändert
    → T2 (codex) will gleich auth.ts ändern (Intent aus Prompt)
    │
    ▼
⚠️ Warnung in UI:
"T1 und T2 arbeiten an auth.ts – Merge-Konflikt möglich"
[⏸ T2 pausieren] [⚠️ Trotzdem] [📝 Task ändern]
```

**Wichtig:** Intent-basiertes Locking (Agent registriert Dateien bevor er sie ändert) funktioniert nur bedingt, da Claude Code und Codex keine API dafür haben. Realistischer Ansatz: **Reaktive Erkennung via chokidar** (nachträglich warnen) statt präventives Locking.

### MCP-Integration

Das Model Context Protocol (MCP) ermöglicht es Coding-Agents, direkt den Kontext-Broker abzufragen. **Sowohl Claude Code als auch Codex CLI unterstützen MCP bereits als Clients (Anbindung an MCP-Server).**

```
// tmaster als lokaler MCP-Server
Tools:
  get_terminal_errors(terminalId?) → aktuelle Errors
  get_workspace_state(projectId) → Status aller Terminals
  get_file_conflicts() → aktuelle Konflikte
  get_recent_changes(file) → wer hat was wann geändert
```

**Status: Machbar und bestätigt.** Claude Code unterstützt MCP-Server via `claude mcp add`. Codex CLI unterstützt MCP-Server via Konfiguration (`~/.codex/config.toml`). tmaster kann als lokaler MCP-Server agieren, den beide Agents nutzen.

### [UNTERSUCHEN] RAG über Terminal-History

Mit `sqlite-vec` (Vektor-Erweiterung für SQLite) könnte man semantisch über vergangene Terminal-Sessions suchen:
- "Wie haben wir letzte Woche den Auth-Bug gefixt?"
- Findet relevante Events/Outputs aus der History

**Status: Cool aber definitiv nicht MVP.** Braucht Embedding-Model (lokal oder Cloud).

---

## Datenbank-Schema (SQLite)

```sql
-- WAL-Modus aktivieren!
-- PRAGMA journal_mode = WAL;
-- PRAGMA synchronous = NORMAL;

CREATE TABLE workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    path TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    agent_type TEXT NOT NULL,       -- 'claude', 'codex', 'devserver', 'generic'
    label TEXT,                      -- User-sichtbarer Name
    status TEXT NOT NULL DEFAULT 'idle',
    started_at TEXT NOT NULL,
    ended_at TEXT,
    last_activity TEXT NOT NULL
);

CREATE TABLE session_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES sessions(id),
    timestamp TEXT DEFAULT (datetime('now')),
    event_type TEXT NOT NULL,
    summary TEXT NOT NULL,
    details TEXT
);

CREATE TABLE file_locks (
    file_path TEXT NOT NULL,
    session_id TEXT NOT NULL REFERENCES sessions(id),
    locked_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (file_path, session_id)
);

CREATE TABLE daily_stats (
    date TEXT NOT NULL,
    workspace_id TEXT,
    total_sessions INTEGER DEFAULT 0,
    total_duration_min REAL DEFAULT 0,
    idle_time_min REAL DEFAULT 0,
    PRIMARY KEY (date, workspace_id)
);

-- Indizes für häufige Queries
CREATE INDEX idx_events_session ON session_events(session_id, timestamp);
CREATE INDEX idx_events_type ON session_events(event_type);
CREATE INDEX idx_sessions_workspace ON sessions(workspace_id, status);
```

---

## Kommunikation (IPC Channels)

```typescript
// Main → Renderer
'terminal:data'         // Gebatchter PTY-Output (16ms)
'terminal:status'       // Status-Änderung (active/idle/finished)
'terminal:event'        // Extrahiertes Event (error/warning/etc.)
'workspace:notification' // Cross-Workspace Alert
'broker:conflict'       // Datei-Konflikt erkannt
'assistant:message'     // AI-Assistent Antwort/Vorschlag

// Renderer → Main
'terminal:spawn'        // Neues Terminal + PTY starten
'terminal:input'        // User-Input an PTY senden
'terminal:kill'         // Terminal beenden
'terminal:resize'       // Terminal-Größe ändern
'workspace:switch'      // Workspace wechseln
'assistant:ask'         // User-Message an AI-Assistenten
```

---

## RAM-Budget (geschätzt)

```
Electron Base:              ~150 MB
25 AI-Agent-Prozesse:       ~1.250-2.500 MB (50-100 MB pro Agent*)
xterm.js (4 sichtbar):     ~80 MB
React UI + Zustand:         ~30 MB
SQLite + WAL:               ~20 MB
────────────────────────────────────
Total:                      ~1.5-2.8 GB

* Die 50-100 MB sind für die AI-Agents (Claude Code, Codex CLI)
  die IN den PTYs laufen, nicht für die PTY-Prozesse selbst.
  Ein nackter PTY-Prozess verbraucht deutlich weniger.
  Tatsächliche Werte müssen im Betrieb gemessen werden.

→ Für Entwickler-Maschine mit 16-32 GB RAM: akzeptabel
→ Hauptfaktor: die Coding-Agents selbst, nicht tmaster
```

---

## Verifizierte Annahmen (Stand: 2026-02-27)

- xterm.js WebGL-Rendering läuft über `@xterm/addon-webgl` (nicht über `rendererType`).
- xterm.js 6 entfernt `fastScrollModifier`.
- Für Electron-Native-Module wird `@electron/rebuild` verwendet.
- `node-pty` nutzt native Bindings und erfordert bei Electron-Versionen ggf. Rebuilds.
- `ipcRenderer.sendSync()` blockiert den Renderer und sollte vermieden werden.
- Claude Code und Codex CLI können MCP-Server anbinden.
- WebGL-Kontext-Limits in Chromium sind implementationsabhängig; feste Zahlen sind nur Richtwerte.

Hypothesen, die im Projekt gemessen werden müssen:
- 16ms IPC-Batching vs. alternative Flush-Strategien.
- better-sqlite3 vs. async sqlite in genau diesem Event-Logging-Workload.
- RAM-Budget pro Agent-Typ unter realen Sessions.

---

## Offene Architektur-Fragen

1. `[OFFEN]` Output in Session-Logs persistieren oder nur Events?
2. `[OFFEN]` Sub-Agents (Kontext-Broker): eigene Claude-Sessions oder rein regelbasiert im MVP?
3. `[OFFEN]` Wie erkennen wir "waiting for input" zuverlässig bei verschiedenen Agents?
4. `[BESTÄTIGT]` MCP-Integration: Claude Code und Codex CLI unterstützen MCP bereits
5. `[UNTERSUCHEN]` RAG über Terminal-History mit sqlite-vec
6. `[SPÄTER]` Shared WebGL Canvas für >16 sichtbare Terminals (Chromium-Limit variiert je nach Version/Plattform, ~16 auf Desktop üblich)
7. `[SPÄTER]` WebSocket Transport für Remote-Zugriff
8. `[SPÄTER]` MessagePorts statt globalem IPC für dedizierte Terminal-Channels
