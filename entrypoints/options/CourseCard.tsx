import { useState } from 'react';
import type { CourseCustomization, ResolvedCourse } from '@/src/types';
import { isSafeCssColor, isSafeImageUrl } from '@/src/utils/url';

export interface CourseCardProps {
  course: ResolvedCourse;
  customization: CourseCustomization | undefined;
  onChange: (patch: Partial<Omit<CourseCustomization, 'courseId'>>) => void;
  onReset: () => void;
}

/**
 * Editor for one course's personal overrides.
 *
 * Text fields are held in local state and committed on blur so every keystroke
 * is not a storage write. Invalid colors and image URLs are reported inline and
 * never committed -- an unsafe value must not reach storage, let alone the DOM.
 */
export default function CourseCard({ course, customization, onChange, onReset }: CourseCardProps) {
  const [name, setName] = useState(customization?.customName ?? '');
  const [shortName, setShortName] = useState(customization?.shortName ?? '');
  const [imageUrl, setImageUrl] = useState(customization?.imageUrl ?? '');

  /*
   * Re-sync when storage changes underneath us -- a reset, or an edit made in
   * another open view. This is React's documented "adjusting state when a prop
   * changes" pattern rather than an effect: an effect would render once with
   * stale values and then immediately render again.
   */
  const [syncedFrom, setSyncedFrom] = useState(customization);
  if (customization !== syncedFrom) {
    setSyncedFrom(customization);
    setName(customization?.customName ?? '');
    setShortName(customization?.shortName ?? '');
    setImageUrl(customization?.imageUrl ?? '');
  }

  const imageInvalid = imageUrl.trim() !== '' && !isSafeImageUrl(imageUrl);

  return (
    <article className="course" style={accentStyle(course)}>
      <header className="course__header">
        <div>
          <h3 className="course__name">{course.displayName || 'Untitled course'}</h3>
          <p className="course__meta">
            {course.originalName}
            {course.sectionName ? ` · ${course.sectionName}` : ''}
            {` · ID ${course.id}`}
          </p>
        </div>
        <button type="button" className="btn btn--quiet" onClick={onReset}>
          Reset to Schoology defaults
        </button>
      </header>

      <div className="course__grid">
        <Field label="Display name" hint="Shown instead of the Schoology name">
          <input
            type="text"
            value={name}
            placeholder={course.originalName}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => onChange({ customName: name.trim() || undefined })}
          />
        </Field>

        <Field label="Short name" hint="Used on compact surfaces like course cards">
          <input
            type="text"
            value={shortName}
            placeholder={course.displayName}
            onChange={(event) => setShortName(event.target.value)}
            onBlur={() => onChange({ shortName: shortName.trim() || undefined })}
          />
        </Field>

        <Field
          label="Image URL"
          hint="https:// image for your course card"
          error={imageInvalid ? 'Enter an http(s) image URL.' : undefined}
        >
          <input
            type="url"
            value={imageUrl}
            placeholder="https://example.com/cover.jpg"
            aria-invalid={imageInvalid}
            onChange={(event) => setImageUrl(event.target.value)}
            onBlur={() => {
              const trimmed = imageUrl.trim();
              if (trimmed === '') return onChange({ imageUrl: undefined });
              if (isSafeImageUrl(trimmed)) onChange({ imageUrl: trimmed });
            }}
          />
        </Field>

        <ColorField
          label="Accent"
          value={customization?.accentColor}
          onChange={(value) => onChange({ accentColor: value })}
        />
        <ColorField
          label="Card background"
          value={customization?.backgroundColor}
          onChange={(value) => onChange({ backgroundColor: value })}
        />
        <ColorField
          label="Text"
          value={customization?.textColor}
          onChange={(value) => onChange({ textColor: value })}
        />
      </div>

      <div className="course__flags">
        <Checkbox
          label="Pin to top"
          checked={course.pinned}
          onChange={(next) => onChange({ pinned: next || undefined })}
        />
        <Checkbox
          label="Hide from dashboard"
          checked={course.hidden}
          onChange={(next) => onChange({ hidden: next || undefined })}
        />
      </div>
    </article>
  );
}

function accentStyle(course: ResolvedCourse): React.CSSProperties {
  // Colors were validated on the way into storage; this is presentation only.
  return course.accentColor ? { borderLeftColor: course.accentColor } : {};
}

interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}

function Field({ label, hint, error, children }: FieldProps) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
      {error ? (
        <span className="field__error">{error}</span>
      ) : hint ? (
        <span className="field__hint">{hint}</span>
      ) : null}
    </label>
  );
}

interface ColorFieldProps {
  label: string;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
}

function ColorField({ label, value, onChange }: ColorFieldProps) {
  const safe = isSafeCssColor(value) ? value! : '#0677ba';

  return (
    <label className="field field--color">
      <span className="field__label">{label}</span>
      <span className="field__color-row">
        <input
          type="color"
          value={safe}
          onChange={(event) => onChange(event.target.value)}
          aria-label={`${label} color`}
        />
        <button type="button" className="btn btn--quiet btn--small" onClick={() => onChange(undefined)}>
          Clear
        </button>
      </span>
    </label>
  );
}

function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="checkbox">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}
