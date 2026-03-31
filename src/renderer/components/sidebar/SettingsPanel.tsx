import { useEffect, useMemo, useState } from 'react';
import {
  findConflictingKeybindingAction,
  formatShortcutForDisplay,
  getKeybindingDefinition,
  serializeKeyboardShortcut,
} from '../../../common/keybindings';
import { useKeybindingStore } from '@renderer/stores/keybindingStore';
import { useSettingsStore } from '@renderer/stores/settingsStore';
import {
  DEFAULT_KEYBINDINGS,
  KEYBINDING_DEFINITIONS,
  type KeybindingAction,
} from '@shared/types/keybindings';
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

type SettingsSection = 'appearance' | 'shortcuts';

export const SettingsPanel = (): JSX.Element => {
  const preferences = useSettingsStore((state) => state.preferences);
  const isPanelOpen = useSettingsStore((state) => state.isPanelOpen);
  const isSavingPreferences = useSettingsStore((state) => state.isSaving);
  const togglePanel = useSettingsStore((state) => state.togglePanel);
  const updatePreference = useSettingsStore((state) => state.updatePreference);
  const keybindings = useKeybindingStore((state) => state.keybindings);
  const customKeybindings = useKeybindingStore((state) => state.customKeybindings);
  const loadKeybindings = useKeybindingStore((state) => state.loadKeybindings);
  const updateKeybinding = useKeybindingStore((state) => state.updateKeybinding);
  const resetKeybinding = useKeybindingStore((state) => state.resetKeybinding);
  const isSavingKeybindings = useKeybindingStore((state) => state.isSaving);
  const keybindingError = useKeybindingStore((state) => state.errorMessage);
  const clearKeybindingError = useKeybindingStore((state) => state.clearError);
  const [activeSection, setActiveSection] = useState<SettingsSection>('appearance');
  const [capturingAction, setCapturingAction] = useState<KeybindingAction | null>(null);
  const [captureWarning, setCaptureWarning] = useState<string | null>(null);

  useEffect(() => {
    if (isPanelOpen) {
      void loadKeybindings();
    }
  }, [isPanelOpen, loadKeybindings]);

  useEffect(() => {
    if (!capturingAction) {
      return;
    }

    const handleCapture = (event: KeyboardEvent): void => {
      event.preventDefault();

      if (event.key === 'Escape') {
        setCapturingAction(null);
        setCaptureWarning(null);
        clearKeybindingError();
        return;
      }

      const nextShortcut = serializeKeyboardShortcut(event);
      if (!nextShortcut) {
        setCaptureWarning('Use at least one modifier key for custom shortcuts.');
        return;
      }

      const conflictingAction = findConflictingKeybindingAction(capturingAction, nextShortcut, keybindings);
      if (conflictingAction) {
        const conflictingDefinition = getKeybindingDefinition(conflictingAction);
        setCaptureWarning(`${formatShortcutForDisplay(nextShortcut)} is already used by ${conflictingDefinition.label}.`);
        return;
      }

      setCaptureWarning(null);
      clearKeybindingError();
      void updateKeybinding(capturingAction, nextShortcut)
        .then(() => {
          setCapturingAction(null);
        })
        .catch(() => {
          // Fehlerzustand wird im Store gehalten und in der UI angezeigt.
        });
    };

    window.addEventListener('keydown', handleCapture, true);
    return () => window.removeEventListener('keydown', handleCapture, true);
  }, [capturingAction, clearKeybindingError, keybindings, updateKeybinding]);

  const isSaving = isSavingPreferences || isSavingKeybindings;
  const activeMessage = useMemo(() => {
    return captureWarning ?? keybindingError;
  }, [captureWarning, keybindingError]);

  return (
    <section className="settings-panel-shell" aria-label="Application Settings">
      <button
        aria-expanded={isPanelOpen}
        className={`settings-panel__teaser${isPanelOpen ? ' settings-panel__teaser--active' : ''}`}
        onClick={togglePanel}
        type="button"
      >
        <span className="settings-panel__teaser-icon">⚙</span>
        <span className="settings-panel__teaser-label">Settings</span>
        {isSaving && <span className="settings-panel__teaser-badge">Saving</span>}
      </button>

      {isPanelOpen && (
        <div className="settings-panel">
          <div className="settings-panel__section-tabs" role="tablist" aria-label="Settings Sections">
            <button
              aria-selected={activeSection === 'appearance'}
              className={`settings-panel__section-tab${
                activeSection === 'appearance' ? ' settings-panel__section-tab--active' : ''
              }`}
              onClick={() => setActiveSection('appearance')}
              role="tab"
              type="button"
            >
              Appearance
            </button>
            <button
              aria-selected={activeSection === 'shortcuts'}
              className={`settings-panel__section-tab${
                activeSection === 'shortcuts' ? ' settings-panel__section-tab--active' : ''
              }`}
              onClick={() => setActiveSection('shortcuts')}
              role="tab"
              type="button"
            >
              Shortcuts
            </button>
          </div>

          {activeSection === 'appearance' ? (
            <>
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
            </>
          ) : (
            <div className="settings-panel__shortcut-list" role="list">
              {KEYBINDING_DEFINITIONS.map((definition) => {
                const shortcut = keybindings[definition.action];
                const isCustom = customKeybindings[definition.action] !== undefined;
                const isCapturing = capturingAction === definition.action;

                return (
                  <div className="settings-panel__shortcut-card" key={definition.action} role="listitem">
                    <div className="settings-panel__shortcut-meta">
                      <span className="settings-panel__shortcut-title">{definition.label}</span>
                      <span className="settings-panel__shortcut-description">{definition.description}</span>
                    </div>
                    <div className="settings-panel__shortcut-actions">
                      <button
                        className={`settings-panel__shortcut-button${
                          isCapturing ? ' settings-panel__shortcut-button--capturing' : ''
                        }`}
                        onClick={() => {
                          setCapturingAction(definition.action);
                          setCaptureWarning(null);
                          clearKeybindingError();
                        }}
                        type="button"
                      >
                        {isCapturing ? 'Press new shortcut' : formatShortcutForDisplay(shortcut)}
                      </button>
                      <button
                        className="settings-panel__shortcut-reset"
                        disabled={!isCustom}
                        onClick={() => {
                          setCapturingAction(null);
                          setCaptureWarning(null);
                          clearKeybindingError();
                          void resetKeybinding(definition.action);
                        }}
                        type="button"
                      >
                        Reset
                      </button>
                    </div>
                    <div className="settings-panel__shortcut-footer">
                      <span className="settings-panel__shortcut-default">
                        Default: {formatShortcutForDisplay(DEFAULT_KEYBINDINGS[definition.action])}
                      </span>
                      {isCustom && <span className="settings-panel__shortcut-badge">Custom</span>}
                    </div>
                  </div>
                );
              })}
              <div className="settings-panel__shortcut-hint">
                Press <strong>Esc</strong> to cancel capture mode.
              </div>
              {activeMessage && <div className="settings-panel__shortcut-warning">{activeMessage}</div>}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
