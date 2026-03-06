import { useEffect, useRef } from 'react';
import type { TerminalId } from '@shared/types/terminal';
import { transport } from '@renderer/transport';
import {
  disableTerminalWebgl,
  enableTerminalWebgl,
  getOrCreateTerminal,
} from '@renderer/components/terminal/terminalInstances';

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

    const cachedTerminal = getOrCreateTerminal(terminalId);
    const { terminal, fitAddon, isOpened } = cachedTerminal;
    enableTerminalWebgl(cachedTerminal);

    if (!isOpened) {
      // Erster Mount: Terminal im DOM öffnen
      terminal.open(container);
      // Marker setzen damit wir nicht nochmal open() aufrufen
      cachedTerminal.isOpened = true;
    } else if (terminal.element && terminal.element.parentElement !== container) {
      // Remount: DOM-Element in den neuen Container verschieben
      container.appendChild(terminal.element);
    }

    fitAddon.fit();

    // Initiale Größe an PTY melden
    if (terminal.cols > 0 && terminal.rows > 0) {
      void transport.invoke<void>('resizeTerminal', {
        terminalId,
        cols: terminal.cols,
        rows: terminal.rows,
      });
    }

    const observer = new ResizeObserver(() => {
      // Nur fitten wenn Container sichtbar ist (nicht display:none)
      if (container.offsetWidth === 0 && container.offsetHeight === 0) {
        return;
      }

      fitAddon.fit();

      if (terminal.cols > 0 && terminal.rows > 0) {
        void transport.invoke<void>('resizeTerminal', {
          terminalId,
          cols: terminal.cols,
          rows: terminal.rows,
        });
      }
    });

    observer.observe(container);

    return () => {
      observer.disconnect();
      disableTerminalWebgl(terminalId);
      // Terminal wird NICHT disposed — lebt im Cache weiter.
      // Nur der ResizeObserver wird aufgeräumt.
    };
  }, [terminalId]);

  return <div className="terminal-view" ref={containerRef} />;
};
