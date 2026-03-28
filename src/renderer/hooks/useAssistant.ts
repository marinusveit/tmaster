import { useEffect } from 'react';
import { transport } from '@renderer/transport';
import { useAssistantStore } from '@renderer/stores/assistantStore';
import type { TerminalEvent } from '@shared/types/event';
import type { AppNotification, NotificationReplyRequest } from '@shared/types/notification';
import type { TerminalDataEvent, TerminalExitEvent } from '@shared/types/terminal';
import type { AssistantMessage, AssistantStreamChunk, RichSuggestion } from '@shared/types/assistant';

export const useAssistant = (): void => {
  useEffect(() => {
    const unsubscribeMessage = transport.on<AssistantMessage>('onAssistantMessage', (message) => {
      useAssistantStore.getState().addMessage(message);
    });

    const unsubscribeStreamChunk = transport.on<AssistantStreamChunk>('onAssistantStreamChunk', (chunk) => {
      useAssistantStore.getState().handleStreamChunk(chunk);
    });

    const unsubscribeSuggestion = transport.on<RichSuggestion>('onSuggestion', (suggestion) => {
      useAssistantStore.getState().addRichSuggestion(suggestion);
    });

    const unsubscribeTerminalEvent = transport.on<TerminalEvent>('onTerminalEvent', (event) => {
      useAssistantStore.getState().handleTerminalEvent(event);
    });

    const unsubscribeTerminalData = transport.on<TerminalDataEvent>('onTerminalData', (event) => {
      useAssistantStore.getState().handleTerminalData(event);
    });

    const unsubscribeTerminalExit = transport.on<TerminalExitEvent>('onTerminalExit', (event) => {
      useAssistantStore.getState().handleTerminalExit(event.terminalId);
    });

    const unsubscribeNotification = transport.on<AppNotification>('onNotification', (notification) => {
      useAssistantStore.getState().handleNotification(notification);
    });

    const unsubscribeNotificationReplyRequest = transport.on<NotificationReplyRequest>('onNotificationReplyRequest', (request) => {
      useAssistantStore.getState().handleNotificationReplyRequest(request);
    });

    return () => {
      unsubscribeMessage();
      unsubscribeStreamChunk();
      unsubscribeSuggestion();
      unsubscribeTerminalEvent();
      unsubscribeTerminalData();
      unsubscribeTerminalExit();
      unsubscribeNotification();
      unsubscribeNotificationReplyRequest();
    };
  }, []);
};
