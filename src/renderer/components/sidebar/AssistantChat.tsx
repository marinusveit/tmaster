import { useEffect, useRef, useState } from 'react';
import type { AssistantMessage, PromptAgentType, PromptDraft } from '@shared/types/assistant';
import { PromptDraftEditor } from './PromptDraftEditor';

interface AssistantChatProps {
  messages: AssistantMessage[];
  isTyping: boolean;
  onSendMessage: (content: string) => void;
  currentDraft: PromptDraft | null;
  isExecutingDraft: boolean;
  onDraftEdit: (content: string) => void;
  onDraftAgentTypeChange: (agentType: PromptAgentType) => void;
  onExecuteDraft: () => void;
  onDiscardDraft: () => void;
}

export const AssistantChat = ({
  messages,
  isTyping,
  onSendMessage,
  currentDraft,
  isExecutingDraft,
  onDraftEdit,
  onDraftAgentTypeChange,
  onExecuteDraft,
  onDiscardDraft,
}: AssistantChatProps): JSX.Element => {
  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isTyping]);

  const send = (): void => {
    const trimmed = input.trim();
    if (!trimmed || isTyping) {
      return;
    }

    onSendMessage(trimmed);
    setInput('');
  };

  return (
    <section className="assistant-chat" aria-label="Chat">
      <h3 className="assistant-chat__title">Chat</h3>
      <div className="assistant-chat__messages">
        {messages.length === 0 && !isTyping && (
          <p className="assistant-chat__empty">Frag mich etwas über deine Terminals...</p>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`assistant-chat__message assistant-chat__message--${message.role}`}
          >
            {message.content}
          </div>
        ))}

        {isTyping && (
          <div className="assistant-chat__typing" aria-live="polite">
            <span className="assistant-chat__dot" />
            <span className="assistant-chat__dot" />
            <span className="assistant-chat__dot" />
          </div>
        )}

        <div ref={endRef} />
      </div>

      {currentDraft && (
        <PromptDraftEditor
          draft={currentDraft}
          onEdit={onDraftEdit}
          onExecute={onExecuteDraft}
          onDiscard={onDiscardDraft}
          onAgentTypeChange={onDraftAgentTypeChange}
          isExecuting={isExecutingDraft}
        />
      )}

      <div className="assistant-chat__input-row">
        <textarea
          className="assistant-chat__input"
          placeholder="Nachricht an den Assistenten..."
          rows={2}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              send();
            }
          }}
        />
        <button
          className="assistant-chat__send"
          onClick={send}
          type="button"
          disabled={!input.trim() || isTyping}
        >
          Senden
        </button>
      </div>
    </section>
  );
};
