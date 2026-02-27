import { useAssistantStore } from '@renderer/stores/assistantStore';

export const AssistantTeaser = (): JSX.Element => {
  const { isExpanded, toggleExpanded, suggestions } = useAssistantStore();

  return (
    <button
      className={`assistant-teaser${isExpanded ? ' assistant-teaser--active' : ''}`}
      onClick={toggleExpanded}
      type="button"
    >
      <span className="assistant-teaser__icon">&gt;_</span>
      <span className="assistant-teaser__label">AI Assistant</span>
      {suggestions.length > 0 && (
        <span className="assistant-teaser__badge">{suggestions.length}</span>
      )}
    </button>
  );
};
