import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { useBetterSchoologyState } from '@/src/components/useSettings';
import { describeRoute, resolveRoute } from '@/src/schoology/router';
import { isSupportedSchoologyHost } from '@/src/utils/hosts';
import type { ThemeMode } from '@/src/types/settings';

const THEME_OPTIONS: Array<{ value: ThemeMode; label: string }> = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/**
 * The popup is for fast controls only.
 *
 * Master switch, theme, and the two Home feature toggles. Anything that needs
 * typing, per-course detail or explanation belongs in the customizer, which is
 * one button away.
 */
export default function App() {
  const { state, loading, setSettings } = useBetterSchoologyState();
  const currentPage = useCurrentPage();
  const version = browser.runtime.getManifest().version;

  const { enabled, theme, betterDashboard, betterTodo, compactCourseSwitcher, betterGrades } =
    state.settings;

  return (
    <div className="popup" data-disabled={!enabled}>
      <header className="popup__header">
        <div>
          <h1 className="popup__title">Better Schoology</h1>
          <p className="popup__page">{currentPage}</p>
        </div>
        <Switch
          label="Better Schoology enabled"
          checked={enabled}
          disabled={loading}
          onChange={(next) => void setSettings({ enabled: next })}
        />
      </header>

      <section className="popup__section" aria-label="Appearance">
        <h2 className="popup__section-title">Theme</h2>
        <div className="segmented" role="group" aria-label="Theme">
          {THEME_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className="segmented__option"
              aria-pressed={theme === option.value}
              disabled={loading || !enabled}
              onClick={() => void setSettings({ theme: option.value })}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <section className="popup__section" aria-label="Home">
        <h2 className="popup__section-title">Home</h2>
        <Row
          label="Better Dashboard"
          hint="Course-first home view"
          checked={betterDashboard}
          disabled={loading || !enabled}
          onChange={(next) => void setSettings({ betterDashboard: next })}
        />
        <Row
          label="Better To Do"
          hint="Everything due, grouped by when"
          checked={betterTodo}
          disabled={loading || !enabled}
          onChange={(next) => void setSettings({ betterTodo: next })}
        />
        <Row
          label="Course switcher"
          hint="Searchable course menu in the header"
          checked={compactCourseSwitcher}
          disabled={loading || !enabled}
          onChange={(next) => void setSettings({ compactCourseSwitcher: next })}
        />
      </section>

      <section className="popup__section" aria-label="Grades">
        <h2 className="popup__section-title">Grades</h2>
        <Row
          label="Better Grades"
          hint="Summary, weights and what-if scores"
          checked={betterGrades}
          disabled={loading || !enabled}
          onChange={(next) => void setSettings({ betterGrades: next })}
        />
      </section>

      <footer className="popup__footer">
        <button
          type="button"
          className="popup__customize"
          onClick={() => void browser.runtime.openOptionsPage()}
        >
          Customize
        </button>
        <span className="popup__version">{version}</span>
      </footer>
    </div>
  );
}

/** Reads the active tab's URL to name the page the student is looking at. */
function useCurrentPage(): string {
  const [label, setLabel] = useState('Checking page…');

  useEffect(() => {
    let cancelled = false;

    void browser.tabs
      .query({ active: true, currentWindow: true })
      .then((tabs) => {
        if (cancelled) return;
        const url = tabs[0]?.url;
        if (!url) return setLabel('Not a Schoology page');

        try {
          const parsed = new URL(url);
          // The popup has no build-mode context for the page, so allow the
          // fixture host here too: naming a page is harmless either way.
          if (!isSupportedSchoologyHost(parsed.hostname, true)) {
            return setLabel('Not a Schoology page');
          }
          setLabel(describeRoute(resolveRoute(parsed).type));
        } catch {
          setLabel('Not a Schoology page');
        }
      })
      .catch(() => {
        if (!cancelled) setLabel('Page unknown');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return label;
}

interface SwitchProps {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}

function Switch({ label, checked, disabled, onChange }: SwitchProps) {
  return (
    <button
      type="button"
      className="switch"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="switch__track" />
    </button>
  );
}

interface RowProps extends SwitchProps {
  hint?: string;
}

function Row({ label, hint, checked, disabled, onChange }: RowProps) {
  return (
    <div className="row">
      <div className="row__text">
        <span className="row__label">{label}</span>
        {hint ? <span className="row__hint">{hint}</span> : null}
      </div>
      <Switch label={label} checked={checked} disabled={disabled} onChange={onChange} />
    </div>
  );
}
