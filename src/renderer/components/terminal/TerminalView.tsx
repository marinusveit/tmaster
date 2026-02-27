import { useEffect, useRef } from 'react';
import { transport } from '@renderer/transport';
import { getOrCreateTerminal } from '@renderer/components/terminal/terminalInstances';
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

    const { terminal, fitAddon, isOpened } = getOrCreateTerminal(terminalId);

    if (!isOpened) {
      // Erster Mount: Terminal im DOM öffnen
      terminal.open(container);
      // Marker setzen damit wir nicht nochmal open() aufrufen
      const cached = getOrCreateTerminal(terminalId);
      cached.isOpened = true;
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
      // Terminal wird NICHT disposed — lebt im Cache weiter.
      // Nur der ResizeObserver wird aufgeräumt.
    };
  }, [terminalId]);

  return <div className="terminal-view" ref={containerRef} />;
};
