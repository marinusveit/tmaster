import { useState, useCallback } from 'react';
import { useAssistantStore } from '@renderer/stores/assistantStore';
import type { CoachingLevel } from '@shared/types/assistant';

const COACHING_LABELS: Record<CoachingLevel, string> = {
  observe: 'Beobachten',
  suggest: 'Vorschlagen',
  coach: 'Coachen',
  act: 'Handeln',
};

export const AssistantPanel = (): JSX.Element => {
  const {
    isExpanded,
    toggleExpanded,
    messages,
    addMessage,
    suggestions,
    removeSuggestion,
    coachingLevel,
    setCoachingLevel,
  } = useAssistantStore();

  const [input, setInput] = useState('');

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed) {
      return;
    }

    addMessage({
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
      timestamp: Date.now(),
    });
    setInput('');
  }, [input, addMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleCoachingCycle = useCallback(() => {
    const levels: CoachingLevel[] = ['observe', 'suggest', 'coach', 'act'];
    const currentIndex = levels.indexOf(coachingLevel);
    const nextLevel = levels[(currentIndex + 1) % levels.length];
    if (nextLevel) {
      setCoachingLevel(nextLevel);
    }
  }, [coachingLevel, setCoachingLevel]);

  if (!isExpanded) {
    return (
      <button
        className="assistant-panel__teaser"
        onClick={toggleExpanded}
        type="button"
      >
        <span className="assistant-panel__teaser-icon">&gt;_</span>
        <span className="assistant-panel__teaser-label">AI Assistant</span>
        {suggestions.length > 0 && (
          <span className="assistant-panel__teaser-badge">{suggestions.length}</span>
        )}
      </button>
    );
  }

  return (
    <div className="assistant-panel">
      <div className="assistant-panel__header">
        <span className="assistant-panel__title">AI Assistant</span>
        <button
          className="assistant-panel__coaching-btn"
          onClick={handleCoachingCycle}
          type="button"
          title={`Modus: ${COACHING_LABELS[coachingLevel]}`}
        >
          {COACHING_LABELS[coachingLevel]}
        </button>
        <button
          className="assistant-panel__close"
          onClick={toggleExpanded}
          type="button"
          aria-label="Assistant schliessen"
        >
          &times;
        </button>
      </div>

      {suggestions.length > 0 && (
        <div className="assistant-panel__suggestions">
          {suggestions.map((suggestion) => (
            <div key={suggestion.id} className="assistant-panel__suggestion">
              <div className="assistant-panel__suggestion-title">{suggestion.title}</div>
              <div className="assistant-panel__suggestion-desc">{suggestion.description}</div>
              <button
                className="assistant-panel__suggestion-action"
                onClick={() => removeSuggestion(suggestion.id)}
                type="button"
              >
                Verwerfen
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="assistant-panel__messages">
        {messages.length === 0 && (
          <div className="assistant-panel__empty">
            Noch keine Nachrichten. Stell eine Frage oder warte auf Vorschlaege.
          </div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`assistant-panel__message assistant-panel__message--${msg.role}`}
          >
            {msg.content}
          </div>
        ))}
      </div>

      <div className="assistant-panel__input-area">
        <input
          className="assistant-panel__input"
          type="text"
          placeholder="Frage stellen..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          className="assistant-panel__send"
          onClick={handleSend}
          type="button"
          disabled={!input.trim()}
        >
          Senden
        </button>
      </div>
    </div>
  );
};
