import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AssistantChat } from '@renderer/components/sidebar/AssistantChat';
import type { AssistantMessage } from '@shared/types/assistant';

const createProps = (messages: AssistantMessage[]) => {
  return {
    messages,
    isTyping: false,
    onSendMessage: () => undefined,
    currentDraft: null,
    isExecutingDraft: false,
    onDraftEdit: () => undefined,
    onDraftAgentTypeChange: () => undefined,
    onExecuteDraft: () => undefined,
    onDiscardDraft: () => undefined,
  };
};

describe('AssistantChat', () => {
  it('rendert Assistant-Markdown mit Inline-Code und Link', () => {
    const html = renderToStaticMarkup(createElement(AssistantChat, createProps([
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'Nutze `pnpm test` und [Docs](https://example.com).',
        timestamp: 1,
      },
    ])));

    expect(html).toContain('<code>pnpm test</code>');
    expect(html).toContain('<a href="https://example.com">Docs</a>');
  });

  it('rendert einen Cursor fuer laufende Streaming-Nachrichten', () => {
    const html = renderToStaticMarkup(createElement(AssistantChat, createProps([
      {
        id: 'assistant-stream',
        role: 'assistant',
        content: 'Streaming...',
        timestamp: 1,
        isStreaming: true,
      },
    ])));

    expect(html).toContain('assistant-chat__message--streaming');
    expect(html).toContain('assistant-chat__cursor');
  });
});
