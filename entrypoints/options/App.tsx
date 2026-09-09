import { useMemo, useState } from 'react';
import { browser } from 'wxt/browser';
import { useBetterSchoologyState } from '@/src/components/useSettings';
import { resolveAllCourses } from '@/src/storage/courses';
import type { AppsVisibility, Density, HomeView, ThemeMode } from '@/src/types/settings';
import CourseCard from './CourseCard';

type Section = 'appearance' | 'home' | 'course-pages' | 'courses' | 'about';

const SECTIONS: Array<{ id: Section; label: string }> = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'home', label: 'Home' },
  { id: 'course-pages', label: 'Course pages' },
  { id: 'courses', label: 'My courses' },
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
                hint="A course-first home page: your courses, then what’s due, then what happened. Schoology’s feed is only hidden, never removed — the Feed tab brings it straight back."
                checked={state.settings.betterDashboard}
                disabled={loading}
                onChange={(next) => void setSettings({ betterDashboard: next })}
              />
              <Toggle
                label="Better To Do"
                hint="Shows every upcoming and overdue item Schoology returns, not just the first few, grouped by when it is due."
                checked={state.settings.betterTodo}
                disabled={loading}
                onChange={(next) => void setSettings({ betterTodo: next })}
              />
              <Toggle
                label="Compact course switcher"
                hint="A searchable course menu in the Schoology header, using your custom names and pinned order. Schoology’s own Courses menu is left exactly as it is."
                checked={state.settings.compactCourseSwitcher}
                disabled={loading}
                onChange={(next) => void setSettings({ compactCourseSwitcher: next })}
              />

              <Choice<HomeView>
                legend="Opens on"
                hint="Which view Better Home shows first. Both are always one click apart."
                value={state.settings.defaultHomeView}
                disabled={loading}
                options={[
                  { value: 'dashboard', label: 'Dashboard' },
                  { value: 'feed', label: 'Feed' },
                ]}
                onChange={(next) => void setSettings({ defaultHomeView: next })}
              />

              <Choice<Density>
                legend="Course cards"
                hint="Comfortable cards show more of each course; compact fits more courses on screen."
                value={state.settings.courseCardDensity}
                disabled={loading}
                options={[
                  { value: 'comfortable', label: 'Comfortable' },
                  { value: 'compact', label: 'Compact' },
                ]}
                onChange={(next) => void setSettings({ courseCardDensity: next })}
              />

              <Toggle
                label="Announcements panel"
                hint="A short summary of Recent Activity beside your To Do list. Turning it off does not hide anything in Schoology’s own feed."
                checked={state.settings.showAnnouncements}
                disabled={loading}
                onChange={(next) => void setSettings({ showAnnouncements: next })}
              />
              <Toggle
                label="Grade summary tile"
                hint="Reserves a place on the dashboard for grade information. Better Schoology only fills it in once it can read your grades."
                checked={state.settings.showGpaWidget}
                disabled={loading}
                onChange={(next) => void setSettings({ showGpaWidget: next })}
              />
            </Panel>
          ) : null}

          {section === 'course-pages' ? (
            <Panel
              title="Course pages"
              description="How course, materials and assignment pages are laid out."
            >
              <Toggle
                label="Better course pages"
                hint="A clear course header with your own course name, and the course’s own sections — Materials, Updates, Grades, Members — as one compact nav. Schoology’s left menu stays exactly as it is."
                checked={state.settings.betterCourses}
                disabled={loading}
                onChange={(next) => void setSettings({ betterCourses: next })}
              />
              <Toggle
                label="Better assignment pages"
                hint="Reorganizes an assignment into one readable order. Schoology’s own submission panel is moved into place — never rebuilt — so submitting works exactly as it always did."
                checked={state.settings.betterAssignments}
                disabled={loading}
                onChange={(next) => void setSettings({ betterAssignments: next })}
              />

              <Choice<AppsVisibility>
                legend="Third-party apps"
                hint="Installed apps can push Materials and Grades below the fold. Collapsing them changes nothing about the apps themselves — no URL, no behaviour."
                value={state.settings.appsVisibility}
                disabled={loading}
                options={[
                  { value: 'collapse', label: 'Collapse' },
                  { value: 'show', label: 'Show' },
                  { value: 'hide', label: 'Hide' },
                ]}
                onChange={(next) => void setSettings({ appsVisibility: next })}
              />

              <Choice<Density>
                legend="Materials"
                hint="Compact drops material descriptions and tightens the rows."
                value={state.settings.materialDensity}
                disabled={loading}
                options={[
                  { value: 'comfortable', label: 'Comfortable' },
                  { value: 'compact', label: 'Compact' },
                ]}
                onChange={(next) => void setSettings({ materialDensity: next })}
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

function Choice<T extends string>({
  legend,
  hint,
  value,
  options,
  disabled,
  onChange,
}: {
  legend: string;
  hint: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  disabled?: boolean;
  onChange: (next: T) => void;
}) {
  return (
    <fieldset className="choice" disabled={disabled}>
      <legend className="choice__legend">{legend}</legend>
      <div className="choice__options" role="group">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className="choice__option"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className="choice__hint">{hint}</p>
    </fieldset>
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
