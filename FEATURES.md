# Features

> Prio-Vorschlag von Clawd. `[OFFEN]` = braucht deine Entscheidung. Nichts ist final.

## Legende
- 🔴 MVP
- 🟡 V1.1
- 🟢 Später
- `[OFFEN]` Müssen wir besprechen

---

## 1. Projekt-Workspaces

### 1.1 Workspace-Tabs
- Projekte als Reiter oben – wie Desktop-Arbeitsbereiche
- Tab wechseln = alle Terminals wechseln
- Agent behält Überblick über ALLE Workspaces (auch unsichtbare)
- Cross-Workspace Notifications: "T3 in KochMate ist fertig" auch wenn du in SV Miesbach bist
- 🔴 MVP

### 1.2 Workspace-Einstellungen
- Pfad zum Projekt-Root
- Default Agent-Typ
- Layout-Preset pro Workspace
- 🔴 MVP

### 1.3 Workspace-Templates
- "KochMate Dev" → öffnet automatisch vordefinierte Terminals
- `[OFFEN]` MVP oder V1.1?

---

## 2. Terminal-Management

### 2.1 Terminal-Benennung & Status
- Jedes Terminal hat ID: T1, T2, T3... (Agent und User sprechen gleiche Sprache)
- Status-Erkennung: 🟢 Aktiv | 🟡 Wartet | 🔴 Idle | 🔵 Dev-Server | ⚫ Fertig
- 🔴 MVP

### 2.2 Slot-Ownership
- **🤖 Agent-managed**: Agent entscheidet welches Terminal angezeigt wird
  - Empfehlung angeklickt → dieses Terminal rückt in den Fokus
  - Automatisch das relevanteste Terminal
- **🔒 User-locked**: Nur User entscheidet, Agent darf nicht wechseln
- **🔓 Shared**: Agent schlägt vor, wechselt nur mit Quick-Confirm
- User konfiguriert welcher Slot welche Ownership hat
- 🔴 MVP

### 2.3 Layout-Konfiguration
- User bestimmt: Anzahl sichtbare Terminals, Anordnung (top/bottom, left/right, grid)
- Presets wählbar, pro Workspace speicherbar
- Agent arbeitet innerhalb der Regeln (managed nur seine Slots)
- 🔴 MVP

### 2.4 Notifications
- Desktop-Notification wenn Agent fertig / Error / wartet
- In-App Badge + optional Sound
- Cross-Workspace: "T3 in anderem Workspace hat Error"
- 🔴 MVP

### 2.5 Terminal-Recycling
- Beendete Session → "Neuen Task starten oder schließen?"
- Quick-Action: Gleichen Agent im gleichen Projekt neu starten
- 🟡 V1.1

---

## 3. AI-Assistent (Co-Manager)

### 3.1 Chat-Interface
- Linke Seite: Chat mit dem Assistenten
- Kann Terminal-Status sehen und darauf reagieren
- User gibt Intents: "Claude soll Feature X bauen"
- 🔴 MVP

### 3.2 Vorschlagsliste
- Priorisierte Liste von Empfehlungen
- Jeder Vorschlag hat Action-Buttons
- Klick auf Vorschlag → betroffenes Terminal rückt in Agent-managed Slot
- Agent priorisiert automatisch (Errors > Idle > Info)
- 🔴 MVP

### 3.3 Proaktive Empfehlungen
- Regelbasiert (kein LLM nötig):
  - "T3 idle seit 15min – beenden?"
  - "T1 Context bei 85% – neuer Thread?"
  - "Dev-Server seit 2h ohne Request"
- LLM-basiert (opt-in):
  - Pattern-Erkennung, Workflow-Tipps
- 🔴 MVP (regelbasiert), 🟡 V1.1 (LLM)

### 3.4 Terminal-Steuerung durch Assistent
- Assistent kann Terminals öffnen (mit Berechtigung)
- Kann Agent darin starten (claude, codex, npm etc.)
- Kann Prompts vorbereiten und senden
- Berechtigungslogik:
  - 🟢 Immer erlaubt: Status checken, Empfehlung zeigen, Fokus wechseln
  - 🟡 Quick-Confirm: Terminal öffnen, Agent starten, Prompt senden
  - 🔴 Explizit: Unbekannte Commands, Git-Operationen
  - Wenn nichts schiefgehen kann → Agent darf alleine
- 🔴 MVP

### 3.5 Prompt-Kollaboration mit Kontext-Anreicherung
- User beschreibt was er will im Chat
- Assistent erstellt Prompt-Entwurf, angereichert mit:
  - Projekt-Kontext (TASKS.md, ARCHITECTURE.md etc.)
  - **Live-Kontext aus anderen Terminals** (Errors, Warnings, Test-Failures, laufende Änderungen)
  - Konflikt-Warnungen ("T1 arbeitet an gleicher Datei")
- User kann bearbeiten (inline edit) oder verfeinern (Chat)
- **[🚀 Übernehmen]** Button → Terminal öffnen + Agent starten + Prompt senden
- **Kein Coding-Agent arbeitet mehr blind** – alle bekommen Kontext aus dem Gesamtsystem
- 🔴 MVP

### 3.6 Kontext-Broker
- Chef-Agent sammelt Wissen aus allen Terminals via Sub-Agents
- Erkennt und leitet weiter:
  - Build Errors → "Fix diesen Error mit"
  - Test Failures → "Diese Tests müssen grün bleiben"
  - Deprecation Warnings → "Gleich migrieren"
  - Laufende Änderungen → "Vorsicht, andere Session arbeitet an gleicher Datei"
  - Config-Änderungen → ".env geändert, Dev-Server braucht Restart"
