const DEV_SERVER_KEYWORDS = ['vite', 'webpack', 'next', 'dev'] as const;

export type DetectedAgentType = 'claude' | 'codex' | 'devserver' | 'generic';

export const detectAgentType = (shell: string | null | undefined): DetectedAgentType => {
  if (!shell) {
    return 'generic';
  }

  const normalizedShell = shell.toLowerCase();
  if (normalizedShell.includes('claude')) {
    return 'claude';
  }

  if (normalizedShell.includes('codex')) {
    return 'codex';
  }

  if (DEV_SERVER_KEYWORDS.some((keyword) => normalizedShell.includes(keyword))) {
    return 'devserver';
  }

  return 'generic';
};
