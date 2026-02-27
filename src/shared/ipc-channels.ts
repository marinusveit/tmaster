export const IPC_CHANNELS = {
  terminalCreate: 'terminal:create',
  terminalWrite: 'terminal:write',
  terminalResize: 'terminal:resize',
  terminalClose: 'terminal:close',
  terminalData: 'terminal:data',
  terminalExit: 'terminal:exit',
  terminalList: 'terminal:list',
  terminalStatus: 'terminal:status',
  workspaceCreate: 'workspace:create',
  workspaceList: 'workspace:list',
  workspaceSwitch: 'workspace:switch',
  workspaceUpdate: 'workspace:update',
  sessionList: 'session:list',
  terminalEvent: 'terminal:event',
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
