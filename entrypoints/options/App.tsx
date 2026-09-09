import { useMemo, useState } from 'react';
import { browser } from 'wxt/browser';
import { useBetterSchoologyState } from '@/src/components/useSettings';
import { resolveAllCourses } from '@/src/storage/courses';
import type { NavLabelCustomization, ThemeMode } from '@/src/types/settings';
import CourseCard from './CourseCard';

type Section = 'appearance' | 'profile' | 'top-nav' | 'home' | 'courses' | 'assignments' | 'splash' | 'about';

const SECTIONS: Array<{ id: Section; label: string }> = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'profile', label: 'Profile' },
  { id: 'top-nav', label: 'Top nav' },
  { id: 'home', label: 'Dashboard' },
  { id: 'courses', label: 'Courses' },
  { id: 'assignments', label: 'Hidden assignments' },
  { id: 'splash', label: 'Splash text' },
  { id: 'about', label: 'About' },
];

const NAV_LABELS: Array<{ key: keyof NavLabelCustomization; label: string }> = [
  { key: 'courses', label: 'Courses' },
  { key: 'groups', label: 'Groups' },
  { key: 'resources', label: 'Resources' },
  { key: 'gradeReport', label: 'Grade Report' },
];

const THEMES: Array<{ value: ThemeMode; label: string; hint: string }> = [
  { value: 'system', label: 'System', hint: 'Follow your operating system' },
  { value: 'light', label: 'Light', hint: 'Schoology’s own appearance' },
  { value: 'dark', label: 'Dark', hint: 'Better Schoology dark theme' },
];