- Konflikt-Erkennung: Warnt wenn 2 Agents gleiche Datei bearbeiten
- 🔴 MVP

### 3.7 Coaching-Modus (einstellbar)
```
🔇 Aus       – Nur Fakten (Errors, Limits, fertige Sessions)
🤫 Minimal   – Nur wenn's weh tut (Overflow, repeated Errors)
💬 Normal    – + Workflow-Tipps, Idle-Warnungen
🎓 Coach     – + Proaktive Vorschläge, Reports, Lern-Hinweise
```
Plus: Einzelne Kategorien togglebar:
  - ⏱️ Zeitmanagement
  - 💰 Kosten-Warnungen
  - 🧠 Context-Management
  - 🐛 Error-Coaching
  - 📊 Reports
- "Zeig mir das nicht mehr" → Agent lernt
- 🔴 MVP (Levels), 🟡 V1.1 (Lern-Feedback)

### 3.8 Error-Erkennung & Weiterleitung
- Agent erkennt Errors in Terminal-Output
- "Build failed – soll ich den Error analysieren?"
- `[OFFEN]` Wie tief? Nur erkennen oder auch Fix vorschlagen?

### 3.9 Tages-Zusammenfassung
- "Heute: 4h KochMate, 1h SV Miesbach, 12 Sessions, ~$2.40"
- Vergleich mit gestern/letzte Woche
- 🟡 V1.1

---

## 4. Stats & Tracking

### 4.1 Usage-Tracking pro Session
- Laufzeit, Status-Verlauf
- Pro Agent-Typ: Claude Sessions, Codex Tasks, generisch
- 🔴 MVP

### 4.2 Context-Verbrauch
- Claude Code: Context Window % (via Output-Parsing / Hooks)
- Codex: Quota-/Rate-Limit-Hinweise aus CLI-Output
- Warnung bei Limits
- `[OFFEN]` Technisch: Output-Parsing vs. SDK Integration?

### 4.3 Abo-Usage-Tracking
- Kein Kosten-Tracking nötig (alles über Subscriptions)
- Stattdessen: **Usage-Budget-Tracking**
  - Claude: Plan-/Usage-Hinweise aus CLI → % verbraucht schätzen
  - Codex: Quota-/Rate-Limit-Hinweise → Restbudget schätzen
  - Aufgeteilt: Coding-Sessions vs. Management (Chef+Sub-Agents)
- Warnung: "Management-Agents verbrauchen X% – Limit wird knapp"
- 🟡 V1.1

### 4.4 Produktivitäts-Metriken
- Siehe [METRICS.md](./METRICS.md)
- 🟡 V1.1

---

## 5. Integration & Agents

### 5.1 Claude Code Integration
- **Coding-Sessions:** Startet als CLI-Prozess (nutzt Max Abo)
- **Chef-Agent:** Claude Code CLI als Management-AI (nutzt Max Abo)
- **Sub-Agents:** Claude Code CLI pro Workspace (nutzt Max Abo)
- Hooks für Status-Updates
- Prompt-Injection via PTY stdin
- Alle Claude-Instanzen teilen sich das Max-Abo-Budget
- 🔴 MVP

### 5.2 Codex CLI Integration
- Startet als CLI-Prozess (nutzt OpenAI Abo)
- Status via stdout-Patterns
- Empfängt Kontext-angereicherte Prompts vom Chef-Agent
- 🔴 MVP

### 5.3 Generische Terminals
- npm/pnpm, expo, git, logs, builds etc.
- Prozess-Status + Exit-Code
- 🔴 MVP

### 5.4 Dev-Server-Erkennung
- Erkennt laufende Server (Port, URL, Status)
- 🟡 V1.1

### 5.5 Git-Integration
- Branch-Status pro Workspace
- `[OFFEN]` Wie tief?

---

## 6. UX & Komfort

### 6.1 Quick-Switcher (Cmd+K)
- Fuzzy-Search nach Terminal, Projekt, Status
- 🔴 MVP

### 6.2 Focus-Mode
- Nur 1-2 Terminals, Assistent stört nur bei Criticals
- 🟡 V1.1

### 6.3 Theme
- Dark Mode
- `[OFFEN]` Auch Light? Terminal-Theme?

---

## Noch nicht einsortiert

- [ ] Team-Mode (wer arbeitet an was?)
- [ ] Voice-Mode ("Hey tmaster, starte Claude in KochMate")
- [ ] Plugin-System für custom Agent-Adapter
- [ ] Mobile Push-Notifications
- [ ] Integration mit GitHub Issues / Linear

---

## Offene Entscheidungen

1. `[OFFEN]` **Name:** tmaster? Oder anderer Name?
2. `[OFFEN]` **Auto-Send:** Prompt automatisch senden bei Templates oder immer Übernehmen-Button?
3. `[OFFEN]` **Workspace-Templates:** MVP oder V1.1?
4. `[OFFEN]` **Error-Analyse:** Nur erkennen oder Fix vorschlagen?
5. `[OFFEN]` **Context-Tracking:** Output-Parsing vs. tiefere Integration?
6. `[OFFEN]` **Git-Integration:** Wie tief?
7. `[OFFEN]` **Theme:** Dark-only oder auch Light?
8. `[OFFEN]` **Output-Logging:** Persistieren oder nur Events?
