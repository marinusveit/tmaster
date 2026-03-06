import { describe, expect, it } from 'vitest';
import { detectAgentType } from '../../src/common/agent/detectAgentType';

describe('detectAgentType', () => {
  it('erkennt claude und codex', () => {
    expect(detectAgentType('claude')).toBe('claude');
    expect(detectAgentType('/usr/local/bin/codex')).toBe('codex');
  });

  it('erkennt Dev-Server Shells', () => {
    expect(detectAgentType('pnpm dev')).toBe('devserver');
    expect(detectAgentType('vite')).toBe('devserver');
  });

  it('faellt auf generic zurueck', () => {
    expect(detectAgentType(null)).toBe('generic');
    expect(detectAgentType(undefined)).toBe('generic');
    expect(detectAgentType('/bin/bash')).toBe('generic');
  });
});
