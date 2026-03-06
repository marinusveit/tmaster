import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { writeMcpConfig } from '@main/orchestrator/mcpConfig';

const createTempDir = (): string => {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tmaster-mcp-config-'));
};

describe('writeMcpConfig', () => {
  it('schreibt gueltige Config wenn Script existiert', () => {
    const tempDir = createTempDir();
    try {
      const scriptPath = path.join(tempDir, 'mcp-server.js');
      fs.writeFileSync(scriptPath, 'process.exit(0);', 'utf8');

      const configPath = writeMcpConfig(tempDir, scriptPath);
      const written = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
        mcpServers: { tmaster: { command: string; args: string[] } };
      };

      expect(written.mcpServers.tmaster.command).toBe('node');
      expect(written.mcpServers.tmaster.args).toEqual([scriptPath]);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('wirft Fehler wenn Script fehlt', () => {
    const tempDir = createTempDir();
    try {
      expect(() => writeMcpConfig(tempDir, path.join(tempDir, 'missing.js'))).toThrow('not found');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
