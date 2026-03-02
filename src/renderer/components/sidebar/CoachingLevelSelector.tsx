import type { CoachingLevel } from '@shared/types/assistant';

interface CoachingLevelSelectorProps {
  level: CoachingLevel;
  onChange: (level: CoachingLevel) => void;
}

const LEVELS: Array<{ level: CoachingLevel; icon: string; label: string; description: string }> = [
  {
    level: 'observe',
    icon: '👀',
    label: 'Beobachten',
    description: 'Nur kritische Hinweise anzeigen.',
  },
  {
    level: 'suggest',
    icon: '💬',
    label: 'Vorschlagen',
    description: 'Kontext- und Idle-Tipps einblenden.',
  },
  {
    level: 'coach',
    icon: '🎓',
    label: 'Coaching',
    description: 'Proaktive Workflow-Empfehlungen aktivieren.',
  },
  {
    level: 'act',
    icon: '🤖',
    label: 'Handeln',
    description: 'Aktive Analyse-Vorschläge priorisieren.',
  },
];

export const CoachingLevelSelector = ({ level, onChange }: CoachingLevelSelectorProps): JSX.Element => {
  return (
    <div className="assistant-coaching" role="tablist" aria-label="Coaching Level">
      {LEVELS.map((item) => (
        <button
          key={item.level}
          className={`assistant-coaching__item${item.level === level ? ' assistant-coaching__item--active' : ''}`}
          onClick={() => onChange(item.level)}
          title={item.description}
          type="button"
        >
          <span aria-hidden="true">{item.icon}</span>
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
};
