import { randomUUID } from 'node:crypto';
import type { IpcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import type { AssistantMessage } from '../../shared/types/assistant';
import type { ContextBroker } from '../broker/ContextBroker';

interface RegisterAssistantHandlersOptions {
  contextBroker?: ContextBroker;
  onAssistantMessage: (message: AssistantMessage) => void;
}

const buildReply = (content: string, promptContext?: string): string => {
  const normalized = content.toLowerCase();

  if (normalized.includes('status') || normalized.includes('zustand')) {
    return promptContext
      ? `Aktueller Kontext: ${promptContext}`
      : 'Aktuell liegen keine besonderen Kontextdaten vor.';
  }

  if (normalized.includes('error') || normalized.includes('fehler')) {
    return promptContext
      ? `Ich sehe folgende Hinweise: ${promptContext}`
      : 'Ich sehe gerade keine Error-Hinweise im Event-Stream.';
  }

  return promptContext
    ? `Verstanden. Kontext für die nächsten Schritte: ${promptContext}`
    : 'Nachricht empfangen. Ich beobachte die Terminal-Events weiter.';
};

export const registerAssistantHandlers = (
  ipcMain: IpcMain,
  options: RegisterAssistantHandlersOptions,
): void => {
  ipcMain.handle(IPC_CHANNELS.assistantSend, (_event, payload: unknown) => {
    if (typeof payload !== 'string') {
      throw new Error('Invalid assistant payload');
    }

    const trimmedContent = payload.trim();
    if (!trimmedContent) {
      throw new Error('Assistant message is empty');
    }

    let promptContext: string | undefined;
    if (options.contextBroker) {
      const context = options.contextBroker.getContext({ limit: 20 });
      const firstWorkspaceTerminal = context.events[0]?.terminalId;
      if (firstWorkspaceTerminal) {
        const inferredWorkspace = options.contextBroker.getContext({ terminalId: firstWorkspaceTerminal, limit: 1 });
        const firstEvent = inferredWorkspace.events[0];
        if (firstEvent) {
          promptContext = `${firstEvent.terminalId}: ${firstEvent.summary}`;
        }
      }
    }

    const assistantMessage: AssistantMessage = {
      id: randomUUID(),
      role: 'assistant',
      content: buildReply(trimmedContent, promptContext),
      timestamp: Date.now(),
    };

    options.onAssistantMessage(assistantMessage);
  });
};
