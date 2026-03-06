import fs from 'node:fs';
import path from 'node:path';

interface McpConfig {
  mcpServers: {
    tmaster: {
      command: string;
      args: string[];
    };
  };
}

export const writeMcpConfig = (configDir: string, mcpServerScript: string): string => {
  if (!fs.existsSync(mcpServerScript)) {
    throw new Error(`MCP server script not found: ${mcpServerScript}`);
  }

  const configPath = path.join(configDir, 'tmaster-mcp-config.json');

  const config: McpConfig = {
    mcpServers: {
      tmaster: {
        command: 'node',
        args: [mcpServerScript],
      },
    },
  };

  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');

  return configPath;
};
