import { AssistantChat } from './AssistantChat';
import { AssistantSuggestions } from './AssistantSuggestions';
import { CoachingLevelSelector } from './CoachingLevelSelector';
import { useAssistantStore } from '@renderer/stores/assistantStore';

export interface AssistantPanelProps {
  isExpanded: boolean;
  onToggle: () => void;
}

export const AssistantTeaser = (): JSX.Element => {
  const isExpanded = useAssistantStore((state) => state.isExpanded);
  const onToggle = useAssistantStore((state) => state.toggleExpanded);
  const unreadCount = useAssistantStore((state) => state.richSuggestions.length);

  return (
    <button
      className={`assistant-panel__teaser${isExpanded ? ' assistant-panel__teaser--active' : ''}`}
      onClick={onToggle}
      type="button"
    >
      <span className="assistant-panel__teaser-icon">💬</span>
      <span className="assistant-panel__teaser-label">Assistent</span>
      {unreadCount > 0 && <span className="assistant-panel__teaser-badge">{unreadCount}</span>}
    </button>
  );
};

export const AssistantPanel = ({ isExpanded, onToggle }: AssistantPanelProps): JSX.Element | null => {
  const messages = useAssistantStore((state) => state.messages);
  const richSuggestions = useAssistantStore((state) => state.richSuggestions);
  const coachingLevel = useAssistantStore((state) => state.coachingLevel);
  const isTyping = useAssistantStore((state) => state.isTyping);
  const currentDraft = useAssistantStore((state) => state.currentDraft);
  const isExecutingDraft = useAssistantStore((state) => state.isExecutingDraft);
  const sendMessage = useAssistantStore((state) => state.sendMessage);
  const updateDraft = useAssistantStore((state) => state.updateDraft);
  const updateDraftAgentType = useAssistantStore((state) => state.updateDraftAgentType);
  const executeDraft = useAssistantStore((state) => state.executeDraft);
  const discardDraft = useAssistantStore((state) => state.discardDraft);
  const setCoachingLevel = useAssistantStore((state) => state.setCoachingLevel);
  const removeRichSuggestion = useAssistantStore((state) => state.removeRichSuggestion);
  const executeSuggestionAction = useAssistantStore((state) => state.executeSuggestionAction);

  if (!isExpanded) {
    return null;
  }

  return (
    <aside className="assistant-panel" aria-label="Assistant Panel">
      <header className="assistant-panel__header">
        <span className="assistant-panel__title">💬 Assistent</span>
        {richSuggestions.length > 0 && (
          <span className="assistant-panel__badge" aria-label="ungelesene Vorschläge">
            {richSuggestions.length}
          </span>
        )}
        <button className="assistant-panel__toggle" onClick={onToggle} type="button">
          ▾
        </button>
      </header>

      <div className="assistant-panel__body">
        <CoachingLevelSelector level={coachingLevel} onChange={setCoachingLevel} />

        <AssistantSuggestions
          suggestions={richSuggestions}
          onDismiss={removeRichSuggestion}
          onAction={(suggestionId, action) => {
            void executeSuggestionAction(suggestionId, action);
          }}
        />

        <AssistantChat
          messages={messages}
          isTyping={isTyping}
          onSendMessage={sendMessage}
          currentDraft={currentDraft}
          isExecutingDraft={isExecutingDraft}
          onDraftEdit={updateDraft}
          onDraftAgentTypeChange={updateDraftAgentType}
          onExecuteDraft={() => {
            void executeDraft();
          }}
          onDiscardDraft={discardDraft}
        />
      </div>
    </aside>
  );
};
