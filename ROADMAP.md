# Roadmap

> Grober Plan: von "Hello World" bis 20+ Terminals. Zeitschätzungen = AI-Agent-Entwicklung (Claude Code + Codex), nicht manuell.

## Übersicht

```
Phase 1: Foundation     ██████████  ~1-2 Wochen   → 1 Terminal funktioniert ✅
Phase 2: Multi-Terminal ██████████  ~1-2 Wochen   → 5 Terminals ✅
Phase 3: Intelligence   ░░░░░░░░░░  ~2-3 Wochen   → 10 Terminals + AI
Phase 4: Scale          ░░░░░░░░░░  ~1-2 Wochen   → 20+ Terminals
Phase 5: Polish         ░░░░░░░░░░  ~2+ Wochen    → Daily Driver
```

**Gesamt: ~7-11 Wochen** bis tmaster dein Ghostty ersetzt.
Aber: Du kannst ab Phase 2 schon produktiv damit arbeiten!

---

## Phase 1: Foundation (~1-2 Wochen)
> **Ziel:** Electron-App die ein einzelnes Terminal anzeigt.

### Tasks
- [x] Electron + Vite + React + TypeScript Boilerplate
- [x] xterm.js + WebGL-Renderer einbinden
- [x] node-pty Integration (PTY spawnen + Output darstellen)
- [x] `@electron/rebuild` für native Module
- [x] Ein Terminal: Shell starten, Input/Output funktioniert
- [x] Basis-Layout: Sidebar (leer) + Terminal Area
- [x] Dark Theme (Basis)

### Ergebnis
```
┌─ tmaster ───────────────────────┐
│                                  │
│ [Sidebar]  │ Terminal (xterm.js) │
│  (leer)    │ $ _                 │
│            │                     │
└──────────────────────────────────┘
```
✅ Du kannst: 1 Terminal nutzen (wie ein schlechtes Ghostty 😄)

---

## Phase 2: Multi-Terminal (~1-2 Wochen)
> **Ziel:** 5 Terminals in Tabs, Workspace-Konzept.

### Tasks
- [x] Terminal-Tabs (erstellen, wechseln, schließen)
- [x] Sidebar: Terminal-Liste mit Status-Dots
- [x] PTY Lifecycle Management (kein Zombie-Leak)
- [x] 16ms IPC-Batching
- [x] Terminal-Resize handling
- [x] Workspace-Tabs (Projekt A / Projekt B)
- [x] Workspace-Einstellungen (Pfad, Name)
- [x] `Ctrl+Shift+T` neues Terminal, `Ctrl+Shift+W` schließen, `Ctrl+1-9` wechseln
- [x] SQLite Setup (better-sqlite3 + WAL)
- [x] Session-Tracking in DB (Start, Ende, Agent-Typ)

### Ergebnis
```
┌─[ KochMate ]─[ SVM ]────────────────────┐
│              │ [T1] [T2] [T3] [T4] [T5]  │
│ T1 🟢 claude│                             │
│ T2 🟡 codex │  Terminal T1                │
│ T3 🔵 dev   │  $ claude code              │
│ T4 ⚫ git   │  ...                        │
│ T5 🟢 claude│                             │
└──────────────────────────────────────────┘
```
✅ Du kannst: **5 Terminals** managen, zwischen Projekten wechseln
🎯 **Ab hier schon produktiv nutzbar!**

---

## Phase 3: Intelligence (~2-3 Wochen)
> **Ziel:** AI-Assistent, Event-Erkennung, Kontext-Broker. Das was tmaster besonders macht.

### Tasks
- [ ] Event-Extraktor: Pattern-Matching auf Terminal-Output
  - Error/Warning Erkennung
  - "Waiting for input" Erkennung
  - Test-Results Parsing
  - Context-Window Warnings
- [ ] Events in SQLite speichern
- [ ] Secret-Filter (Regex-basiert, vor AI-Analyse)
- [ ] AI-Assistent Chat in Sidebar
  - Regelbasierte Empfehlungen (idle, context voll, errors)
  - Vorschlagsliste mit Action-Buttons
