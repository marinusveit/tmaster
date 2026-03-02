import type { RichSuggestion, SuggestionAction } from '@shared/types/assistant';

interface AssistantSuggestionsProps {
  suggestions: RichSuggestion[];
  onAction: (suggestionId: string, action: SuggestionAction) => void;
  onDismiss: (suggestionId: string) => void;
}

const PRIORITY_ORDER: Record<RichSuggestion['priority'], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const CATEGORY_CLASS: Record<RichSuggestion['category'], string> = {
  error: 'assistant-suggestions__item--error',
  idle: 'assistant-suggestions__item--idle',
  context: 'assistant-suggestions__item--context',
  conflict: 'assistant-suggestions__item--conflict',
  workflow: 'assistant-suggestions__item--workflow',
};

export const AssistantSuggestions = ({
  suggestions,
  onAction,
  onDismiss,
}: AssistantSuggestionsProps): JSX.Element | null => {
  if (suggestions.length === 0) {
    return null;
  }

  const sortedSuggestions = [...suggestions].sort((a, b) => {
    const priorityDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (priorityDiff !== 0) {
      return priorityDiff;
    }

    return b.timestamp - a.timestamp;
  });

  return (
    <section className="assistant-suggestions" aria-label="Suggestions">
      <h3 className="assistant-suggestions__title">Suggestions</h3>
      {sortedSuggestions.map((suggestion) => (
        <article
          key={suggestion.id}
          className={`assistant-suggestions__item ${CATEGORY_CLASS[suggestion.category]}`}
        >
          <button
            className="assistant-suggestions__dismiss"
            onClick={() => onDismiss(suggestion.id)}
            type="button"
            aria-label="Suggestion verwerfen"
          >
            ×
          </button>
          <p className="assistant-suggestions__item-title">{suggestion.title}</p>
          <p className="assistant-suggestions__item-description">{suggestion.description}</p>
          <div className="assistant-suggestions__actions">
            {suggestion.actions.map((action) => (
              <button
                key={`${suggestion.id}-${action.type}-${action.label}`}
                className="assistant-suggestions__action"
                onClick={() => onAction(suggestion.id, action)}
                type="button"
              >
                {action.label}
              </button>
            ))}
          </div>
        </article>
      ))}
    </section>
  );
};
