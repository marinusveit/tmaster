import type { CSSProperties, RefObject } from 'react';

interface TerminalContextMenuProps {
  x: number;
  y: number;
  menuRef: RefObject<HTMLDivElement>;
  onCopyAll: () => void;
  onCopyVisible: () => void;
  onSave: () => void;
}

const getMenuStyle = (x: number, y: number): CSSProperties => {
  return {
    left: `${x}px`,
    top: `${y}px`,
  };
};

export const TerminalContextMenu = ({
  x,
  y,
  menuRef,
  onCopyAll,
  onCopyVisible,
  onSave,
}: TerminalContextMenuProps): JSX.Element => {
  return (
    <div
      className="terminal-context-menu"
      ref={menuRef}
      role="menu"
      style={getMenuStyle(x, y)}
      onContextMenu={(event) => event.preventDefault()}
    >
      <button className="terminal-context-menu__item" onClick={onCopyAll} role="menuitem" type="button">
        In Zwischenablage kopieren
      </button>
      <button className="terminal-context-menu__item" onClick={onCopyVisible} role="menuitem" type="button">
        Sichtbaren Bereich kopieren
      </button>
      <button className="terminal-context-menu__item" onClick={onSave} role="menuitem" type="button">
        Als Datei speichern
      </button>
    </div>
  );
};
