// The one motif of the title screen: the notched chip of the original Cyclic artwork (and of the logo
// mark), drawn a screen wide. Its face is a window: whatever is passed as children shows through it.
import type { ReactNode } from 'react';

const NOTCHES = Array.from({ length: 8 }, (_, i) => i * 45);

export function GiantChip({ children, spinning }: { children: ReactNode; spinning: boolean }) {
  return (
    <div className="relative aspect-square w-full select-none">
      <svg
        viewBox="0 0 100 100"
        aria-hidden="true"
        className={`absolute inset-0 size-full ${spinning ? 'motion-safe:animate-[spin_140s_linear_infinite]' : ''}`}
      >
        <circle cx="50" cy="50" r="50" fill="var(--accent)" />
        {NOTCHES.map((deg) => (
          <rect key={deg} x="45.4" y="2.6" width="9.2" height="13" rx="2.2" fill="var(--ground)" transform={`rotate(${deg} 50 50)`} />
        ))}
      </svg>
      {/* The face: 62% of the chip, like the ivory centre of the original chips. */}
      <div className="@container absolute inset-[19%] overflow-hidden rounded-full bg-[var(--sq-dark)]">{children}</div>
    </div>
  );
}

/** The same chip at text size: the menu cursor and list bullets. */
export function ChipCursor({ size = 18, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" className={className}>
      <circle cx="50" cy="50" r="50" fill="var(--accent)" />
      {NOTCHES.map((deg) => (
        <rect key={deg} x="43" y="4" width="14" height="18" rx="3" fill="var(--ground)" transform={`rotate(${deg} 50 50)`} />
      ))}
      <circle cx="50" cy="50" r="27" fill="var(--ground)" />
    </svg>
  );
}
