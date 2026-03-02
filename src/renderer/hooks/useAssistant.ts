import { useEffect } from 'react';
import { transport } from '@renderer/transport';
import { useAssistantStore } from '@renderer/stores/assistantStore';
import type { AssistantMessage, RichSuggestion } from '@shared/types/assistant';

export const useAssistant = (): void => {
  useEffect(() => {
    const unsubscribeMessage = transport.on<AssistantMessage>('onAssistantMessage', (message) => {
      useAssistantStore.getState().addMessage(message);
    });

    const unsubscribeSuggestion = transport.on<RichSuggestion>('onSuggestion', (suggestion) => {
      useAssistantStore.getState().addRichSuggestion(suggestion);
    });

    return () => {
      unsubscribeMessage();
      unsubscribeSuggestion();
    };
  }, []);
};
