import { useState, useCallback, useRef, useEffect } from 'react';
import { useAssistantStore } from '@renderer/stores/assistantStore';
import type { CoachingLevel } from '@shared/types/assistant';

const COACHING_LABELS: Record<CoachingLevel, string> = {
  observe: 'Beobachten',
  suggest: 'Vorschlagen',
  coach: 'Coachen',
  act: 'Handeln',
};

export const AssistantDrawer = (): JSX.Element => {
  const {
    toggleExpanded,
    messages,
    sendMessage,
    suggestions,
    removeSuggestion,
    coachingLevel,
    setCoachingLevel,
    isTyping,
  } = useAssistantStore();

  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-Scroll bei neuen Nachrichten oder Typing-Status
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || isTyping) {
      return;
    }
    sendMessage(trimmed);
    setInput('');
  }, [input, isTyping, sendMessage]);

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

  return (
    <div className="assistant-drawer">
      <div className="assistant-drawer__header">
        <span className="assistant-drawer__title">AI Assistant</span>
        <button
          className="assistant-drawer__coaching-btn"
          onClick={handleCoachingCycle}
          type="button"
          title={`Modus: ${COACHING_LABELS[coachingLevel]}`}
        >
          {COACHING_LABELS[coachingLevel]}
        </button>
        <button
          className="assistant-drawer__close"
          onClick={toggleExpanded}
          type="button"
          aria-label="Assistant schliessen"
        >
          &times;
        </button>
      </div>

      {suggestions.length > 0 && (
        <div className="assistant-drawer__suggestions">
          {suggestions.map((suggestion) => (
            <div key={suggestion.id} className="assistant-drawer__suggestion">
              <div className="assistant-drawer__suggestion-title">{suggestion.title}</div>
              <div className="assistant-drawer__suggestion-desc">{suggestion.description}</div>
              <button
                className="assistant-drawer__suggestion-action"
                onClick={() => removeSuggestion(suggestion.id)}
                type="button"
              >
                Verwerfen
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="assistant-drawer__messages">
        {messages.length === 0 && !isTyping && (
          <div className="assistant-drawer__empty">
            Noch keine Nachrichten. Stell eine Frage oder warte auf Vorschlaege.
          </div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`assistant-drawer__message assistant-drawer__message--${msg.role}`}
          >
            {msg.content}
          </div>
        ))}
        {isTyping && (
          <div className="assistant-drawer__typing">
            <span className="assistant-drawer__typing-dot" />
            <span className="assistant-drawer__typing-dot" />
            <span className="assistant-drawer__typing-dot" />
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="assistant-drawer__input-area">
        <textarea
          className="assistant-drawer__input"
          placeholder="Frage stellen..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={isTyping}
        />
        <button
          className="assistant-drawer__send"
          onClick={handleSend}
          type="button"
          disabled={!input.trim() || isTyping}
        >
          Senden
        </button>
      </div>
    </div>
  );
};
