import { useEffect, useRef, useState } from 'react';
import type { AssistantMessage, PromptAgentType, PromptDraft } from '@shared/types/assistant';
import type { WaitingTerminalReply } from '@renderer/stores/assistantStore';
import { PromptDraftEditor } from './PromptDraftEditor';

interface AssistantChatProps {
  messages: AssistantMessage[];
  pendingReplies: WaitingTerminalReply[];
  pendingReplyRequestTerminalId: string | null;
  sendingReplyTerminalIds: string[];
  isTyping: boolean;
  onSendMessage: (content: string) => void;
  onSendTerminalReply: (terminalId: string, input: string) => void;
  onReplyRequestHandled: () => void;
  currentDraft: PromptDraft | null;
  isExecutingDraft: boolean;
  onDraftEdit: (content: string) => void;
  onDraftAgentTypeChange: (agentType: PromptAgentType) => void;
  onExecuteDraft: () => void;
  onDiscardDraft: () => void;
}

export const AssistantChat = ({
  messages,
  pendingReplies,
  pendingReplyRequestTerminalId,
  sendingReplyTerminalIds,
  isTyping,
  onSendMessage,
  onSendTerminalReply,
  onReplyRequestHandled,
  currentDraft,
  isExecutingDraft,
  onDraftEdit,
  onDraftAgentTypeChange,
  onExecuteDraft,
  onDiscardDraft,
}: AssistantChatProps): JSX.Element => {
  const [input, setInput] = useState('');
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const endRef = useRef<HTMLDivElement>(null);
  const replyInputRefs = useRef(new Map<string, HTMLInputElement | null>());

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, pendingReplies, isTyping]);

  useEffect(() => {
    setReplyDrafts((current) => {
      const nextEntries = Object.entries(current).filter(([terminalId]) => {
        return pendingReplies.some((reply) => reply.terminalId === terminalId);
      });

      const nextKeys = nextEntries.map(([terminalId]) => terminalId).sort();
      const currentKeys = Object.keys(current).sort();
      if (
        nextKeys.length === currentKeys.length
        && nextKeys.every((terminalId, index) => terminalId === currentKeys[index])
      ) {
        return current;
      }

      return Object.fromEntries(nextEntries);
    });
  }, [pendingReplies]);

  useEffect(() => {
    if (!pendingReplyRequestTerminalId) {
      return;
    }

    const replyInput = replyInputRefs.current.get(pendingReplyRequestTerminalId);
    replyInput?.focus();
    replyInput?.select();
    onReplyRequestHandled();
  }, [pendingReplyRequestTerminalId, onReplyRequestHandled]);

  const send = (): void => {
    const trimmed = input.trim();
    if (!trimmed || isTyping) {
      return;
    }

    onSendMessage(trimmed);
    setInput('');
  };

  const sendReply = (terminalId: string): void => {
    const replyText = replyDrafts[terminalId]?.trim();
    if (!replyText) {
      return;
    }

    onSendTerminalReply(terminalId, replyText);
    setReplyDrafts((current) => ({
      ...current,
      [terminalId]: '',
    }));
  };

  return (
    <section className="assistant-chat" aria-label="Chat">
      <h3 className="assistant-chat__title">Chat</h3>
      <div className="assistant-chat__messages">
        {messages.length === 0 && !isTyping && (
          <p className="assistant-chat__empty">Frag mich etwas über deine Terminals...</p>
        )}

        {pendingReplies.length > 0 && (
          <div className="assistant-chat__pending-replies">
            {pendingReplies.map((reply) => {
              const isSending = sendingReplyTerminalIds.includes(reply.terminalId);
              const draftValue = replyDrafts[reply.terminalId] ?? '';

              return (
                <div
                  key={reply.terminalId}
                  className={`assistant-chat__reply-card${
                    pendingReplyRequestTerminalId === reply.terminalId ? ' assistant-chat__reply-card--focus' : ''
                  }`}
                >
                  <div className="assistant-chat__reply-meta">
                    <span className="assistant-chat__reply-label">{reply.terminalLabel}</span>
                    <span className="assistant-chat__reply-status">wartet auf Input</span>
                  </div>
                  <p className="assistant-chat__reply-question">{reply.question}</p>
                  <div className="assistant-chat__reply-row">
                    <input
                      ref={(element) => {
                        replyInputRefs.current.set(reply.terminalId, element);
                      }}
                      className="assistant-chat__reply-input"
                      type="text"
                      value={draftValue}
                      placeholder="Antwort an das Terminal senden..."
                      disabled={isSending}
                      onChange={(event) => {
                        const value = event.target.value;
                        setReplyDrafts((current) => ({
                          ...current,
                          [reply.terminalId]: value,
                        }));
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                          event.preventDefault();
                          sendReply(reply.terminalId);
                        }
                      }}
                    />
                    <button
                      className="assistant-chat__reply-send"
                      onClick={() => sendReply(reply.terminalId)}
                      type="button"
                      disabled={!draftValue.trim() || isSending}
                    >
                      {isSending ? 'Sende…' : 'Antworten'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
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
