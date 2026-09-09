import { useMemo, useState } from 'react';
import { browser } from 'wxt/browser';
import { useBetterSchoologyState } from '@/src/components/useSettings';
import { resolveAllCourses } from '@/src/storage/courses';
import type {
  AppsVisibility,
  Density,
  HomeView,
  NavLabelCustomization,
  ThemeMode,
} from '@/src/types/settings';
import CourseCard from './CourseCard';
import GradesPanel from './GradesPanel';

type Section =
  | 'appearance'
  | 'profile'
  | 'top-nav'
  | 'home'
  | 'course-pages'
  | 'grades'
  | 'courses'
  | 'hidden'
  | 'splash'
  | 'about';

const SECTIONS: Array<{ id: Section; label: string }> = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'profile', label: 'Profile' },
  { id: 'top-nav', label: 'Top nav' },
  { id: 'home', label: 'Dashboard' },
  { id: 'course-pages', label: 'Course pages' },
  { id: 'grades', label: 'Grades & GPA' },
  { id: 'courses', label: 'My courses' },
  { id: 'hidden', label: 'Hidden assignments' },
  { id: 'splash', label: 'Splash text' },
  { id: 'about', label: 'About' },
];

const NAV_LABELS: Array<{ key: keyof NavLabelCustomization; label: string }> = [
  { key: 'courses', label: 'Courses' },
  { key: 'groups', label: 'Groups' },
  { key: 'resources', label: 'Resources' },
  { key: 'gradeReport', label: 'Grade Report' },
];

/** Dashboard panels, in the order they appear on the page. */
const DASHBOARD_PANELS = [
  ['showTodo', 'To Do', 'Everything due, grouped by when. The centre of the dashboard.'],
  ['showGpa', 'Grade summary', 'A GPA tile, once Better Schoology has seen your grades.'],
  ['showNotifications', 'Notifications', 'Schoology notifications, or its own count when that is all it gives.'],
  ['showRecentFeedback', 'Recent feedback', 'Grades and teacher comments Schoology has posted lately.'],
  ['showAnnouncements', 'Announcements', 'A short summary of Recent Activity, beside your To Do.'],
] as const;

const THEMES: Array<{ value: ThemeMode; label: string; hint: string }> = [
  { value: 'system', label: 'System', hint: 'Follow your operating system' },
  { value: 'light', label: 'Light', hint: 'Schoology’s own appearance' },
  { value: 'dark', label: 'Dark', hint: 'Better Schoology dark theme' },
];

