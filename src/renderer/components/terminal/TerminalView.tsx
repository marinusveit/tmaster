import { useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import type { TerminalExportScope, TerminalId } from '@shared/types/terminal';
import { transport } from '@renderer/transport';
import {
  disableTerminalWebgl,
  enableTerminalWebgl,
  getOrCreateTerminal,
} from '@renderer/components/terminal/terminalInstances';
import { TerminalContextMenu } from '@renderer/components/terminal/TerminalContextMenu';
import { useTerminalStore } from '@renderer/stores/terminalStore';

interface TerminalViewProps {
  terminalId: TerminalId;
  onCopyBuffer: (terminalId: TerminalId, scope: TerminalExportScope) => void;
  onSaveBuffer: (terminalId: TerminalId, scope: TerminalExportScope) => void;
}

interface ContextMenuState {
  x: number;
  y: number;
}

const CONTEXT_MENU_WIDTH = 224;
const CONTEXT_MENU_HEIGHT = 132;
const CONTEXT_MENU_PADDING = 8;

export const TerminalView = ({
  terminalId,
  onCopyBuffer,
  onSaveBuffer,
}: TerminalViewProps): JSX.Element => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const protectionWarning = useTerminalStore((state) => state.terminals.get(terminalId)?.protection.warning ?? null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const cachedTerminal = getOrCreateTerminal(terminalId);
    const { terminal, fitAddon, isOpened } = cachedTerminal;

    if (!isOpened) {
      // Erster Mount: Terminal im DOM öffnen
      terminal.open(container);
      // Marker setzen damit wir nicht nochmal open() aufrufen
      cachedTerminal.isOpened = true;
    } else if (terminal.element && terminal.element.parentElement !== container) {
      // Remount: DOM-Element in den neuen Container verschieben
      container.appendChild(terminal.element);
    }

    enableTerminalWebgl(cachedTerminal);
    fitAddon.fit();

    // Initiale Größe an PTY melden
    if (terminal.cols > 0 && terminal.rows > 0) {
      void transport.invoke<void>('resizeTerminal', {
        terminalId,
        cols: terminal.cols,
        rows: terminal.rows,
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

        if (terminal.cols > 0 && terminal.rows > 0) {
          void transport.invoke<void>('resizeTerminal', {
            terminalId,
            cols: terminal.cols,
            rows: terminal.rows,
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
      disableTerminalWebgl(terminalId);
      // Terminal wird NICHT disposed — lebt im Cache weiter.
      // Nur der ResizeObserver wird aufgeräumt.
    };
  }, [terminalId]);

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    const closeContextMenu = (): void => {
      setContextMenu(null);
    };

    const handlePointerDown = (event: MouseEvent): void => {
      if (menuRef.current?.contains(event.target as Node)) {
        return;
      }

      closeContextMenu();
    };

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        closeContextMenu();
      }
    };

    const handleScroll = (): void => {
      closeContextMenu();
    };

    window.addEventListener('mousedown', handlePointerDown, true);
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      window.removeEventListener('mousedown', handlePointerDown, true);
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [contextMenu]);

  const closeContextMenu = (): void => {
    setContextMenu(null);
  };

  const handleContextMenu = (event: ReactMouseEvent<HTMLDivElement>): void => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    event.preventDefault();

    const bounds = container.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    setContextMenu({
      x: Math.max(
        CONTEXT_MENU_PADDING,
        Math.min(x, container.clientWidth - CONTEXT_MENU_WIDTH - CONTEXT_MENU_PADDING),
      ),
      y: Math.max(
        CONTEXT_MENU_PADDING,
        Math.min(y, container.clientHeight - CONTEXT_MENU_HEIGHT - CONTEXT_MENU_PADDING),
      ),
    });
  };

  const handleCopyAll = (): void => {
    closeContextMenu();
    onCopyBuffer(terminalId, 'full');
  };

  const handleCopyVisible = (): void => {
    closeContextMenu();
    onCopyBuffer(terminalId, 'visible');
  };

  const handleSave = (): void => {
    closeContextMenu();
    onSaveBuffer(terminalId, 'full');
  };

  return (
    <div className="terminal-view" onContextMenu={handleContextMenu} ref={containerRef}>
      {protectionWarning && (
        <div className="terminal-protection-banner" role="status">
          {protectionWarning}
        </div>
      )}
      {contextMenu ? (
        <TerminalContextMenu
          menuRef={menuRef}
          onCopyAll={handleCopyAll}
          onCopyVisible={handleCopyVisible}
          onSave={handleSave}
          x={contextMenu.x}
          y={contextMenu.y}
        />
      ) : null}
    </div>
  );
};
