# GUI-Konzept

> Orientiert an Marinus' aktuellem Ghostty-Workflow: Ein Fenster pro Projekt, mehrere Tabs darin.

## Layout

```
┌─[ Projekt A ]─[ Projekt B ]─[  +  ]─────────────────────────┐
│                                                             │
├─ Sidebar ────┬─ Terminal Tabs ──────────────────────────────┤
│              │ [ T1: claude ][ T2: codex ][ T3: dev ][ + ]  │
│ TERMINALS    │                                              │
│              │ ┌──────────────────────────────────────────┐ │
│ T1 🟢 claude │ │                                          │ │
│ T2 🟡 codex  │ │  Aktives Terminal (xterm.js + WebGL)     │ │
│ T3 🔵 dev    │ │                                          │ │
│ T4 ⚫ git    │ │  Fullsize – wie ein Ghostty Tab          │ │
│ T5 🟢 claude │ │                                          │ │
│ ...          │ │                                          │ │
│              │ │                                          │ │
│──────────────│ │                                          │ │
│ 💬 ASSISTANT │ └──────────────────────────────────────────┘ │
│ (toggle)     │                                              │
│              │                                              │
│ T2 wartet    │                                              │
│ auf Input    │                                              │
│              │                                              │
│ [Vorschlag]  │                                              │
│ T1 ctx 85%   │                                              │
│ → neuer      │                                              │
│   Thread?    │                                              │
├──────────────┴──────────────────────────────────────────────┤
│ ⚡ 5 active   │ 1 waiting │ 0 errors │ Plan-Budget: 45%      │
└─────────────────────────────────────────────────────────────┘
```

## Konzept

- **Workspace-Tabs oben** = Marinus' Ghostty-Fenster (ein Tab pro Projekt)
- **Terminal-Tabs** = Marinus' Ghostty-Tabs (claude, codex, pnpm dev, git...)
- **Sidebar links** = das was heute fehlt: Gesamtüberblick + AI-Assistent
- **Main Area** = ein Terminal groß (Default), wie gewohnt
- **Status Bar** = Dashboard auf einen Blick

## Bereiche

### 1. Workspace-Tabs (oben)
- Ein Tab pro Projekt
- Wechsel = alle Terminals + Sidebar wechseln
- Badge bei Events in anderem Workspace: `Projekt B (!)`
- "+" für neuen Workspace

### 2. Sidebar (links)

**Terminal-Liste (oben)**
- Alle Terminals mit: ID + Status-Dot + Agent-Typ + Kurzname
- Klick → Terminal wird in Main Area angezeigt
- Filterbar: nach Status, Agent-Typ
- Kompakt – skaliert bis 25 Terminals

**AI Assistant (unten, togglebar)**
- Chat mit dem Assistenten
- Empfehlungen mit Action-Buttons
- Quick Stats
- Toggle mit `Cmd+.`

### 3. Terminal Area (rechts)

**Default:** Ein Terminal groß (Fullsize)

**Split-View (optional):** `Cmd+\` zum Teilen
- Horizontal oder Vertikal (2 Terminals)
- Grid 2x2 (4 Terminals)
- Mehr als 4 sichtbar bringt nichts → zu klein

**Slot-Ownership (pro Slot):**
- 🤖 Agent-managed: Agent zeigt relevantes Terminal
- 🔒 User-locked: Nur User wechselt
- 🔓 Shared: Agent schlägt vor, Quick-Confirm nötig

### 4. Status Bar (unten)
- Active / Waiting / Error Counts
- Abo-Usage (Provider-Planbudget, heuristisch)
- Aktueller Workspace

## Keyboard Shortcuts

| Shortcut | Aktion |
|----------|--------|
| `Cmd+K` | Quick-Switcher (Fuzzy Search) |
| `Cmd+1-9` | Terminal nach Position |
| `Cmd+T` | Neues Terminal |
| `Cmd+W` | Terminal schließen |
| `Cmd+Tab` | Nächster Workspace |
| `Cmd+\` | Split View toggle |
| `Cmd+.` | AI Assistant toggle |
| `Cmd+Enter` | Prompt übernehmen (im Chat) |
| `Escape` | Chat verlassen / Terminal fokussieren |

## Status-Farben

| Status | Dot | Bedeutung |
|--------|-----|-----------|
| Active | 🟢 | Agent arbeitet |
| Waiting | 🟡 | Wartet auf Input |
| Idle | 🔴 | Nichts los seit >5min |
| Dev-Server | 🔵 | Hintergrund-Prozess |
| Finished | ⚫ | Fertig, Review möglich |

## Offene GUI-Fragen

1. `[OFFEN]` Sidebar Breite: Fix oder resizable?
2. `[OFFEN]` Dark-only oder auch Light Theme?
3. `[OFFEN]` Terminal-Font: System-Mono oder Auswahl?
4. `[OFFEN]` Notifications: Toast, Badge, Sound?
