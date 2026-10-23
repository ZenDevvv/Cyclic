// The Scidama mark: a chip with the rim notches of the original artwork and a division sign.
export function Mark({ size = 22 }: { size?: number }) {
  const notches = Array.from({ length: 8 }, (_, i) => i * 45);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="11" fill="var(--accent)" />
      {notches.map((deg) => (
        <rect key={deg} x="10.6" y="1.4" width="2.8" height="3.4" rx="0.6" fill="var(--ground)" transform={`rotate(${deg} 12 12)`} />
      ))}
      <circle cx="12" cy="12" r="6.2" fill="var(--ground)" />
      <circle cx="12" cy="9.1" r="1.05" fill="var(--accent)" />
      <rect x="8.6" y="11.35" width="6.8" height="1.3" rx="0.65" fill="var(--accent)" />
      <circle cx="12" cy="14.9" r="1.05" fill="var(--accent)" />
    </svg>
  );
}
