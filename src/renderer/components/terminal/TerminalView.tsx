import { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import type { TerminalId } from '@shared/types/terminal';

interface TerminalViewProps {
  terminalId: TerminalId;
}

export const TerminalView = ({ terminalId }: TerminalViewProps): JSX.Element => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const terminal = new Terminal({
      cursorBlink: true,
      scrollback: 5000,
      fontFamily: 'JetBrains Mono, monospace',
      theme: {
        background: '#101014',
        foreground: '#e6e6ec',
      },
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    try {
      terminal.loadAddon(new WebglAddon());
    } catch {
      // WebGL ist optional: Terminal bleibt mit Canvas-Renderer funktionsfähig.
    }

    terminal.open(container);
    fitAddon.fit();

    void window.tmaster.resizeTerminal({
      terminalId,
      cols: terminal.cols,
      rows: terminal.rows,
    });

    const dataSubscription = terminal.onData((data) => {
      void window.tmaster.writeTerminal({ terminalId, data });
    });

    const dataCleanup = window.tmaster.onTerminalData((event) => {
      if (event.terminalId !== terminalId) {
        return;
      }

      terminal.write(event.data);
    });

    const exitCleanup = window.tmaster.onTerminalExit((event) => {
      if (event.terminalId !== terminalId) {
        return;
      }

      terminal.write('\r\n\x1b[33m[process exited]\x1b[0m\r\n');
    });

    const observer = new ResizeObserver(() => {
      fitAddon.fit();
      void window.tmaster.resizeTerminal({
        terminalId,
        cols: terminal.cols,
        rows: terminal.rows,
      });
    });

    observer.observe(container);

    return () => {
      observer.disconnect();
      dataCleanup();
      exitCleanup();
      dataSubscription.dispose();
      terminal.dispose();
    };
  }, [terminalId]);

  return <div className="terminal-view" ref={containerRef} />;
};
