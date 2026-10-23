// People get a stable initial on a dark tint of their own hue (identity, not data; DESIGN.md §5).
const hueFor = (id: string): number => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const hue = h % 300;
  return hue >= 230 ? hue + 60 : hue; // skip the violet/indigo band
};

export function Avatar({ id, name, size = 28 }: { id: string; name: string; size?: number }) {
  const hue = hueFor(id);
  return (
    <span
      aria-hidden="true"
      className="inline-flex flex-none items-center justify-center rounded-full font-semibold"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.45),
        background: `hsl(${hue} 22% 20%)`,
        color: `hsl(${hue} 55% 82%)`,
      }}
    >
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
}
