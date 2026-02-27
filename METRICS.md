# Metriken & Optimierung

> Wie messen wir ob tmaster seinen Job gut macht?

## 1. Session-Metriken

| Metrik | Was es misst | Wie erfasst |
|--------|-------------|-------------|
| **Idle-Time** | Wie lange Session ungenutzt | PTY-Aktivität |
| **Context-Auslastung** | Context Window % | Agent-Hooks / Output-Parsing |
| **Time-to-Notice** | Wie schnell reagiert User auf "fertig" | Notification → erste Interaktion |
| **Session-Dauer** | Wie lange läuft eine Session | Trivial |
| **Exit-Reason** | Normal / Error / Abgebrochen | Exit-Code + Pattern |

## 2. Tages-Metriken

| Metrik | Was es misst |
|--------|-------------|
| **Active Coding Time** | Σ(session_time - idle_time) |
| **Agent Utilization** | % der Zeit wo mindestens 1 Agent arbeitet |
| **Context Waste** | Sessions bei >90% Context die weitergenutzt wurden |
| **Parallel Efficiency** | Wirklich parallel oder nur gewechselt? |
| **Project Balance** | Zeitverteilung auf Projekte |
| **Agent Switches** | Wie oft Terminal gewechselt |
| **Abo-Usage** | % vom Provider-Planbudget verbraucht (heuristisch) |

## 3. Wochen-Metriken

| Metrik | Was es misst |
|--------|-------------|
| **Productivity Trend** | Active Time diese vs. letzte Woche |
| **Usage Trend** | Abo-Verbrauch Entwicklung |
| **Session Health** | % "gesund" beendete Sessions |
| **Recommendation Hit Rate** | Wie oft folgt User den Empfehlungen |

## 4. Wie kommen wir an die Daten?

### Context-Verbrauch

| Agent | Methode | Zuverlässigkeit |
|-------|---------|-----------------|
| **Claude Code** | Output-Parsing: Context-Warnings, Hook-Events | 🟡 Mittel |
| **Codex CLI** | Output: Quota-/Rate-Limit-Hinweise | 🟡 Mittel |
| **Generisch** | Nicht direkt messbar, Schätzung via Output-Länge | 🔴 Gering |

`[OFFEN]` Lohnt sich SDK-Integration oder reicht Output-Parsing?

### Abo-Usage Tracking

Da Coding-Agents über Subscriptions laufen (kein API Key):
- **Claude:** Plan-/Usage-Hinweise aus CLI-Output
- **Codex:** Quota-/Rate-Limit-Hinweise aus CLI-Output
- Kein direkter Billing-API-Zugang (Subscription, nicht API)
- Stattdessen: Heuristiken + User kann manuell "Limit erreicht" markieren

## 5. Optimierung: Was macht der Assistent?

### Regelbasiert (kein LLM, immer aktiv)

```
Situation                           → Empfehlung
────────────────────────────────── → ──────────────────────
Session idle > 10min                → "Beenden oder neuer Task?"
Context > 80%                       → "Neuer Thread starten"
> 5 Sessions parallel               → "Vielleicht fokussieren?"
Gleicher Error 3x                   → "Anderer Ansatz?"
Agent-Switch > 10x/Stunde           → "Timeboxing?"
Dev-Server 2h ohne Request          → "Brauchst du den noch?"
Abo-Usage > 70% der Woche           → "Usage-Budget wird knapp"
Session bei 90% Context + neue Frage → "Neuer Thread effizienter"
```

### LLM-basiert (opt-in)

- Pattern-Erkennung: "Morgens effizienter am Backend"
- Workload-Balancing: "KochMate 4 Sessions, SV Miesbach 0"
- Session-Planung: "Basierend auf TASKS.md: Sessions vorbereiten?"

## 6. Meta-Metriken: Misst tmaster sich selbst

| Metrik | Bedeutung | Ziel |
|--------|-----------|------|
| **Recommendation Acceptance** | Wie oft folgt User? | >60% = relevant |
| **Time-to-Notice Verbesserung** | Schnellere Reaktion auf fertige Agents? | Soll sinken |
| **Idle-Time Reduktion** | Weniger vergessene Sessions? | Soll sinken |
| **Context Waste Reduktion** | Weniger übervolle Sessions? | Soll sinken |
| **User Override Rate** | Wie oft überschreibt User den Agent? | Hoch = Agent liegt falsch |

### Feedback-Loop

```
Empfehlung gezeigt
    ├── User folgt      → Positive  → Ähnliche häufiger
    ├── User ignoriert  → Neutral   → Keine Änderung
    └── User dismisst   → Negative  → Weniger davon
```

`[OFFEN]` Feedback explizit (👍/👎) oder implizit (hat User Empfehlung befolgt)?

## 7. Tages-Dashboard (im Agent Panel)

```
┌─ Heute: Di, 24. Feb ─────────────────┐
│                                       │
│  ⏱ Active Time    4h 23min  (↑12%)   │
│  🔄 Sessions      7 (3 active)       │
│  📊 Agent Usage   78%                │
│  🎯 Focus Score   6/10               │
│  🧠 Claude        45% Plan-Budget    │
│  ⚡ Codex         27% Quota-Budget   │
│                                       │
│  Per Projekt:                         │
│  ├─ KochMate     3h 10min ████████░░ │
│  └─ SV Miesbach  1h 13min ███░░░░░░░ │
│                                       │
│  💡 2x Context-Overflow heute.        │
│     Nächstes Mal früher neuen Thread. │
└───────────────────────────────────────┘
```

`[OFFEN]` Dashboard als eigene View oder immer sichtbar im Agent Panel?
