import { useState } from 'react';
import type { BetterSchoologyState, CourseGpaSettings, GradeBand } from '@/src/types/settings';
import type { ResolvedCourse } from '@/src/types';
import { DEFAULT_GRADE_SCALE } from '@/src/storage/defaults';
import { calculateGpa, letterFor } from '@/src/grades';

/**
 * GPA configuration.
 *
 * Every value on this page is the student's own. Schoology publishes no GPA, no
 * grading scale and no course credits, so the panel says that plainly and gives
 * them somewhere to put their school's real numbers.
 */
export interface GradesPanelProps {
  state: BetterSchoologyState;
  courses: ResolvedCourse[];
  onScaleChange: (scale: GradeBand[]) => void;
  onBoostsChange: (boosts: { honors: number; ap: number }) => void;
  onCourseChange: (courseId: string, patch: Partial<CourseGpaSettings>) => void;
  onForgetGrades: () => void;
}

export default function GradesPanel({
  state,
  courses,
  onScaleChange,
  onBoostsChange,
  onCourseChange,
  onForgetGrades,
}: GradesPanelProps) {
  const snapshots = Object.values(state.gradeSnapshots);
  const gpa = calculateGpa(
    snapshots.map((snapshot) => ({
      courseId: snapshot.courseId,
      courseName: state.courses[snapshot.courseId]?.originalName ?? `Course ${snapshot.courseId}`,
      percentage: snapshot.percentage,
    })),
    state.gpa,
  );

  const scale = [...state.gpa.scale].sort((a, b) => b.minPercentage - a.minPercentage);

  return (
    <>
      <p className="callout">
        <strong>This is not an official GPA.</strong> Schoology publishes no GPA, no grading scale
        and no course credits. Better Schoology does the arithmetic on the grades it can see, using
        the scale and credits <em>you</em> set here — all stored on this device. Ask your school for
        the numbers that count.
      </p>

      <h3 className="about__heading">Your grading scale</h3>
      <p className="panel__description">
        Letters and grade points as your school defines them. A percentage is matched to the highest
        band it reaches.
      </p>

      <table className="scale">
        <thead>
          <tr>
            <th scope="col">Letter</th>
            <th scope="col">At least</th>
            <th scope="col">Grade points</th>
            <th scope="col"><span className="visually-hidden">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {scale.map((band, index) => (
            <tr key={`${band.letter}-${band.minPercentage}`}>
              <td>
                <input
                  type="text"
                  className="scale__input scale__input--letter"
                  value={band.letter}
                  aria-label={`Letter for band ${index + 1}`}
                  onChange={(event) =>
                    onScaleChange(replaceBand(scale, index, { letter: event.target.value }))
                  }
                />
              </td>
              <td>
                <input
                  type="number"
                  className="scale__input"
                  step="0.1"
                  value={band.minPercentage}
                  aria-label={`Minimum percentage for ${band.letter}`}
                  onChange={(event) =>
                    onScaleChange(
                      replaceBand(scale, index, { minPercentage: Number(event.target.value) }),
                    )
                  }
                />
                <span className="scale__suffix">%</span>
              </td>
              <td>
                <input
                  type="number"
                  className="scale__input"
                  step="0.1"
                  value={band.points}
                  aria-label={`Grade points for ${band.letter}`}
                  onChange={(event) =>
                    onScaleChange(replaceBand(scale, index, { points: Number(event.target.value) }))
                  }
                />
              </td>
              <td>
                <button
                  type="button"
                  className="btn btn--quiet btn--small"
                  onClick={() => onScaleChange(scale.filter((_, position) => position !== index))}
                  disabled={scale.length <= 1}
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="scale__actions">
        <button
          type="button"
          className="btn btn--small"
          onClick={() =>
            onScaleChange([...scale, { letter: 'New', minPercentage: 0, points: 0 }])
          }
        >
          Add a band
        </button>
        <button
          type="button"
          className="btn btn--quiet btn--small"
          onClick={() => onScaleChange(DEFAULT_GRADE_SCALE.map((band) => ({ ...band })))}
        >
          Reset to the default 4.0 scale
        </button>
      </div>

      <h3 className="about__heading">Honors and AP boosts</h3>
      <p className="panel__description">
        Extra grade points added to a boosted course. Better Schoology always shows the unweighted
        figure alongside, so a boost can never quietly inflate the number.
      </p>
      <div className="boosts">
        <NumberField
          label="Honors"
          value={state.gpa.boosts.honors}
          onChange={(value) => onBoostsChange({ ...state.gpa.boosts, honors: value })}
        />
        <NumberField
          label="AP / IB"
          value={state.gpa.boosts.ap}
          onChange={(value) => onBoostsChange({ ...state.gpa.boosts, ap: value })}
        />
      </div>

      <h3 className="about__heading">Courses</h3>
      <p className="panel__description">
        Credits default to 1.0 per course because Schoology does not expose credits at all. Change
        them to match your school.
      </p>

      {courses.length === 0 ? (
        <p className="empty">
          No courses discovered yet. Visit your Schoology <strong>Grades</strong> page once.
        </p>
      ) : (
        <ul className="gpa-courses">
          {courses.map((course) => {
            const settings = state.gpa.courses[course.id] ?? {};
            const snapshot = state.gradeSnapshots[course.id];
            const letter = letterFor(snapshot?.percentage, state.gpa.scale);

            return (
              <li key={course.id} className="gpa-course">
                <div className="gpa-course__identity">
                  <span className="gpa-course__name">{course.displayName}</span>
                  <span className="gpa-course__grade">
                    {snapshot
                      ? `${snapshot.percentage}%${letter ? ` · ${letter}` : ''}`
                      : 'No grade seen yet'}
                  </span>
                </div>

                <label className="gpa-course__field">
                  <span>Credits</span>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={settings.credits ?? 1}
                    onChange={(event) =>
                      onCourseChange(course.id, { credits: Number(event.target.value) })
                    }
                  />
                </label>

                <label className="gpa-course__field">
                  <span>Boost</span>
                  <select
                    value={String(settings.boost ?? 0)}
                    onChange={(event) =>
                      onCourseChange(course.id, { boost: Number(event.target.value) })
                    }
                  >
                    <option value="0">None</option>
                    <option value={String(state.gpa.boosts.honors)}>
                      Honors (+{state.gpa.boosts.honors})
                    </option>
                    <option value={String(state.gpa.boosts.ap)}>
                      AP / IB (+{state.gpa.boosts.ap})
                    </option>
                  </select>
                </label>

                <label className="gpa-course__include">
                  <input
                    type="checkbox"
                    checked={settings.included ?? true}
                    onChange={(event) =>
                      onCourseChange(course.id, { included: event.target.checked })
                    }
                  />
                  <span>Counts</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      <h3 className="about__heading">Stored grades</h3>
      <p className="panel__description">
        So the dashboard can show a GPA away from the grades page, Better Schoology keeps{' '}
        <strong>one percentage per course</strong> on this device — no assignment names, no
        individual scores, no comments. Nothing is ever uploaded.
      </p>
      <p className="panel__description">
        {snapshots.length === 0
          ? 'Nothing stored yet.'
          : `${snapshots.length} course ${snapshots.length === 1 ? 'percentage' : 'percentages'} stored${
              gpa.gpa !== undefined ? ` · GPA ${gpa.gpa.toFixed(2)}` : ''
            }.`}
      </p>
      <button
        type="button"
        className="btn btn--small"
        onClick={onForgetGrades}
        disabled={snapshots.length === 0}
      >
        Forget stored grades
      </button>
    </>
  );
}

function replaceBand(scale: GradeBand[], index: number, patch: Partial<GradeBand>): GradeBand[] {
  return scale.map((band, position) => (position === index ? { ...band, ...patch } : band));
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));

  const [syncedFrom, setSyncedFrom] = useState(value);
  if (value !== syncedFrom) {
    setSyncedFrom(value);
    setDraft(String(value));
  }

  return (
    <label className="boosts__field">
      <span>{label}</span>
      <input
        type="number"
        step="0.1"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          const next = Number(draft);
          if (Number.isFinite(next)) onChange(next);
          else setDraft(String(value));
        }}
      />
    </label>
  );
}
