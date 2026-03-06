import { randomUUID } from 'node:crypto';
import type { IpcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import type { AssistantMessage, PromptAgentType, PromptDraft } from '../../shared/types/assistant';
import type { CreateTerminalResponse } from '../../shared/types/terminal';
import type { ContextBroker } from '../broker/ContextBroker';
import type { OrchestratorSession } from '../orchestrator/OrchestratorSession';
import { containsUnsupportedControlCharacters } from '../utils/textSanitization';
import { isObjectRecord } from '../utils/typeGuards';

interface RegisterAssistantHandlersOptions {
  contextBroker?: ContextBroker;
  orchestrator?: OrchestratorSession;
  onAssistantMessage: (message: AssistantMessage) => void;
  createTerminal?: (request: { workspaceId?: string; shell?: string }) => CreateTerminalResponse;
  writeTerminal?: (terminalId: string, data: string) => void;
  getActiveWorkspaceId?: (senderId?: number) => string;
  executeDelayMs?: number;
}

const MAX_PROMPT_CONTENT_CHARS = 20_000;
const DEFAULT_AGENT_FOR_GENERIC: Exclude<PromptAgentType, 'generic'> = 'claude';

const AGENT_SHELL_BY_TYPE: Record<Exclude<PromptAgentType, 'generic'>, string> = {
  claude: 'claude',
  codex: 'codex',
};

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

const asNonEmptyString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const isPromptAgentType = (value: unknown): value is PromptAgentType => {
  return value === 'claude' || value === 'codex' || value === 'generic';
};

const inferAgentType = (intent: string): PromptAgentType => {
  const normalized = intent.toLowerCase();
  if (normalized.includes('claude')) {
    return 'claude';
  }

  if (normalized.includes('codex')) {
    return 'codex';
  }

  return DEFAULT_AGENT_FOR_GENERIC;
};

const parsePromptDraft = (payload: unknown): PromptDraft => {
  if (!isObjectRecord(payload)) {
    throw new Error('Invalid prompt draft payload');
  }

  const id = asNonEmptyString(payload.id);
  const content = asNonEmptyString(payload.content);
  const context = asNonEmptyString(payload.context);
  const workspaceId = asNonEmptyString(payload.workspaceId);
  const timestamp = payload.timestamp;
  const isEdited = payload.isEdited;
  const agentType = payload.agentType;

  if (
    !id
    || !content
    || context === null
    || !workspaceId
    || typeof timestamp !== 'number'
    || !Number.isFinite(timestamp)
    || typeof isEdited !== 'boolean'
    || !isPromptAgentType(agentType)
  ) {
    throw new Error('Invalid prompt draft payload');
  }

  return {
    id,
    content,
    context,
    workspaceId,
    timestamp,
    isEdited,
    agentType,
  };
};

const resolvePromptExecutionShell = (agentType: PromptAgentType): string => {
  if (agentType === 'claude' || agentType === 'codex') {
    return AGENT_SHELL_BY_TYPE[agentType];
  }

  return AGENT_SHELL_BY_TYPE[DEFAULT_AGENT_FOR_GENERIC];
};

const validatePromptExecutionContent = (content: string): void => {
  if (content.length > MAX_PROMPT_CONTENT_CHARS) {
    throw new Error(`Prompt is too large (max ${MAX_PROMPT_CONTENT_CHARS} chars)`);
  }

  if (containsUnsupportedControlCharacters(content)) {
    throw new Error('Prompt contains unsupported control characters');
  }
};

const getSenderId = (event: unknown): number | undefined => {
  if (!isObjectRecord(event)) {
    return undefined;
  }

  const sender = event.sender;
  if (!isObjectRecord(sender)) {
    return undefined;
  }

  return typeof sender.id === 'number' ? sender.id : undefined;
};

const sleep = async (ms: number): Promise<void> => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
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

    // Orchestrator-Pfad: Streaming via Claude CLI Session
    if (options.orchestrator) {
      options.orchestrator.sendMessage(trimmedContent);
      return;
    }

    // Fallback: statisches buildReply()
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

  ipcMain.handle(IPC_CHANNELS.assistantGeneratePrompt, (_event, payload: unknown) => {
    const intent = asNonEmptyString(payload);
    if (!intent) {
      throw new Error('Assistant intent is empty');
    }

    const senderId = getSenderId(_event);
    const workspaceId = options.getActiveWorkspaceId?.(senderId) ?? 'default';
    const promptContext = options.contextBroker?.buildPromptContext(workspaceId)
      ?? 'Keine Live-Kontextdaten verfügbar.';
    const content = `${intent}\n\n--- Kontext aus dem Workspace ---\n${promptContext}`;

    const draft: PromptDraft = {
      id: randomUUID(),
      content,
      context: promptContext,
      agentType: inferAgentType(intent),
      workspaceId,
      timestamp: Date.now(),
      isEdited: false,
    };

    return draft;
  });

  ipcMain.handle(IPC_CHANNELS.assistantExecutePrompt, async (_event, payload: unknown) => {
    if (!options.createTerminal || !options.writeTerminal) {
      throw new Error('Prompt execution is not configured');
    }

    const draft = parsePromptDraft(payload);
    const shell = resolvePromptExecutionShell(draft.agentType);
    validatePromptExecutionContent(draft.content);

    const createdTerminal = options.createTerminal({
      workspaceId: draft.workspaceId,
      shell,
    });

    await sleep(options.executeDelayMs ?? 500);
    const normalizedPrompt = `${draft.content.replace(/\r\n/g, '\n').trimEnd()}\n`;
    options.writeTerminal(createdTerminal.terminalId, normalizedPrompt);

    return { terminalId: createdTerminal.terminalId };
  });
};
