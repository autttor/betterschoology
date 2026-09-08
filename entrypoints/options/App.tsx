import { useMemo, useState } from 'react';
import { browser } from 'wxt/browser';
import { useBetterSchoologyState } from '@/src/components/useSettings';
import { resolveAllCourses } from '@/src/storage/courses';
import type { ThemeMode } from '@/src/types/settings';
import CourseCard from './CourseCard';

type Section = 'appearance' | 'home' | 'courses' | 'about';

const SECTIONS: Array<{ id: Section; label: string }> = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'home', label: 'Home' },
  { id: 'courses', label: 'Courses' },
  { id: 'about', label: 'About' },
];

const THEMES: Array<{ value: ThemeMode; label: string; hint: string }> = [
  { value: 'system', label: 'System', hint: 'Follow your operating system' },
  { value: 'light', label: 'Light', hint: 'Schoology’s own appearance' },
  { value: 'dark', label: 'Dark', hint: 'Better Schoology dark theme' },
];

export default function App() {
  const { state, loading, setSettings, setCustomization, clearCustomization } =
    useBetterSchoologyState();
  const [section, setSection] = useState<Section>('appearance');

  const courses = useMemo(() => resolveAllCourses(state), [state]);
  const version = browser.runtime.getManifest().version;

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <h1 className="page__title">Better Schoology</h1>
          <p className="page__subtitle">Version {version} · everything here stays on this device</p>
        </div>
      </header>

      <div className="page__body">
        <nav className="nav" aria-label="Settings sections">
          {SECTIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              className="nav__item"
              aria-current={section === item.id}
              onClick={() => setSection(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <main className="content">
          {section === 'appearance' ? (
            <Panel title="Appearance" description="How Schoology looks while Better Schoology is on.">
              <fieldset className="options" disabled={loading}>
                <legend className="options__legend">Theme</legend>
                {THEMES.map((theme) => (
                  <label key={theme.value} className="option">
                    <input
                      type="radio"
                      name="theme"
                      value={theme.value}
                      checked={state.settings.theme === theme.value}
                      onChange={() => void setSettings({ theme: theme.value })}
                    />
                    <span className="option__text">
                      <span className="option__label">{theme.label}</span>
                      <span className="option__hint">{theme.hint}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
            </Panel>
          ) : null}

          {section === 'home' ? (
            <Panel title="Home" description="Better Schoology’s home surfaces.">
              <Toggle
                label="Better Dashboard"
                hint="Adds a course-first dashboard above your home page. Schoology’s feed is only hidden, never removed — switch back any time."
                checked={state.settings.betterDashboard}
                disabled={loading}
                onChange={(next) => void setSettings({ betterDashboard: next })}
              />
              <Toggle
                label="Better To Do"
                hint="Shows every upcoming and overdue item Schoology returns, not just the first few. Schoology’s own To Do stays visible below it."
                checked={state.settings.betterTodo}
                disabled={loading}
                onChange={(next) => void setSettings({ betterTodo: next })}
              />
            </Panel>
          ) : null}

          {section === 'courses' ? (
            <Panel
              title="Courses"
              description="Personal overrides for how each course looks to you."
            >
              <p className="callout">
                These are <strong>local personal overrides</strong>. Renaming a course changes only
                what you see — your teacher, your classmates and Schoology itself are unaffected, and
                every link still points at the original course.
              </p>

              {courses.length === 0 ? (
                <p className="empty">
                  No courses discovered yet. Visit your Schoology <strong>Grades</strong> page once
                  and Better Schoology will list your courses here.
                </p>
              ) : (
                <div className="course-list">
                  {courses.map((course) => (
                    <CourseCard
                      key={course.id}
                      course={course}
                      customization={state.customizations[course.id]}
                      onChange={(patch) => void setCustomization(course.id, patch)}
                      onReset={() => void clearCustomization(course.id)}
                    />
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {section === 'about' ? (
            <Panel title="About" description="What Better Schoology is, and what it is not.">
              <h3 className="about__heading">Privacy</h3>
              <ul className="about__list">
                <li>No Better Schoology account, and no backend to sign in to.</li>
                <li>No analytics, no telemetry, no third-party requests.</li>
                <li>Your customizations are stored locally in this browser only.</li>
                <li>
                  Schoology requests stay between your browser and Schoology, using the session you
                  are already signed in with. Better Schoology never reads, stores or transmits your
                  credentials.
                </li>
              </ul>

              <h3 className="about__heading">Disclaimer</h3>
              <p className="about__text">
                Better Schoology is an independent project and is not affiliated with, endorsed by,
                or sponsored by PowerSchool or Schoology.
              </p>
            </Panel>
          ) : null}
        </main>
      </div>
    </div>
  );
}

function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel">
      <h2 className="panel__title">{title}</h2>
      <p className="panel__description">{description}</p>
      {children}
    </section>
  );
}

function Toggle({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="toggle">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="toggle__text">
        <span className="toggle__label">{label}</span>
        <span className="toggle__hint">{hint}</span>
      </span>
    </label>
  );
}
