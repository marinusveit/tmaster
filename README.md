# tmaster

> AI-gesteuerter Terminal-Orchestrator für Entwickler die mit mehreren Coding-Agents arbeiten.

**Status:** Konzeptphase – Architektur steht, Roadmap definiert, Code-Start steht bevor.

## Problem

Du hast 5-25 Terminals offen mit Claude Code, Codex, Gemini CLI und Dev-Servern. Du verlierst den Überblick:
- Welche Session ist fertig?
- Welche wartet auf Input?
- Wo läuft noch ein Dev-Server?
- Welche Session frisst nur noch Context ohne Mehrwert?
- Zwei Agents bearbeiten dieselbe Datei → Merge-Konflikt

## Vision

Ein AI-Co-Pilot der **über** deinen Terminals sitzt – nicht darin. Du und der Assistent managen die Terminals gemeinsam: Er beobachtet, schlägt vor, coached, und handelt wenn du es erlaubst. Du behältst die Kontrolle.

**In einem Satz:** *Ein Scrum Master für deine AI-Coding-Agents.*

## Tech-Stack

| Bereich | Technologie |
|---------|-------------|
| App | Electron |
| Sprache | TypeScript (durchgehend) |
| Frontend | React + Zustand |
| Terminal | xterm.js + WebGL + node-pty |
| DB | SQLite (better-sqlite3) |
| Build | Vite |

Gewählt für maximale AI-Codegen-Qualität: alles TypeScript, massiv Trainingsdaten, battle-tested.

## Docs

| Dokument | Inhalt |
|----------|--------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Systemarchitektur, Tech-Stack, Patterns |
| [FEATURES.md](./FEATURES.md) | Feature-Liste mit Prio |
| [GUI.md](./GUI.md) | Layout-Konzept |
| [ROADMAP.md](./ROADMAP.md) | Phasen-Plan mit Zeitschätzungen |
| [SECURITY.md](./SECURITY.md) | Trust-Modell, Secret-Filtering |
| [METRICS.md](./METRICS.md) | Erfolgs-Metriken |
| [FACT_CHECK.md](./FACT_CHECK.md) | Verifizierte externe Annahmen + Quellen |

## Roadmap (Kurzfassung)

| Phase | Dauer | Ergebnis |
|-------|-------|----------|
| 1: Foundation | ~1-2 Wo | 1 Terminal funktioniert |
| 2: Multi-Terminal | ~1-2 Wo | **5 Terminals**, produktiv nutzbar |
| 3: Intelligence | ~2-3 Wo | **10 Terminals** + AI-Assistent |
| 4: Scale | ~1-2 Wo | **20+ Terminals** stabil |
| 5: Polish | ~2+ Wo | Daily Driver |
