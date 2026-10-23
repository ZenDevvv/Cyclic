// Chips: "flat" is drawn here in SVG after the original chip art; "classic" is the original art itself.
import { memo } from 'react';
import type { Piece } from '../../../../shared/engine.ts';
import type { PieceSet } from '../../store/prefs.ts';

const NOTCHES = Array.from({ length: 8 }, (_, i) => i * 45 + 22.5);

const CROWN = 'M30 30 L35 16 L43 25 L50 12 L57 25 L65 16 L70 30 Z';

export const Chip = memo(function Chip({ piece, set = 'flat' }: { piece: Pick<Piece, 'side' | 'unit' | 'value' | 'king'>; set?: PieceSet }) {
  const ring = piece.side === 'red' ? 'var(--red-chip)' : 'var(--blue-chip)';
  if (set === 'classic') {
    const src = `/pieces/classic/${piece.side}-${piece.unit === 'P' ? 'p' : 'kwh'}${piece.value}.webp`;
    return (
      <span className="relative block size-full">
        <img src={src} alt="" draggable={false} className="block size-full" />
        {piece.king && (
          <svg viewBox="0 0 100 100" className="absolute -top-[14%] -left-[8%] size-[58%] -rotate-12" aria-hidden="true">
            <path d={CROWN} transform="translate(-50 -21) scale(2)" fill={ring} stroke="var(--chip-face)" strokeWidth="2.5" strokeLinejoin="round" />
          </svg>
        )}
      </span>
    );
  }
  const kwh = piece.unit === 'kWh';
  const valueY = piece.king ? (kwh ? 56 : 62) : kwh ? 50 : 57;
  return (
    <svg viewBox="0 0 100 100" className="block size-full" aria-hidden="true">
      <circle cx="50" cy="50" r="47" fill={ring} />
      <circle cx="50" cy="50" r="46.5" fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth="1.5" />
      {NOTCHES.map((deg) => (
        <rect key={deg} x="45" y="5.5" width="10" height="11" rx="2" fill="var(--chip-face)" opacity="0.92" transform={`rotate(${deg} 50 50)`} />
      ))}
      {piece.king && <circle cx="50" cy="50" r="38.5" fill="none" stroke="var(--chip-face)" strokeWidth="2.5" />}
      <circle cx="50" cy="50" r="31" fill="var(--chip-face)" />
      <circle cx="50" cy="50" r="31" fill="none" stroke="rgba(0,0,0,0.14)" strokeWidth="1.5" />
      {piece.king && <path d={CROWN} transform="translate(0 4)" fill={ring} />}
      <text
        x="50"
        y={valueY}
        textAnchor="middle"
        fontFamily="Inter Variable, system-ui, sans-serif"
        fontWeight="650"
        fontSize={kwh ? (piece.value > 9 ? 22 : 24) : piece.value > 9 ? 20 : 23}
        fill="var(--chip-ink)"
        letterSpacing="-0.5"
      >
        {kwh ? piece.value : `₱${piece.value}`}
      </text>
      {kwh && (
        <text
          x="50"
          y={valueY + 13}
          textAnchor="middle"
          fontFamily="Inter Variable, system-ui, sans-serif"
          fontWeight="600"
          fontSize="11"
          fill="var(--chip-ink)"
        >
          kWh
        </text>
      )}
    </svg>
  );
});