export default function App() {
  const { state, loading, setSettings, setCustomization, clearCustomization, restoreHiddenTask, resetHistory } =
    useBetterSchoologyState();
  const [section, setSection] = useState<Section>('appearance');
  const [showHiddenCourses, setShowHiddenCourses] = useState(false);
  const [historyReset, setHistoryReset] = useState(false);

  const courses = useMemo(() => resolveAllCourses(state), [state]);
  const visibleCourses = courses.filter((course) => showHiddenCourses || !course.hidden);
  const hiddenCourseCount = courses.filter((course) => course.hidden).length;
  const hiddenTasks = Object.values(state.hiddenTasks);
  const version = browser.runtime.getManifest().version;

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <h1 className="page__title">Better Schoology</h1>
          {state.settings.displayNameOverride ? (
            <p className="page__subtitle">Your customizer, {state.settings.displayNameOverride}</p>
          ) : null}
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

          {section === 'profile' ? (
            <Panel title="Profile" description="Choose the name shown in Better Schoology.">
              <TextSetting
                label="Display name"
                hint="Used in your dashboard and splash text. Leave blank to use your visible Schoology name."
                value={state.settings.displayNameOverride}
                placeholder="Your chosen name"
                maxLength={80}
                disabled={loading}
                onCommit={(value) => void setSettings({ displayNameOverride: value })}
              />
              <Toggle
                label="Apply display name to Schoology header"
                hint="Also changes the visible name in the existing account menu. Your account, profile link and submission identity stay the same."
                checked={state.settings.applyDisplayNameToSchoologyHeader}
                disabled={loading}
                onChange={(next) => void setSettings({ applyDisplayNameToSchoologyHeader: next })}
              />
            </Panel>
          ) : null}

          {section === 'top-nav' ? (
            <Panel title="Top nav" description="Rename Schoology navigation labels on this device.">
              <div className="settings-fields">
                {NAV_LABELS.map(({ key, label }) => (
                  <TextSetting
                    key={key}
                    label={`${label} label`}
                    value={state.settings.navLabels[key]}
                    placeholder={label}
                    maxLength={40}
                    disabled={loading}
                    onCommit={(value) => void setSettings({ navLabels: { [key]: value } })}
                  />
                ))}
              </div>
              <button
                type="button"
                className="btn settings-action"
                disabled={loading}
                onClick={() => void setSettings({ navLabels: {
                  courses: undefined, groups: undefined, resources: undefined, gradeReport: undefined,
                } })}
              >
                Reset labels
              </button>
            </Panel>
          ) : null}

          {section === 'home' ? (
            <Panel title="Dashboard" description="Choose the sections that appear on your home page.">
              <Toggle
                label="Better Dashboard"
                hint="Show the Better Schoology dashboard. Switch to Feed any time to see native updates."
                checked={state.settings.betterDashboard}
                disabled={loading}
                onChange={(next) => void setSettings({ betterDashboard: next })}
              />
              <Toggle
                label="Enable Better To Do"
                hint="Enhance upcoming and overdue work in both Dashboard and Feed."
                checked={state.settings.betterTodo}
                disabled={loading}
                onChange={(next) => void setSettings({ betterTodo: next })}
              />
              {([
                ['showTodo', 'Show Better To Do', 'Upcoming and overdue assignments on your dashboard.'],
                ['showNotifications', 'Show Notifications', 'Schoology notifications, or the native notification count when that is all Schoology provides.'],
                ['showRecentFeedback', 'Show Recent Feedback', 'Grades and teacher feedback available from Schoology.'],
                ['showAnnouncements', 'Show Announcements', 'Updates already available in your native feed.'],
              ] as const).map(([key, label, hint]) => (
                <Toggle
                  key={key}
                  label={label}
                  hint={hint}
                  checked={state.settings.dashboard[key]}
                  disabled={loading}
                  onChange={(next) => void setSettings({ dashboard: { [key]: next } })}
                />
              ))}
              <Toggle
                label="Hide work from hidden courses"
                hint="Also leave tasks from hidden courses out of Better To Do and dashboard counts."
                checked={state.settings.dashboard.hideHiddenCourseTasks}
                disabled={loading}
                onChange={(next) => void setSettings({ dashboard: { hideHiddenCourseTasks: next } })}
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

              <Toggle
                label={`Show hidden courses (${hiddenCourseCount})`}
                hint="View hidden courses and uncheck Hide from dashboard to restore them."
                checked={showHiddenCourses}
                onChange={setShowHiddenCourses}
              />

              {courses.length === 0 ? (
                <p className="empty">
                  No courses discovered yet. Visit your Schoology <strong>Grades</strong> page once
                  and Better Schoology will list your courses here.
                </p>
              ) : (
                <div className="course-list">
                  {visibleCourses.length === 0 ? (
                    <p className="empty">All your courses are hidden. Turn on Show hidden courses to restore one.</p>
                  ) : null}
                  {visibleCourses.map((course) => (
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

          {section === 'assignments' ? (
            <Panel title="Hidden assignments" description="Restore work you hid from Better Schoology. Native Schoology assignments remain available.">
              {hiddenTasks.length === 0 ? (
                <p className="empty">No hidden assignments.</p>
              ) : (
                <ul className="restore-list">
                  {hiddenTasks.map((task) => (
                    <li key={task.id} className="restore-list__item">
                      <span>{task.title}</span>
                      <button
                        type="button"
                        className="btn"
                        disabled={loading}
                        aria-label={`Restore ${task.title}`}
                        onClick={() => void restoreHiddenTask(task.id)}
                      >
                        Restore
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          ) : null}

          {section === 'splash' ? (
            <Panel title="Splash text" description="A little something at the top of your dashboard.">
              {([
                ['enabled', 'Enable splash text', 'Use a short rotating heading above the date.'],
                ['contextual', 'Contextual splashes', 'Match the time, day and available assignment or grade information.'],
                ['holidays', 'Holiday splashes', 'Use holiday lines only on their matching dates.'],
                ['easterEggs', 'Easter eggs', 'Occasional rare lines from the splash collection.'],
              ] as const).map(([key, label, hint]) => (
                <Toggle
                  key={key}
                  label={label}
                  hint={hint}
                  checked={state.settings.splash[key]}
                  disabled={loading || (key !== 'enabled' && !state.settings.splash.enabled)}
                  onChange={(next) => void setSettings({ splash: { [key]: next } })}
                />
              ))}
              <button
                type="button"
                className="btn settings-action"
                disabled={loading}
                onClick={() => void resetHistory().then(() => setHistoryReset(true))}
              >
                Reset splash history
              </button>
              <p className="field__hint" role="status">{historyReset ? 'Splash history cleared.' : 'The last ten splash IDs are remembered on this device to avoid repeats.'}</p>
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

function TextSetting({
  label, hint, value, placeholder, maxLength, disabled, onCommit,
}: {
  label: string;
  hint?: string;
  value?: string;
  placeholder: string;
  maxLength: number;
  disabled: boolean;
  onCommit: (value: string | undefined) => void;
}) {
  const [draft, setDraft] = useState(value ?? '');
  const [previousValue, setPreviousValue] = useState(value);
  if (previousValue !== value) {
    setPreviousValue(value);
    setDraft(value ?? '');
  }
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <input
        type="text"
        value={draft}
        placeholder={placeholder}
        maxLength={maxLength}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => onCommit(draft.trim() || undefined)}
        onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
      />
      {hint ? <span className="field__hint">{hint}</span> : null}
    </label>
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
