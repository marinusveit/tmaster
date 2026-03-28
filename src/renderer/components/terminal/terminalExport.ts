import { transport } from '@renderer/transport';
import type { TerminalExportScope, TerminalId } from '@shared/types/terminal';
import { readTerminalBuffer } from '@renderer/components/terminal/terminalInstances';

export const copyTerminalBuffer = async (
  terminalId: TerminalId,
  scope: TerminalExportScope,
): Promise<void> => {
  const content = readTerminalBuffer(terminalId, scope);
  await transport.invoke<void>('copyTerminalBuffer', {
    terminalId,
    content,
    scope,
  });
};

export const saveTerminalBuffer = async (
  terminalId: TerminalId,
  scope: TerminalExportScope,
): Promise<boolean> => {
  const content = readTerminalBuffer(terminalId, scope);
  return transport.invoke<boolean>('saveTerminalBuffer', {
    terminalId,
    content,
    scope,
  });
};
