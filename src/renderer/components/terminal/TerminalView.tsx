import { useEffect, useRef } from 'react';
import type { TerminalSessionInfo } from '@shared/types/terminal';
import { transport } from '@renderer/transport';
import {
  disableTerminalWebgl,
  enableTerminalWebgl,
  getOrCreateTerminal,
} from '@renderer/components/terminal/terminalInstances';

interface TerminalViewProps {
  terminal: TerminalSessionInfo;
}

export const TerminalView = ({ terminal }: TerminalViewProps): JSX.Element => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const warning = terminal.protection?.warning;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const cachedTerminal = getOrCreateTerminal(terminal);
    const { terminal: xterm, fitAddon, isOpened } = cachedTerminal;
    enableTerminalWebgl(cachedTerminal);

    if (!isOpened) {
      // Erster Mount: Terminal im DOM öffnen
      xterm.open(container);
      // Marker setzen damit wir nicht nochmal open() aufrufen
      cachedTerminal.isOpened = true;
    } else if (xterm.element && xterm.element.parentElement !== container) {
      // Remount: DOM-Element in den neuen Container verschieben
      container.appendChild(xterm.element);
    }

    fitAddon.fit();

    // Initiale Größe an PTY melden
    if (xterm.cols > 0 && xterm.rows > 0) {
      void transport.invoke<void>('resizeTerminal', {
        terminalId: terminal.terminalId,
        cols: xterm.cols,
        rows: xterm.rows,
      });
    }

    let resizeRafId: number | null = null;
    const observer = new ResizeObserver(() => {
      // Debounce via rAF um Layout-Thrashing bei schnellem Resize zu vermeiden
      if (resizeRafId !== null) {
        return;
      }
      resizeRafId = requestAnimationFrame(() => {
        resizeRafId = null;
        // Nur fitten wenn Container sichtbar ist (nicht display:none)
        if (container.offsetWidth === 0 && container.offsetHeight === 0) {
          return;
        }

        fitAddon.fit();

        if (xterm.cols > 0 && xterm.rows > 0) {
          void transport.invoke<void>('resizeTerminal', {
            terminalId: terminal.terminalId,
            cols: xterm.cols,
            rows: xterm.rows,
          });
        }
      });
    });

    observer.observe(container);

    return () => {
      if (resizeRafId !== null) {
        cancelAnimationFrame(resizeRafId);
      }
      observer.disconnect();
      disableTerminalWebgl(terminal.terminalId);
      // Terminal wird NICHT disposed — lebt im Cache weiter.
      // Nur der ResizeObserver wird aufgeräumt.
    };
  }, [terminal]);

  return (
    <div className="terminal-view-shell">
      {warning ? (
        <div className="terminal-view__warning" role="status" aria-live="polite">
          {warning}
        </div>
      ) : null}
      <div className="terminal-view" ref={containerRef} />
    </div>
  );
};
