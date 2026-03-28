import * as React from 'react';
import ReactMarkdown from 'react-markdown';
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
  const messagesContainerRef = React.useRef<HTMLDivElement>(null);
  const [input, setInput] = React.useState('');
  const [shouldAutoScroll, setShouldAutoScroll] = React.useState(true);
  const endRef = React.useRef<HTMLDivElement>(null);
  const hasStreamingMessage = messages.some((message) => message.isStreaming);

  const isNearBottom = (element: HTMLDivElement): boolean => {
    const distanceToBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    return distanceToBottom <= 48;
  };

  React.useEffect(() => {
    if (!shouldAutoScroll) {
      return;
    }

    endRef.current?.scrollIntoView({
      behavior: hasStreamingMessage ? 'smooth' : 'auto',
      block: 'end',
    });
  }, [hasStreamingMessage, isTyping, messages, shouldAutoScroll]);

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
      <div
        ref={messagesContainerRef}
        className="assistant-chat__messages"
        onScroll={(event) => {
          const nextShouldAutoScroll = isNearBottom(event.currentTarget);
          setShouldAutoScroll((current) => {
            return current === nextShouldAutoScroll ? current : nextShouldAutoScroll;
          });
        }}
      >
        {messages.length === 0 && !isTyping && (
          <p className="assistant-chat__empty">Frag mich etwas über deine Terminals...</p>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`assistant-chat__message assistant-chat__message--${message.role}${message.isStreaming ? ' assistant-chat__message--streaming' : ''}`}
          >
            {message.role === 'assistant' ? (
              <div className="assistant-chat__markdown">
                <ReactMarkdown>{message.content}</ReactMarkdown>
                {message.isStreaming && <span className="assistant-chat__cursor" aria-hidden="true" />}
              </div>
            ) : (
              message.content
            )}
          </div>
        ))}

        {isTyping && !hasStreamingMessage && (
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