export default function App() {
  const {
    state,
    loading,
    setSettings,
    setCustomization,
    clearCustomization,
    setGpaConfig,
    setCourseGpa,
    forgetGrades,
    restoreHiddenTask,
    resetHistory,
  } = useBetterSchoologyState();
  const [section, setSection] = useState<Section>('appearance');
  const [historyReset, setHistoryReset] = useState(false);
  const [showHiddenCourses, setShowHiddenCourses] = useState(false);

  const courses = useMemo(() => resolveAllCourses(state), [state]);
  const hiddenTasks = useMemo(() => Object.values(state.hiddenTasks), [state]);
  const visibleCourses = courses.filter((course) => showHiddenCourses || !course.hidden);
  const hiddenCourseCount = courses.filter((course) => course.hidden).length;
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

              <h3 className="about__heading">Panels</h3>
              <p className="panel__description">
                What appears on the dashboard. Turning a panel off hides nothing in Schoology
                itself — everything stays where Schoology put it, under Feed.
              </p>
              {DASHBOARD_PANELS.map(([key, label, hint]) => (
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
                hint="Leaves tasks from courses you hid out of To Do and the dashboard counts too."
                checked={state.settings.dashboard.hideHiddenCourseTasks}
                disabled={loading}
                onChange={(next) => void setSettings({ dashboard: { hideHiddenCourseTasks: next } })}
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

          {section === 'grades' ? (
            <Panel
              title="Grades & GPA"
              description="Grade pages, and a GPA calculator built from numbers you control."
            >
              <Toggle
                label="Better grades"
                hint="A clear summary on grade pages, categories with their weights, and hypothetical scores. Schoology’s own report stays on the page, one toggle away."
                checked={state.settings.betterGrades}
                disabled={loading}
                onChange={(next) => void setSettings({ betterGrades: next })}
              />
              <Toggle
                label="GPA calculator"
                hint="Adds a GPA panel to the grades page and a tile to the dashboard, calculated by Better Schoology from your own scale."
                checked={state.settings.gpaEnabled}
                disabled={loading}
                onChange={(next) => void setSettings({ gpaEnabled: next })}
              />

              <GradesPanel
                state={state}
                courses={courses}
                onScaleChange={(scale) => void setGpaConfig({ scale })}
                onBoostsChange={(boosts) => void setGpaConfig({ boosts })}
                onCourseChange={(courseId, patch) => void setCourseGpa(courseId, patch)}
                onForgetGrades={() => void forgetGrades()}
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
                hint="A hidden course is still yours — this brings it back into view so you can un-hide it."
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
                    <p className="empty">
                      Every course is hidden. Turn on <strong>Show hidden courses</strong> to bring
                      one back.
                    </p>
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

          {section === 'profile' ? (
            <Panel title="Profile" description="The name Better Schoology calls you.">
              <TextSetting
                label="Display name"
                hint="Used on your dashboard. Leave blank to use the name Schoology already shows."
                value={state.settings.displayNameOverride}
                placeholder="Your chosen name"
                maxLength={80}
                disabled={loading}
                onCommit={(value) => void setSettings({ displayNameOverride: value })}
              />
              <Toggle
                label="Use it in Schoology’s header too"
                hint="Changes only the name drawn in the account menu on this device. Your account, your profile link and the identity attached to anything you submit are untouched."
                checked={state.settings.applyDisplayNameToSchoologyHeader}
                disabled={loading}
                onChange={(next) => void setSettings({ applyDisplayNameToSchoologyHeader: next })}
              />
            </Panel>
          ) : null}

          {section === 'top-nav' ? (
            <Panel
              title="Top nav"
              description="Rename Schoology’s own header links. Local to this device; every link still goes where it always did."
            >
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
                onClick={() =>
                  void setSettings({
                    navLabels: {
                      courses: undefined,
                      groups: undefined,
                      resources: undefined,
                      gradeReport: undefined,
                    },
                  })
                }
              >
                Reset labels
              </button>
            </Panel>
          ) : null}

          {section === 'hidden' ? (
            <Panel
              title="Hidden assignments"
              description="Work you hid from Better To Do. Schoology's own list is unaffected — nothing here was ever removed from Schoology."
            >
              {hiddenTasks.length === 0 ? (
                <p className="empty">No hidden assignments.</p>
              ) : (
                <ul className="restore-list">
                  {hiddenTasks.map((task) => (
                    <li key={task.id} className="restore-list__item">
                      <span>{task.title}</span>
                      <button
                        type="button"
                        className="btn btn--small"
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
            <Panel title="Splash text" description="A short rotating line above your dashboard.">
              {(
                [
                  ['enabled', 'Enable splash text', 'A rotating heading instead of a fixed greeting.'],
                  ['contextual', 'Contextual lines', 'Match the time, the day, and what is actually due.'],
                  ['holidays', 'Holiday lines', 'Only ever on their matching dates.'],
                  ['easterEggs', 'Easter eggs', 'The rare ones.'],
                ] as const
              ).map(([key, label, hint]) => (
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
              <p className="field__hint" role="status">
                {historyReset
                  ? 'Splash history cleared.'
                  : 'The last ten lines are remembered on this device so they do not repeat.'}
              </p>
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

function TextSetting({
  label,
  hint,
  value,
  placeholder,
  maxLength,
  disabled,
  onCommit,
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

  // Re-sync when storage changes underneath us, without an effect that would
  // render once with a stale value first.
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
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
      />
      {hint ? <span className="field__hint">{hint}</span> : null}
    </label>
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
