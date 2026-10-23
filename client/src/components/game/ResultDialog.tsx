import type { ReactNode } from 'react';
import type { GameResult, Side } from '../../../../shared/engine.ts';
import { END_REASON_TEXT } from '../../../../shared/notation.ts';
import type { RatingChange } from '../../../../shared/protocol.ts';
import { Dialog } from '../ui/Dialog.tsx';
import { SideDot } from '../ui/controls.tsx';
import { peso, signed } from '../../lib/format.ts';
import type { PlayerInfo } from './PlayerStrip.tsx';

interface Props {
  open: boolean;
  onClose: () => void;
  result: GameResult;
  captures: Record<Side, number>;
  players: Record<Side, PlayerInfo | null>;
  mySide: Side | null;
  ratingChange?: RatingChange | null;
  children?: ReactNode;
}

/** "Ana resigned", "Ben ran out of move time", or the generic reason. */
export function resultReason(result: GameResult, players: Record<Side, PlayerInfo | null>): string {
  const loser = result.winner ? players[result.winner === 'red' ? 'blue' : 'red']?.name : null;
  if (loser && result.reason === 'resign') return `${loser} resigned.`;
  if (loser && result.reason === 'timeout') return `${loser} ran out of move time.`;
  if (loser && result.reason === 'abandon') return `${loser} left the game.`;
  return `${END_REASON_TEXT[result.reason]}. The higher total wins.`;
}

export function resultTitle(result: GameResult, players: Record<Side, PlayerInfo | null>, mySide: Side | null): string {
  if (result.winner === null) return 'Draw';
  if (mySide) return result.winner === mySide ? 'You win' : 'You lose';
  return `${players[result.winner]?.name ?? (result.winner === 'red' ? 'Red' : 'Blue')} wins`;
}

export function ResultDialog({ open, onClose, result, captures, players, mySide, ratingChange, children }: Props) {
  const sides: Side[] = mySide === 'blue' ? ['blue', 'red'] : ['red', 'blue'];
  const row = 'grid grid-cols-[minmax(72px,1fr)_minmax(0,124px)_minmax(0,124px)] items-baseline gap-3 py-2 border-b border-rule';
  return (
    <Dialog open={open} onClose={onClose} title={resultTitle(result, players, mySide)} description={resultReason(result, players)} width={480}>
      <div className="mb-5 text-body">
        <div className={`${row} text-meta text-muted`}>
          <span />
          {sides.map((s) => (
            <span key={s} className="flex items-center justify-end gap-1.5 truncate">
              <SideDot side={s} />
              <span className="truncate">{players[s]?.name ?? s}</span>
            </span>
          ))}
        </div>
        <div className={row}>
          <span className="text-muted">Captures</span>
          {sides.map((s) => (
            <span key={s} className="num text-right">
              {peso(captures[s])}
            </span>
          ))}
        </div>
        <div className={row}>
          <span className="text-muted">Chips left</span>
          {sides.map((s) => (
            <span key={s} className="num text-right">
              {peso(result.tally[s].total)}
              <span className="block text-meta text-faint">{result.tally[s].items.length} chips</span>
            </span>
          ))}
        </div>
        <div className={`${row} font-semibold`}>
          <span>Final</span>
          {sides.map((s) => (
            <span key={s} className={`num text-right text-card ${result.winner === s ? 'text-accent' : ''}`}>
              {peso(result.final[s])}
            </span>
          ))}
        </div>
        {ratingChange && (
          <div className={`${row} border-b-0`}>
            <span className="text-muted">Rating</span>
            {sides.map((s) => {
              const d = ratingChange[s].after - ratingChange[s].before;
              return (
                <span key={s} className="num text-right">
                  {ratingChange[s].after}{' '}
                  <span className={d > 0 ? 'text-positive' : d < 0 ? 'text-negative' : 'text-faint'}>{signed(d)}</span>
                </span>
              );
            })}
          </div>
        )}
      </div>
      <div className="flex flex-wrap justify-end gap-2">{children}</div>
    </Dialog>
  );
}
