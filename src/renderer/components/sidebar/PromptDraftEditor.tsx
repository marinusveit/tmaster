import { useEffect, useRef, useState } from 'react';
import type { PromptAgentType, PromptDraft } from '@shared/types/assistant';

interface PromptDraftEditorProps {
  draft: PromptDraft;
  onEdit: (content: string) => void;
  onExecute: () => void;
  onDiscard: () => void;
  isExecuting: boolean;
  onAgentTypeChange?: (agentType: PromptAgentType) => void;
}

const AGENT_OPTIONS: Array<{ type: PromptAgentType; label: string }> = [
  { type: 'claude', label: 'Claude' },
  { type: 'codex', label: 'Codex' },
  { type: 'generic', label: 'Generisch' },
];

export const PromptDraftEditor = ({
  draft,
  onEdit,
  onExecute,
  onDiscard,
  isExecuting,
  onAgentTypeChange,
}: PromptDraftEditorProps): JSX.Element => {
  const [isContextExpanded, setIsContextExpanded] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!textareaRef.current) {
      return;
    }

    textareaRef.current.style.height = 'auto';
    textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
  }, [draft.content]);

  return (
    <section className="prompt-draft" aria-label="Prompt-Entwurf">
      <header className="prompt-draft__header">
        <h4 className="prompt-draft__title">Prompt-Entwurf</h4>
        <button
          className="prompt-draft__discard"
          onClick={onDiscard}
          type="button"
          aria-label="Entwurf verwerfen"
        >
          ×
        </button>
      </header>

      <div className="prompt-draft__agents" role="group" aria-label="Agent-Typ">
        {AGENT_OPTIONS.map((option) => (
          <button
            key={option.type}
            className={`prompt-draft__agent${draft.agentType === option.type ? ' prompt-draft__agent--active' : ''}`}
            type="button"
            onClick={() => onAgentTypeChange?.(option.type)}
            disabled={isExecuting}
          >
            {option.label}
          </button>
        ))}
      </div>

      <textarea
        ref={textareaRef}
        className="prompt-draft__textarea"
        value={draft.content}
        onChange={(event) => onEdit(event.target.value)}
        rows={5}
        disabled={isExecuting}
      />

      <div className="prompt-draft__context">
        <button
          className="prompt-draft__context-toggle"
          type="button"
          onClick={() => setIsContextExpanded((previous) => !previous)}
          aria-expanded={isContextExpanded}
        >
          Kontext (readonly)
        </button>
        {isContextExpanded && (
          <pre className="prompt-draft__context-content">{draft.context}</pre>
        )}
      </div>

      <button
        className="prompt-draft__execute"
        type="button"
        onClick={onExecute}
        disabled={isExecuting || !draft.content.trim()}
      >
        {isExecuting ? 'Wird ausgeführt…' : 'Übernehmen'}
      </button>
    </section>
  );
};
