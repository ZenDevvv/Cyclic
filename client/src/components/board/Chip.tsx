// Chips: "flat" is drawn here in SVG after the original chip art; "classic" is the original art itself.
import { memo } from 'react';
import type { Piece } from '../../../../shared/engine.ts';
import { chipFace } from '../../../../shared/notation.ts';
import type { PieceSet } from '../../store/prefs.ts';
import { plainExponent } from '../ui/MathText.tsx';

const NOTCHES = Array.from({ length: 8 }, (_, i) => i * 45 + 22.5);

const CROWN = 'M30 30 L35 16 L43 25 L50 12 L57 25 L65 16 L70 30 Z';

export const Chip = memo(function Chip({ piece, set = 'flat' }: { piece: Pick<Piece, 'side' | 'unit' | 'value' | 'king'>; set?: PieceSet }) {
  const ring = piece.side === 'red' ? 'var(--red-chip)' : 'var(--blue-chip)';
  // The original art only exists for Grade 7's chips.
  if (set === 'classic' && (piece.unit === 'P' || piece.unit === 'kWh')) {
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
  const { main, sub } = chipFace(piece);
  const exponent = sub?.startsWith('×10') ? sub.slice(3) : null;
  const valueY = piece.king ? (sub ? 56 : 62) : sub ? 50 : 57;
  const mainSize = main.length > 4 ? 17 : sub ? (main.length > 1 ? 22 : 24) : main.length > 2 ? 20 : 23;
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
        fontSize={mainSize}
        fill="var(--chip-ink)"
        letterSpacing="-0.5"
      >
        {main}
      </text>
      {sub && (
        <text
          x="50"
          y={valueY + (exponent ? 15 : 13)}
          textAnchor="middle"
          fontFamily="Inter Variable, system-ui, sans-serif"
          fontWeight="600"
          fontSize={exponent ? 15 : 11}
          fill="var(--chip-ink)"
        >
          {exponent ? (
            <>
              ×10
              <tspan dy="-4" fontSize="11">
                {plainExponent(exponent)}
              </tspan>
            </>
          ) : (
            sub
          )}
        </text>
      )}
    </svg>
  );
});
