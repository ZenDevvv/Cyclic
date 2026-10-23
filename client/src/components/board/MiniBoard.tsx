// A light SVG thumbnail of a position (lists and cards), drawn from a codec string.
import { memo, useMemo } from 'react';
import { decodeBoard } from '../../../../shared/codec.ts';
import { xOf, yOf } from '../../../../shared/engine.ts';

export const MiniBoard = memo(function MiniBoard({ code, size = 48, orientation = 'red', label }: { code: string; size?: number; orientation?: 'red' | 'blue'; label?: string }) {
  const board = useMemo(() => decodeBoard(code), [code]);
  return (
    <svg width={size} height={size} viewBox="0 0 8 8" role="img" aria-label={label ?? 'Board position'} className="flex-none overflow-hidden rounded-chip" data-board="felt" data-ui>
      <rect width="8" height="8" fill="var(--sq-dark)" />
      {board.map((p, i) => {
        const col = orientation === 'red' ? xOf(i) : 7 - xOf(i);
        const row = orientation === 'red' ? 7 - yOf(i) : yOf(i);
        if ((xOf(i) + yOf(i)) % 2 === 0) return null;
        return (
          <g key={i}>
            <rect x={col} y={row} width="1" height="1" fill="var(--sq-light)" />
            {p && (
              <circle
                cx={col + 0.5}
                cy={row + 0.5}
                r="0.36"
                fill={p.side === 'red' ? 'var(--red-chip)' : 'var(--blue-chip)'}
                stroke={p.king ? 'var(--chip-face)' : 'none'}
                strokeWidth="0.14"
              />
            )}
          </g>
        );
      })}
    </svg>
  );
});
