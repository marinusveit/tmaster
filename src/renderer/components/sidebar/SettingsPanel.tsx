import { useSettingsStore } from '@renderer/stores/settingsStore';
import {
  TERMINAL_FONT_FAMILY_OPTIONS,
  TERMINAL_FONT_SIZE_RANGE,
  UI_SCALE_RANGE,
  type ThemePreference,
} from '@shared/types/preferences';

const THEME_OPTIONS: ReadonlyArray<{ value: ThemePreference; label: string }> = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'System' },
];

export const SettingsPanel = (): JSX.Element => {
  const preferences = useSettingsStore((state) => state.preferences);
  const isPanelOpen = useSettingsStore((state) => state.isPanelOpen);
  const isSaving = useSettingsStore((state) => state.isSaving);
  const togglePanel = useSettingsStore((state) => state.togglePanel);
  const updatePreference = useSettingsStore((state) => state.updatePreference);

  return (
    <section className="settings-panel-shell" aria-label="Appearance Settings">
      <button
        aria-expanded={isPanelOpen}
        className={`settings-panel__teaser${isPanelOpen ? ' settings-panel__teaser--active' : ''}`}
        onClick={togglePanel}
        type="button"
      >
        <span className="settings-panel__teaser-icon">⚙</span>
        <span className="settings-panel__teaser-label">Appearance</span>
        {isSaving && <span className="settings-panel__teaser-badge">Saving</span>}
      </button>

      {isPanelOpen && (
        <div className="settings-panel">
          <div className="settings-panel__section">
            <span className="settings-panel__label">Theme</span>
            <div className="settings-panel__theme-toggle" role="radiogroup" aria-label="Theme">
              {THEME_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  aria-checked={preferences.theme === option.value}
                  className={`settings-panel__theme-option${
                    preferences.theme === option.value ? ' settings-panel__theme-option--active' : ''
                  }`}
                  onClick={() => {
                    void updatePreference('theme', option.value);
                  }}
                  role="radio"
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <label className="settings-panel__section" htmlFor="settings-terminal-font-size">
            <span className="settings-panel__row">
              <span className="settings-panel__label">Terminal Font Size</span>
              <span className="settings-panel__value">{preferences.terminalFontSize}px</span>
            </span>
            <input
              className="settings-panel__range"
              id="settings-terminal-font-size"
              max={TERMINAL_FONT_SIZE_RANGE.max}
              min={TERMINAL_FONT_SIZE_RANGE.min}
              onChange={(event) => {
                void updatePreference('terminalFontSize', Number.parseInt(event.target.value, 10));
              }}
              step={TERMINAL_FONT_SIZE_RANGE.step}
              type="range"
              value={preferences.terminalFontSize}
            />
          </label>

          <label className="settings-panel__section" htmlFor="settings-terminal-font-family">
            <span className="settings-panel__row">
              <span className="settings-panel__label">Terminal Font</span>
            </span>
            <select
              className="settings-panel__select"
              id="settings-terminal-font-family"
              onChange={(event) => {
                void updatePreference('terminalFontFamily', event.target.value);
              }}
              value={preferences.terminalFontFamily}
            >
              {TERMINAL_FONT_FAMILY_OPTIONS.map((fontFamily) => (
                <option key={fontFamily} value={fontFamily}>
                  {fontFamily}
                </option>
              ))}
            </select>
          </label>

          <label className="settings-panel__section" htmlFor="settings-ui-scale">
            <span className="settings-panel__row">
              <span className="settings-panel__label">UI Scale</span>
              <span className="settings-panel__value">{preferences.uiScale}%</span>
            </span>
            <input
              className="settings-panel__range"
              id="settings-ui-scale"
              max={UI_SCALE_RANGE.max}
              min={UI_SCALE_RANGE.min}
              onChange={(event) => {
                void updatePreference('uiScale', Number.parseInt(event.target.value, 10));
              }}
              step={UI_SCALE_RANGE.step}
              type="range"
              value={preferences.uiScale}
            />
          </label>
        </div>
      )}
    </section>
  );
};
