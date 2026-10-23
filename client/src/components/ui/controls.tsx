import { useId, type InputHTMLAttributes, type ReactNode } from 'react';

/** Room codes are IDs, the one place the monospace stack is used (DESIGN.md §3). */
export const ID_FONT = 'font-mono'; // taste-skill-ignore: IDs only

// ---------------------------------------------------------------- tabs

export function Tabs<T extends string>({
  value,
  onChange,
  options,
  label,
  className = '',
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  label: string;
  className?: string;
}) {
  return (
    <div role="tablist" aria-label={label} className={`flex gap-5 border-b border-rule ${className}`}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={`-mb-px flex h-10 items-center gap-1.5 border-b-2 text-body font-medium transition-colors ${active ? 'border-white text-ink' : 'border-transparent text-muted hover:text-ink'}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- segmented control

export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
  label,
  disabled,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  label: string;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex max-w-full flex-wrap gap-0.5 rounded-full bg-raised p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={`h-10 sm:h-8 rounded-full px-3.5 text-body font-medium whitespace-nowrap transition-colors disabled:opacity-50 ${active ? 'bg-active text-ink' : 'text-muted hover:text-ink'}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- switch

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div className="min-w-0">
        <label htmlFor={id} className="text-body font-medium">
          {label}
        </label>
        {description && <p className="text-meta text-muted">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-10 flex-none rounded-full transition-colors disabled:opacity-50 ${checked ? 'bg-positive' : 'bg-active'}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white transition-transform duration-150 ${checked ? 'translate-x-4' : ''}`}
        />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- fields

export function Field({
  label,
  hint,
  error,
  className = '',
  ...input
}: { label: string; hint?: ReactNode; error?: string | null } & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-2 block text-body font-medium">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={hint || error ? `${id}-note` : undefined}
        className="h-11 sm:h-10 w-full rounded-input border border-control bg-ground px-3 text-body text-ink placeholder:text-faint focus:border-muted focus:outline-none aria-[invalid]:border-negative"
        {...input}
      />
      {(error || hint) && (
        <p id={`${id}-note`} className={`mt-1.5 text-meta ${error ? 'text-negative' : 'text-muted'}`}>
          {error || hint}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- pills, skeletons, dots

const PILL = {
  positive: 'bg-positive-bg text-positive',
  negative: 'bg-negative-bg text-negative',
  warning: 'bg-warning-bg text-warning',
  neutral: 'bg-neutral-bg text-ink',
} as const;

export function Pill({ tone = 'neutral', children }: { tone?: keyof typeof PILL; children: ReactNode }) {
  return <span className={`inline-flex h-6 flex-none items-center rounded-full px-2.5 text-meta font-medium whitespace-nowrap ${PILL[tone]}`}>{children}</span>;
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <span aria-hidden="true" className={`block rounded-chip bg-raised ${className}`} />;
}

export function SideDot({ side, className = '' }: { side: 'red' | 'blue'; className?: string }) {
  return <span aria-hidden="true" className={`inline-block size-2 flex-none rounded-full ${side === 'red' ? 'bg-side-red' : 'bg-side-blue'} ${className}`} />;
}

export function Panel({ title, action, children, className = '', id }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} aria-labelledby={title && id ? `${id}-title` : undefined} className={`rounded-card bg-surface p-5.5 ${className}`}>
      {(title || action) && (
        <div className="mb-3 flex min-h-9 items-center justify-between gap-3">
          {title && (
            <h2 id={id ? `${id}-title` : undefined} className="text-card font-semibold">
              {title}
            </h2>
          )}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function EmptyState({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-panel border border-dashed border-line px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-body text-muted">{children}</p>
      {action}
    </div>
  );
}
