import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import * as React from 'react';
import { AssistantChat, isAssistantChatNearBottom } from '@renderer/components/sidebar/AssistantChat';

Object.assign(globalThis, { React });

describe('AssistantChat', () => {
  it('rendert Assistant-Nachrichten als Markdown und markiert Streaming-Nachrichten', () => {
    const html = renderToStaticMarkup(
      React.createElement(AssistantChat, {
        messages: [
          {
            id: 'assistant-1',
            role: 'assistant',
            content: 'Hallo **Welt** mit `code` und [Link](https://example.com)',
            timestamp: 1,
            isStreaming: true,
          },
        ],
        isTyping: true,
        onSendMessage: vi.fn(),
        currentDraft: null,
        isExecutingDraft: false,
        onDraftEdit: vi.fn(),
        onDraftAgentTypeChange: vi.fn(),
        onExecuteDraft: vi.fn(),
        onDiscardDraft: vi.fn(),
      }),
    );

    expect(html).toContain('<strong>Welt</strong>');
    expect(html).toContain('<code>code</code>');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('assistant-chat__message--streaming');
    expect(html).not.toContain('assistant-chat__typing');
  });

  it('erkennt ob der Chat nah genug am unteren Rand ist', () => {
    expect(
      isAssistantChatNearBottom({
        clientHeight: 200,
        scrollHeight: 600,
        scrollTop: 360,
      }),
    ).toBe(true);

    expect(
      isAssistantChatNearBottom({
        clientHeight: 200,
        scrollHeight: 600,
        scrollTop: 300,
      }),
    ).toBe(false);
  });
});