- [ ] Kontext-Broker: Events aggregieren, Prompt-Anreicherung
- [ ] Prompt-Kollaboration: User beschreibt Intent → Assistent erstellt Prompt
- [ ] [🚀 Übernehmen] Button: Terminal öffnen + Agent starten + Prompt senden
- [ ] Konflikt-Erkennung via chokidar (gleiche Datei, mehrere Agents)
- [ ] Split-View (`Cmd+\`): 2 oder 4 Terminals gleichzeitig
- [ ] Desktop-Notifications (Terminal fertig/Error)
- [ ] Coaching-Stufen (Aus / Minimal / Normal / Coach)

### Ergebnis
```
┌─[ KochMate ]─[ SVM ]────────────────────┐
│              │ [T1] [T2] ... [T10]       │
│ T1 🟢 claude│                             │
│ ...          │  Terminal T1               │
│ T10 🔵 dev  │  $ claude code ...         │
│──────────────│                             │
│ 💬 ASSISTANT │                             │
│              │                             │
│ 🔴 T3 Error │                             │
│ [Fix] [Skip] │                             │
│              │                             │
│ T7 ctx 90%  │                             │
│ → new thread│                             │
└──────────────────────────────────────────┘
```
✅ Du kannst: **10 Terminals** mit AI-Unterstützung nutzen
✅ Kontext-angereicherte Prompts, Fehler-Erkennung, Coaching

---

## Phase 4: Scale (~1-2 Wochen)
> **Ziel:** 20+ Terminals stabil, Performance-Optimierung.

### Tasks
- [ ] Lazy WebGL: Nur sichtbare Terminals rendern, unsichtbare pausieren
- [ ] Frame-Skipping bei massivem Output
- [ ] Scrollback-Limit pro Terminal (RAM-Schutz)
- [ ] Quick-Switcher (`Cmd+K`) mit Fuzzy Search
- [ ] Abo-Usage-Tracking (Provider-Planbudget, heuristisch)
- [ ] Tages-Zusammenfassung im Dashboard
- [ ] Performance-Profiling und Optimierung
- [ ] Stress-Test: 25 Terminals gleichzeitig aktiv

### Ergebnis
✅ Du kannst: **20+ Terminals** flüssig nutzen
✅ Performance bleibt stabil auch bei Heavy Load

---

## Phase 5: Polish (~2+ Wochen, ongoing)
> **Ziel:** Daily Driver Qualität, nice-to-haves.

### Tasks
- [ ] Focus-Mode (1-2 Terminals, nur Criticals durchlassen)
- [ ] Terminal-Recycling ("Session beendet → neuer Task?")
- [ ] Workspace-Templates ("KochMate Dev" → definierte Terminals öffnen)
- [ ] LLM-basierte Empfehlungen (opt-in, Ollama oder Cloud)
- [ ] Git-Integration (Branch-Status pro Workspace)
- [ ] Theme-Customization
- [ ] Produktivitäts-Metriken & Wochen-Reports
- [ ] Export/Import von Workspace-Configs
- [ ] MCP-Hardening (Tool-Schema-Versionierung, Healthchecks, Fallbacks)
- [ ] [UNTERSUCHEN] RAG über Terminal-History

---

## Meilensteine

| Meilenstein | Wann (geschätzt) | Was du bekommst |
|-------------|-------------------|-----------------|
| 🏁 **Erstes Terminal** | Ende Woche 1 | App startet, Shell funktioniert |
| 🎯 **5 Terminals** | Ende Woche 3 | Tabs, Workspaces, produktiv nutzbar |
| 🧠 **10 + AI** | Ende Woche 6 | Kontext-Broker, Empfehlungen, Coaching |
| 🚀 **20+ stabil** | Ende Woche 8 | Skaliert, optimiert |
| 💎 **Daily Driver** | Woche 10+ | Ersetzt Ghostty als Haupt-Terminal |

## Hinweise

- **Zeitschätzungen** basieren auf AI-Agents (Claude Code + Codex) die den Code schreiben. Keine manuelle Entwicklung.
- **Parallelisierbar:** Du kannst z.B. einen Agent an Phase-2-Tasks und einen an Theme arbeiten lassen.
- **Iterativ:** Jede Phase ist sofort nutzbar – du musst nicht bis Phase 5 warten.
- **Abhängig von Abo-Limits:** Wie schnell die Agents arbeiten können hängt von den aktuellen Provider-Quotas ab.
