import { useCallback } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';

interface SplitResizerProps {
  direction: 'horizontal' | 'vertical';
  onResize: (ratio: number) => void;
}

const MIN_RATIO = 0.2;
const MAX_RATIO = 0.8;

const clampRatio = (ratio: number): number => {
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, ratio));
};

export const SplitResizer = ({ direction, onResize }: SplitResizerProps): JSX.Element => {
  const onMouseDown = useCallback((event: ReactMouseEvent<HTMLButtonElement>) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    const currentTarget = event.currentTarget;
    const container = currentTarget.parentElement;
    if (!container) {
      return;
    }

    const onMouseMove = (moveEvent: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      if (direction === 'horizontal') {
        const relativeX = (moveEvent.clientX - rect.left) / rect.width;
        onResize(clampRatio(relativeX));
        return;
      }

      const relativeY = (moveEvent.clientY - rect.top) / rect.height;
      onResize(clampRatio(relativeY));
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      document.body.classList.remove('is-resizing-split--horizontal', 'is-resizing-split--vertical');
    };

    document.body.classList.add(
      direction === 'horizontal' ? 'is-resizing-split--horizontal' : 'is-resizing-split--vertical',
    );
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [direction, onResize]);

  const onDoubleClick = useCallback(() => {
    onResize(0.5);
  }, [onResize]);

  return (
    <button
      type="button"
      className={`split-resizer split-resizer--${direction}`}
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      aria-label="Split ratio anpassen"
      title="Drag zum Resizen, Doppelklick fuer 50/50"
    />
  );
};
